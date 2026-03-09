import { WebSocket as WsWebSocket } from 'ws';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { tools as geminiTools } from './tools';

dotenv.config({ path: '../.env' }); // Load from server/.env

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

async function run() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Missing OPENAI_API_KEY in environment variables.");
        return;
    }

    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";
    const session = new WsWebSocket(url, {
        headers: {
            "Authorization": "Bearer " + apiKey,
            "OpenAI-Beta": "realtime=v1"
        }
    });

    session.on('open', () => {
        console.log(`[OpenAI] Session connected`);

        // Initialize session
        session.send(JSON.stringify({
            type: "session.update",
            session: {
                modalities: ["audio", "text"],
                instructions: "You are a helpful assistant.",
                voice: "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: { type: "server_vad" },
                tools: openAITools,
                tool_choice: "auto",
                temperature: 0.6
            }
        }));

        setTimeout(() => {
            console.log("Sending Hello input...");
            session.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "Hello. The user is on the line. Start the conversation with your standard greeting." }]
                }
            }));
            session.send(JSON.stringify({ type: "response.create" }));
        }, 500);
    });

    session.on('message', async (data: any) => {
        const msg = JSON.parse(data.toString());
        console.log("Received event type:", msg.type);
        if (msg.type === "error") {
            console.error("OpenAI Error:", JSON.stringify(msg, null, 2));
        } else if (msg.type === "response.audio.delta") {
            console.log("Received audio delta.");
        } else if (msg.type === "response.done") {
            console.log("Response done:", JSON.stringify(msg, null, 2));
            session.close();
        }
    });

    session.on('close', () => {
        console.log(`[OpenAI] session closed`);
    });

    session.on('error', (err) => {
        console.error(`[OpenAI] session error:`, err);
    });
}

run();
