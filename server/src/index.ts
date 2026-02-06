import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { tools, handleToolCall } from './tools';
import { getSystemInstruction } from './prompts';
import { decodeMulaw, encodeMulaw, downsampleTo8k, upsampleTo16k } from './audioUtils';
import { Settings } from './types';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { GEMINI_MODEL } from './constants';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
import { fetchAvailabilityRange } from './services/calendlyService';
import { getCompanySettings } from './services/supabaseService';

app.use(express.urlencoded({ extended: true })); // For Twilio webhooks
app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// API Endpoint to get Schedule
// Expects: token, eventTypeUri (or fetch all?), workingHours (json string or use default?)
// For simplicity in this demo, we accept a POST to pass user settings easily.
app.post('/api/schedule', async (req, res) => {
    try {
        const { token, eventTypeIds, workingHours, days } = req.body;

        if (!token) {
            res.status(400).json({ error: 'Missing Calendly Token' });
            return;
        }

        // Default range: Today + 90 days, or customized by 'days' param
        const startDate = new Date().toISOString();
        const durationDays = days ? parseInt(days, 10) : 90;
        const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

        // Use the first selected event type or just check generic availability if none provided?
        // fetchAvailabilityRange requires an eventTypeUri for some internal logic maybe, but mostly for duration?
        // Let's use loop over eventTypeIds if provided, or fail if missing?
        // For MVP, if no IDs, we can't book specific things, but maybe we can just show "Available" slots?
        // Actually fetchAvailabilityRange params: token, eventTypeUri, startDate, endDate, workingHours

        let uri = '';
        if (eventTypeIds && eventTypeIds.length > 0) {
            // We need the full URI, but settings might just have IDs? 
            // In calendlyService.getEventTypes we stripped ID from URI.
            // Ideally frontend passes the full URI or we reconstruct/fetch it.
            // Let's assume frontend passes what it has.
            // If we don't have a URI, we might fallback or error.
            // For now, let's fetch event types to find a valid URI if not provided?
            // That's too slow.
            // Let's assume the frontend passes a valid URI or we default to empty string if the service handles it.
            uri = eventTypeIds[0]; // Assumption
        }

        // If we really don't have a uri, fetchAvailabilityRange might fail if it relies on it. 
        // Checking code: it uses it for `checkAvailability` (duration?) but `fetchAvailabilityRange` logic:
        // 1. Get User URI via /users/me
        // 2. Get Busy Times & Scheduled Events
        // 3. Generate slots based on working hours & busy times.
        // It DOES NOT seem to use `eventTypeUri` for the busy time check itself! 
        // It calculates slots based on 1 hour fixed duration in the loop: `slotEnd.setHours(hour + 1, ...)`
        // So passing an empty string might be fine for the visual calendar.

        const schedule = await fetchAvailabilityRange(token, uri, startDate, endDate, workingHours);
        res.json({ schedule });
    } catch (error: any) {
        console.error("Error in /api/schedule:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update Settings Endpoint
app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        // Basic validation
        if (!settings || typeof settings !== 'object') {
            res.status(400).json({ error: 'Invalid settings data' });
            return;
        }

        const { updateCompanySettings } = await import('./services/supabaseService');
        const success = await updateCompanySettings(settings);

        if (success) {
            res.json({ status: 'success' });
        } else {
            res.status(500).json({ error: 'Failed to update settings in database' });
        }
    } catch (error: any) {
        console.error("Error in /api/settings:", error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY as string });
// GEMINI_MODEL imported from constants.ts

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const wss = new WebSocketServer({ server });

// Function to handle Gemini Session
async function handleGeminiSession(ws: WebSocket, settings: Settings, isTwilio: boolean) {
    let session: any = null;

    // Connect to Gemini
    try {
        const now = new Date();
        const locale = settings.language === 'mk' ? 'mk-MK' : settings.language === 'sl' ? 'sl-SI' : 'en-US';
        const currentDateTimeStr = now.toLocaleDateString(locale, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const sessionPromise = genAI.live.connect({
            model: GEMINI_MODEL,
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } }
                },
                temperature: 0.7,
                systemInstruction: getSystemInstruction(settings, currentDateTimeStr),
                tools: [{ functionDeclarations: tools }],
            },
            callbacks: {
                onopen: () => {
                    console.log("Gemini session connected");
                },
                onmessage: async (msg: LiveServerMessage) => {
                    if (ws.readyState !== WebSocket.OPEN) return;

                    // Handle Audio
                    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                        const audioBuffer = Buffer.from(audioData, 'base64');

                        if (isTwilio) {
                            // Gemini (PCM 24k) -> Twilio (Mulaw 8k)
                            // 1. Downsample 24k -> 8k
                            const pcm8k = downsampleTo8k(audioBuffer, 24000);
                            // 2. Encode Mulaw
                            const mulaw = encodeMulaw(pcm8k);
                            // 3. Send to Twilio
                            const payload = mulaw.toString('base64');
                            ws.send(JSON.stringify({
                                event: 'media',
                                streamSid: (ws as any).streamSid,
                                media: { payload }
                            }));
                        } else {
                            // Web Client: Forward message
                            ws.send(JSON.stringify(msg));
                        }
                    }

                    // Handle Interrupt
                    if (msg.serverContent?.interrupted) {
                        console.log("Gemini interrupted");
                        if (isTwilio) {
                            ws.send(JSON.stringify({ event: 'clear', streamSid: (ws as any).streamSid }));
                        } else {
                            ws.send(JSON.stringify(msg));
                        }
                    }

                    // Handle Tool Calls
                    if (msg.toolCall && msg.toolCall.functionCalls) {
                        for (const fc of msg.toolCall.functionCalls) {
                            if (!fc.name) continue;
                            console.log(`Tool call: ${fc.name}`);
                            if (!isTwilio) {
                                ws.send(JSON.stringify({ type: 'log', message: `AI calling tool: ${fc.name}` }));
                            }

                            const startTime = Date.now();
                            const result = await handleToolCall(fc.name, fc.args, settings);
                            const duration = Date.now() - startTime;
                            console.log(`[PERF] Tool ${fc.name} execution: ${duration}ms`);
                            console.log(`Tool result: ${result}`);

                            if (!isTwilio) {
                                ws.send(JSON.stringify({ type: 'log', message: `Tool result: ${result}` }));
                                if (fc.name === 'bookAppointment' && result === "Booking successful.") {
                                    ws.send(JSON.stringify({ type: 'event', name: 'refresh_schedule' }));
                                }
                            }

                            session.sendToolResponse({
                                functionResponses: {
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result }
                                }
                            });
                        }
                    }
                },
                onclose: (event) => {
                    console.log("Gemini session closed", event);
                },
                onerror: (err) => {
                    console.error("Gemini session error:", err);
                }
            }
        });

        session = await sessionPromise;
        session.sendRealtimeInput({ text: "Hello. The user is on the line. Start the conversation with your standard greeting." });

    } catch (err) {
        console.error("Gemini connect error:", err);
        ws.close();
        return;
    }

    return session;
}


