import { WebSocket as WsWebSocket } from 'ws';
import crypto from 'crypto';
import { tools as geminiTools, handleToolCall } from '../tools';
import { getSystemInstruction } from '../prompts';
import { decodeMulaw, encodeMulaw, downsampleTo8k, upsample8kTo24k, upsample16kTo24k } from '../audioUtils';
import { Settings } from '../types';

// Map Gemini tools to OpenAI format
const openAITools = geminiTools.map((t: any) => {
    const properties: any = {};
    if (t.parameters?.properties) {
        for (const [key, prop] of Object.entries(t.parameters.properties)) {
            properties[key] = {
                type: (prop as any).type.toLowerCase(),
                description: (prop as any).description
            };
        }
    }
    return {
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: {
            type: 'object',
            properties,
            required: t.parameters?.required || []
        }
    };
});

export async function handleOpenAISession(clientWs: WsWebSocket, settings: Settings, isTwilio: boolean) {
    let session: WsWebSocket | null = null;
    const sessionId = crypto.randomUUID();
    let pendingClose = false;

    // We assume OPENAI_API_KEY is available in process.env
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Missing OPENAI_API_KEY in environment variables.");
        clientWs.close();
        return null;
    }

    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";
    session = new WsWebSocket(url, {
        headers: {
            "Authorization": "Bearer " + apiKey,
            "OpenAI-Beta": "realtime=v1"
        }
    });

    const closeAndLog = () => {
        try { if (session) session.close(); } catch (_) { }
    };

    session.on('open', () => {
        console.log(`[OpenAI] Session connected [${sessionId}]`);

        const locale = settings.language === 'mk' ? 'mk-MK' : settings.language === 'sl' ? 'sl-SI' : 'en-US';
        const currentDateTimeStr = new Date().toLocaleDateString(locale, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Initialize session
        session?.send(JSON.stringify({
            type: "session.update",
            session: {
                modalities: ["audio", "text"],
                instructions: getSystemInstruction(settings, currentDateTimeStr),
                voice: settings.openaiVoice || "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: { type: "server_vad" },
                tools: openAITools,
                tool_choice: "auto",
                temperature: 0.6
            }
        }));

        // Send initial greeting trigger
        setTimeout(() => {
            session?.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "Hello. The user is on the line. Start the conversation with your standard greeting." }]
                }
            }));
            session?.send(JSON.stringify({ type: "response.create" }));
        }, 500); // Give session a moment to update
    });

    session.on('message', async (data: any) => {
        if (clientWs.readyState !== WsWebSocket.OPEN) return;
        const msg = JSON.parse(data.toString());

        if (msg.type === "response.audio.delta") {
            const audioBuffer = Buffer.from(msg.delta, 'base64');
            if (isTwilio) {
                // OpenAI (PCM 24k) -> Twilio (Mulaw 8k)
                const pcm8k = downsampleTo8k(audioBuffer, 24000);
                const mulaw = encodeMulaw(pcm8k);
                const payload = mulaw.toString('base64');
                clientWs.send(JSON.stringify({
                    event: 'media',
                    streamSid: (clientWs as any).streamSid,
                    media: { payload }
                }));
            } else {
                // Mirror Gemini format for frontend App.tsx
                clientWs.send(JSON.stringify({
                    serverContent: {
                        modelTurn: {
                            parts: [{ inlineData: { data: msg.delta } }]
                        }
                    }
                }));
            }
        } else if (msg.type === "response.function_call_arguments.done") {
            const callId = msg.call_id;
            const name = msg.name;
            const argsStr = msg.arguments;
            let args = {};
            try { args = JSON.parse(argsStr); } catch (e) { }

            console.log(`[OpenAI] Tool call: ${name}`, args);
            if (!isTwilio) {
                clientWs.send(JSON.stringify({ type: 'log', message: `AI calling tool: ${name} with args: ${argsStr}` }));
            }

            const startTime = Date.now();
            const result = await handleToolCall(name, args, settings);
            const duration = Date.now() - startTime;
            console.log(`[PERF] Tool ${name} execution: ${duration}ms`);

            if (!isTwilio) {
                clientWs.send(JSON.stringify({ type: 'log', message: `Tool result: ${result}` }));
                if (name === 'bookAppointment' && result === "Booking successful.") {
                    clientWs.send(JSON.stringify({ type: 'event', name: 'refresh_schedule' }));
                }
            }

            // Send tool result back to OpenAI
            session?.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: String(result)
                }
            }));
            session?.send(JSON.stringify({ type: "response.create" }));

            if (name === 'endCall') {
                if (!isTwilio) clientWs.send(JSON.stringify({ type: 'event', name: 'call_ended' }));
                pendingClose = true;
                setTimeout(() => { if (clientWs.readyState === WsWebSocket.OPEN) { closeAndLog(); clientWs.close(); } }, 4000);
            }
        } else if (msg.type === "input_audio_buffer.speech_started") {
            if (isTwilio) {
                clientWs.send(JSON.stringify({ event: 'clear', streamSid: (clientWs as any).streamSid }));
            } else {
                clientWs.send(JSON.stringify({ serverContent: { interrupted: true } }));
            }
        } else if (msg.type === "response.done") {
            if (msg.response?.status === "failed") {
                const errContext = msg.response.status_details?.error?.message || "Unknown error";
                console.error(`[OpenAI] Response failed:`, errContext);
                if (!isTwilio) {
                    clientWs.send(JSON.stringify({ type: 'log', level: 'error', message: `OpenAI Error: ${errContext}` }));
                }
            }
        } else if (msg.type === "error") {
            console.error(`[OpenAI] error:`, msg.error);
            if (!isTwilio) {
                clientWs.send(JSON.stringify({ type: 'log', level: 'error', message: `OpenAI Error: ${msg.error?.message || 'Unknown'}` }));
            }
        }
    });

    session.on('close', () => {
        console.log(`[OpenAI] session closed [${sessionId}]`);
        closeAndLog();
    });

    session.on('error', (err) => {
        console.error(`[OpenAI] session error [${sessionId}]:`, err);
    });

    const sessionWrapper = {
        sendRealtimeInput: (data: any) => {
            if (session?.readyState === WsWebSocket.OPEN && data.media && data.media.data) {
                const buffer = Buffer.from(data.media.data, 'base64');
                let upsampled: Buffer;
                if (isTwilio) {
                    // Incoming Twilio is 8kHz PCM (already decoded from Mulaw in index.ts)
                    upsampled = upsample8kTo24k(buffer);
                } else {
                    // Incoming Web client is 16kHz PCM
                    upsampled = upsample16kTo24k(buffer);
                }
                session.send(JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: upsampled.toString('base64')
                }));
            } else if (data.text) {
                session?.send(JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                        type: "message",
                        role: "user",
                        content: [{ type: "input_text", text: data.text }]
                    }
                }));
                session?.send(JSON.stringify({ type: "response.create" }));
            }
        },
        close: () => session?.close()
    };

    return { session: sessionWrapper, closeAndLog };
}
