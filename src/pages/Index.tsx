import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Settings } from "lucide-react";
import VoiceWaveform from "@/components/VoiceWaveform";
import ConfigUploader from "@/components/ConfigUploader";
import ConversationDisplay from "@/components/ConversationDisplay";
import { useToast } from "@/hooks/use-toast";
import { AudioRecorder, encodeAudioForAPI, AudioQueue } from "@/utils/audioProcessor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [configuration, setConfiguration] = useState("");
  const { toast } = useToast();
  
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const currentTranscriptRef = useRef("");

  const startConversation = async () => {
    try {
      if (!configuration) {
        toast({
          title: "Configuration Required",
          description: "Please configure your AI receptionist first",
          variant: "destructive",
        });
        return;
      }

      // Request microphone access
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize audio context and queue
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioQueueRef.current = new AudioQueue(audioContextRef.current);

      // Connect to WebSocket
      const ws = new WebSocket(
        `wss://djhnozyevniidpoqdhsd.supabase.co/functions/v1/ai-receptionist`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        
        // Wait for session.created event before sending session.update
        const checkSessionCreated = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.type === 'session.created') {
            console.log("Session created, sending configuration");
            
            // Send session configuration
            ws.send(JSON.stringify({
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                instructions: `You are a professional AI receptionist. Here is your configuration:\n\n${configuration}\n\nUse this information to assist callers with their requests. Be helpful, professional, and execute tasks as defined in your configuration.`,
                voice: 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                  model: 'whisper-1'
                },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 1000
                },
                temperature: 0.8,
                max_response_output_tokens: 'inf'
              }
            }));
            
            ws.removeEventListener('message', checkSessionCreated);
          }
        };
        
        ws.addEventListener('message', checkSessionCreated);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log("Received:", data.type);

        if (data.type === 'response.audio.delta') {
          setIsSpeaking(true);
          const binaryString = atob(data.delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await audioQueueRef.current?.addToQueue(bytes);
        } else if (data.type === 'response.audio.done') {
          setIsSpeaking(false);
        } else if (data.type === 'conversation.item.input_audio_transcription.completed') {
          const userText = data.transcript;
          if (userText) {
            setMessages(prev => [...prev, {
              role: 'user',
              content: userText,
              timestamp: new Date()
            }]);
          }
        } else if (data.type === 'response.audio_transcript.delta') {
          currentTranscriptRef.current += data.delta;
        } else if (data.type === 'response.audio_transcript.done') {
          const assistantText = currentTranscriptRef.current;
          if (assistantText) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: assistantText,
              timestamp: new Date()
            }]);
          }
          currentTranscriptRef.current = "";
        } else if (data.type === 'error') {
          console.error("OpenAI error:", data);
          toast({
            title: "Error",
            description: data.error?.message || "An error occurred",
            variant: "destructive",
          });
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        toast({
          title: "Connection Error",
          description: "Failed to connect to AI receptionist",
          variant: "destructive",
        });
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        setIsConnected(false);
        setIsSpeaking(false);
      };

      // Start audio recording
      recorderRef.current = new AudioRecorder((audioData) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: encodeAudioForAPI(audioData)
          }));
        }
      });
      await recorderRef.current.start();

      toast({
        title: "Connected",
        description: "AI receptionist is now active",
      });
    } catch (error) {
      console.error("Error starting conversation:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start conversation",
        variant: "destructive",
      });
    }
  };

  const endConversation = () => {
    recorderRef.current?.stop();
    wsRef.current?.close();
    audioQueueRef.current?.clear();
    audioContextRef.current?.close();
    setIsConnected(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => {
      endConversation();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            AI Receptionist
          </h1>
          <p className="text-xl text-muted-foreground">
            Intelligent voice assistant for your business
          </p>
        </div>

        <Tabs defaultValue="assistant" className="max-w-6xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="assistant" className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Assistant
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configuration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assistant" className="space-y-8">
            {/* Voice Interface */}
            <div className="flex flex-col items-center gap-8">
              <div className="relative">
                <div className="w-40 h-40 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center border-4 border-primary/30">
                  <div className="w-32 h-32 rounded-full bg-card flex items-center justify-center">
                    <VoiceWaveform isActive={isSpeaking} />
                  </div>
                </div>
                {isConnected && (
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-background animate-pulse" />
                )}
              </div>

              {!isConnected ? (
                <Button
                  onClick={startConversation}
                  size="lg"
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity text-lg px-8 py-6"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Start Call
                </Button>
              ) : (
                <Button
                  onClick={endConversation}
                  size="lg"
                  variant="destructive"
                  className="text-lg px-8 py-6"
                >
                  <PhoneOff className="w-5 h-5 mr-2" />
                  End Call
                </Button>
              )}

              {isConnected && (
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium">
                    {isSpeaking ? "AI is speaking..." : "Listening..."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Speak naturally - the AI will respond automatically
                  </p>
                </div>
              )}
            </div>

            {/* Conversation Display */}
            {messages.length > 0 && (
              <ConversationDisplay messages={messages} />
            )}
          </TabsContent>

          <TabsContent value="settings">
            <ConfigUploader onConfigUpdate={setConfiguration} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
