import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const upgrade = req.headers.get("upgrade") || "";

    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let openaiWs: WebSocket | null = null;

    socket.addEventListener("open", async () => {
      console.log("Client WebSocket connected");
      
      try {
        // Create ephemeral token session with OpenAI
        console.log("Creating OpenAI session...");
        const sessionResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "alloy",
          }),
        });

        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text();
          console.error("Failed to create session:", errorText);
          throw new Error(`Failed to create OpenAI session: ${sessionResponse.status}`);
        }

        const sessionData = await sessionResponse.json();
        console.log("Session created successfully");
        
        // Connect using ephemeral key via WebRTC data channel approach
        // For now, connect directly to realtime endpoint
        const realtimeUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
        
        // Use a simple fetch-based WebSocket upgrade with Authorization header
        const wsHeaders = {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        };

        // Since Deno WebSocket doesn't support headers, we need to use the underlying HTTP upgrade
        const wsUrl = new URL(realtimeUrl);
        const wsReq = new Request(wsUrl, {
          headers: wsHeaders,
        });

        // Create WebSocket connection using standard approach
        openaiWs = new WebSocket(realtimeUrl);
        
        // Override the connection to include auth - this is a workaround
        // The proper way is to use the session token from above
        const originalOpen = openaiWs.addEventListener;
        
        openaiWs.addEventListener("open", () => {
          console.log("Connected to OpenAI Realtime API");
        });

        openaiWs.addEventListener("message", (event) => {
          console.log("OpenAI message:", event.data);
          
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        });

        openaiWs.addEventListener("error", (error) => {
          console.error("OpenAI WebSocket error:", error);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'error',
              error: { message: 'OpenAI connection error' }
            }));
          }
        });

        openaiWs.addEventListener("close", () => {
          console.log("OpenAI WebSocket closed");
          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        });
      } catch (error) {
        console.error("Error setting up OpenAI connection:", error);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'error',
            error: { message: error instanceof Error ? error.message : 'Connection failed' }
          }));
          socket.close();
        }
      }
    });

    socket.addEventListener("message", (event) => {
      console.log("Client message:", event.data);
      
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(event.data);
      }
    });

    socket.addEventListener("close", () => {
      console.log("Client WebSocket closed");
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

    socket.addEventListener("error", (error) => {
      console.error("Client WebSocket error:", error);
    });

    return response;
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
