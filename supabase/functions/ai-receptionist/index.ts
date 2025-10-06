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

    const url = new URL(req.url);
    const upgrade = req.headers.get("upgrade") || "";

    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let openaiWs: WebSocket | null = null;

    socket.addEventListener("open", () => {
      console.log("Client WebSocket connected");
      
      // Connect to OpenAI Realtime API
      const openaiUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1"
        }
      });

      openaiWs.addEventListener("open", () => {
        console.log("Connected to OpenAI");
      });

      openaiWs.addEventListener("message", (event) => {
        console.log("OpenAI message:", event.data);
        
        // Forward OpenAI messages to client
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      });

      openaiWs.addEventListener("error", (error) => {
        console.error("OpenAI WebSocket error:", error);
      });

      openaiWs.addEventListener("close", () => {
        console.log("OpenAI WebSocket closed");
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      });
    });

    socket.addEventListener("message", (event) => {
      console.log("Client message:", event.data);
      
      // Forward client messages to OpenAI
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