wss.on('connection', (ws, req) => {
    console.log(`New connection from ${req.url}`);

    let geminiSession: any = null;
    let currentSettings: Settings = { ...DEFAULT_SETTINGS };
    let isTwilio = false;
    let streamSid = '';

    if (req.url === '/media-stream') {
        isTwilio = true;
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            // 1. Web Client Setup
            if (data.type === 'setup' && !isTwilio) {
                console.log("Web Client Setup");
                currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
                if (!currentSettings.services) currentSettings.services = [];
                geminiSession = await handleGeminiSession(ws, currentSettings, false);
            }

            // 2. Web Client Audio (Input)
            if (data.realtimeInput && !isTwilio) {
                if (geminiSession) {
                    // Forward directly to Gemini
                    // data.realtimeInput has { media: { data: base64, mimeType: ... } }
                    geminiSession.sendRealtimeInput(data.realtimeInput);
                }
            }

            // 3. Twilio Events
            if (isTwilio) {
                if (data.event === 'start') {
                    console.log("Twilio Stream Started", data.start.streamSid);
                    streamSid = data.start.streamSid;
                    (ws as any).streamSid = streamSid;

                    // Fetch settings from DB for Twilio calls
                    const dbSettings = await getCompanySettings();
                    if (dbSettings) {
                        console.log("Loaded settings from Supabase for Twilio session");
                        currentSettings = { ...DEFAULT_SETTINGS, ...dbSettings };
                    } else {
                        console.log("Using default settings (Supabase fetch failed or returned null)");
                    }

                    // Connect Gemini Here 
                    geminiSession = await handleGeminiSession(ws, currentSettings, true);
                } else if (data.event === 'media' && geminiSession) {
                    // Twilio (Mulaw 8k) -> Gemini (PCM 16k)
                    const payload = Buffer.from(data.media.payload, 'base64');
                    // 1. Decode Mulaw -> PCM 8k
                    const pcm8k = decodeMulaw(payload);
                    // 2. Upsample 8k -> 16k
                    const pcm16k = upsampleTo16k(pcm8k);

                    geminiSession.sendRealtimeInput({
                        media: {
                            data: pcm16k.toString('base64'),
                            mimeType: "audio/pcm;rate=16000"
                        }
                    });
                } else if (data.event === 'stop') {
                    console.log("Twilio Stream Stopped");
                    ws.close();
                }
            }

        } catch (e) {
            console.error("Error processing message:", e);
        }
    });

    ws.on('close', () => {
        console.log("Client disconnected");
        if (geminiSession) {
            // geminiSession.close();
        }
    });
});

// Twilio Voice Handler
app.post('/voice', (req, res) => {
    console.log("Incoming Call:", req.body);
    // TwiML Response
    // Use host from headers to construct WSS URL
    const host = req.headers.host;
    const twiml = `
<Response>
    <Connect>
        <Stream url="wss://${host}/media-stream" />
    </Connect>
</Response>
    `;
    res.type('text/xml');
    res.send(twiml);
});

// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});
