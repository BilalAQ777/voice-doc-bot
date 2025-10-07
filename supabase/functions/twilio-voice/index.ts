import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Handle incoming call webhook from Twilio
  if (req.method === 'POST' && url.pathname.endsWith('/incoming')) {
    console.log("Incoming call from Twilio");
    
    // Get the WebSocket URL for this edge function (remove /incoming from path)
    const basePath = url.pathname.replace('/incoming', '');
    const wsUrl = `wss://djhnozyevniidpoqdhsd.supabase.co/functions/v1/twilio-voice`;
    
    console.log("WebSocket URL:", wsUrl);
    
    // Return TwiML to connect the call to our WebSocket
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

    console.log("Returning TwiML:", twiml);

    return new Response(twiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }

  // Handle WebSocket connection for media streaming
  if (req.headers.get("upgrade") === "websocket") {
    console.log("WebSocket connection request");
    
    const { socket: twilioSocket, response } = Deno.upgradeWebSocket(req);
    let openaiWs: WebSocket | null = null;
    let sessionToken: string | null = null;

    twilioSocket.addEventListener("open", async () => {
      console.log("Twilio WebSocket connected");
      
      try {
        // Get ephemeral token from OpenAI
        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
        if (!OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY is not configured');
        }

        // Get configuration from request or use default
        const instructions = `You are a professional AI receptionist.

CRITICAL RULES:
1. ALWAYS greet the customer first when the call starts. Start speaking immediately with a greeting in German.
2. You can ONLY speak German and English. Default language is German.
3. If the customer speaks English or asks to switch to English, switch to English for the rest of the conversation.
4. Before executing ANY task, you MUST collect: customer name, email, address, and phone number. Ask for these one by one if not provided.
5. Never execute a task without collecting all required customer information first.
6. Be professional, friendly, and efficient.`;

        const sessionResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "alloy",
            instructions: instructions,
            modalities: ["audio", "text"],
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1000
            },
            temperature: 0.8,
          }),
        });

        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text();
          console.error("Failed to create session:", errorText);
          throw new Error(`Failed to create OpenAI session: ${sessionResponse.status}`);
        }

        const sessionData = await sessionResponse.json();
        sessionToken = sessionData.client_secret?.value;
        console.log("Session created successfully");

        if (!sessionToken) {
          throw new Error("No session token received");
        }

        // Connect to OpenAI Realtime API with ephemeral token
        const openaiUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
        openaiWs = new WebSocket(openaiUrl);

        openaiWs.addEventListener("open", () => {
          console.log("Connected to OpenAI Realtime API");
        });

        openaiWs.addEventListener("message", (event) => {
          const data = JSON.parse(event.data);
          console.log("OpenAI message type:", data.type);

          // Forward audio from OpenAI to Twilio
          if (data.type === 'response.audio.delta' && data.delta) {
            if (twilioSocket.readyState === WebSocket.OPEN) {
              twilioSocket.send(JSON.stringify({
                event: 'media',
                streamSid: 'stream',
                media: {
                  payload: data.delta
                }
              }));
            }
          }

          // Log transcripts
          if (data.type === 'conversation.item.input_audio_transcription.completed') {
            console.log("User said:", data.transcript);
          }
          if (data.type === 'response.audio_transcript.done') {
            console.log("AI said:", data.transcript);
          }
        });

        openaiWs.addEventListener("error", (error) => {
          console.error("OpenAI WebSocket error:", error);
        });

        openaiWs.addEventListener("close", () => {
          console.log("OpenAI WebSocket closed");
          if (twilioSocket.readyState === WebSocket.OPEN) {
            twilioSocket.close();
          }
        });

      } catch (error) {
        console.error("Error setting up OpenAI connection:", error);
        if (twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.close();
        }
      }
    });

    twilioSocket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle Twilio events
        if (message.event === 'start') {
          console.log("Twilio stream started:", message.start.streamSid);
        } else if (message.event === 'media' && openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          // Forward audio from Twilio to OpenAI
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: message.media.payload
          }));
        } else if (message.event === 'stop') {
          console.log("Twilio stream stopped");
        }
      } catch (error) {
        console.error("Error processing Twilio message:", error);
      }
    });

    twilioSocket.addEventListener("close", () => {
      console.log("Twilio WebSocket closed");
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

    twilioSocket.addEventListener("error", (error) => {
      console.error("Twilio WebSocket error:", error);
    });

    return response;
  }

  return new Response("Invalid request", { status: 400 });
});
