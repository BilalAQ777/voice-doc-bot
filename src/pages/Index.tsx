import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Settings } from "lucide-react";
import VoiceWaveform from "@/components/VoiceWaveform";
import ConfigUploader from "@/components/ConfigUploader";
import ConversationDisplay from "@/components/ConversationDisplay";
import { useToast } from "@/hooks/use-toast";
import { RealtimeChat } from "@/utils/audioProcessor";
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
  
  const chatRef = useRef<RealtimeChat | null>(null);
  const currentTranscriptRef = useRef("");

  const handleMessage = (event: any) => {
    console.log("Message event:", event.type);
    
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const userText = event.transcript;
      if (userText) {
        setMessages(prev => [...prev, {
          role: 'user',
          content: userText,
          timestamp: new Date()
        }]);
      }
    } else if (event.type === 'response.audio_transcript.delta') {
      currentTranscriptRef.current += event.delta;
    } else if (event.type === 'response.audio_transcript.done') {
      const assistantText = currentTranscriptRef.current;
      if (assistantText) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantText,
          timestamp: new Date()
        }]);
      }
      currentTranscriptRef.current = "";
    } else if (event.type === 'error') {
      console.error("OpenAI error:", event);
      toast({
        title: "Error",
        description: event.error?.message || "An error occurred",
        variant: "destructive",
      });
    }
  };

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

      toast({
        title: "Connecting...",
        description: "Setting up AI receptionist connection",
      });

      const instructions = `You are a professional AI receptionist. Here is your configuration:

${configuration}

CRITICAL RULES:
1. ALWAYS greet the customer first when the call starts. Start speaking immediately with a greeting in German.
2. You can ONLY speak German and English. Default language is German.
3. If the customer speaks English or asks to switch to English, switch to English for the rest of the conversation.
4. Before executing ANY task, you MUST collect: customer name, email, address, and phone number. Ask for these one by one if not provided.
5. Never execute a task without collecting all required customer information first.
6. Be professional, friendly, and efficient.

Use the configuration information to assist callers with their requests.`;

      chatRef.current = new RealtimeChat(handleMessage, setIsSpeaking);
      await chatRef.current.init(instructions);
      
      setIsConnected(true);
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
    chatRef.current?.disconnect();
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
