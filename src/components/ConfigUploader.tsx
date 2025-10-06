import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ConfigUploaderProps {
  onConfigUpdate: (config: string) => void;
}

const ConfigUploader = ({ onConfigUpdate }: ConfigUploaderProps) => {
  const [config, setConfig] = useState("");
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setConfig(content);
      toast({
        title: "Configuration Loaded",
        description: `Successfully loaded ${file.name}`,
      });
    };
    reader.readAsText(file);
  };

  const handleSave = () => {
    if (!config.trim()) {
      toast({
        title: "Error",
        description: "Please enter or upload a configuration",
        variant: "destructive",
      });
      return;
    }
    
    onConfigUpdate(config);
    toast({
      title: "Configuration Updated",
      description: "AI receptionist has been configured with your settings",
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Configuration Settings
        </CardTitle>
        <CardDescription>
          Upload or paste your business configuration and task definitions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor="file-upload" className="cursor-pointer">
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload configuration file (.txt)
              </p>
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".txt"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        <Textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          placeholder="Or paste your configuration here...

Example format:
=== BUSINESS INFORMATION ===
Business Name: La Bella Restaurant
Address: 123 Main Street, City
Phone: (555) 123-4567
Hours: Mon-Sat 11am-10pm, Sun 12pm-9pm

=== AVAILABLE TASKS ===
1. book_table - Book a table for dining
2. order_food - Place a takeout order
3. leave_message - Leave a message for the owner
4. check_hours - Check operating hours
5. get_directions - Get directions to restaurant"
          className="min-h-[300px] font-mono text-sm"
        />

        <Button onClick={handleSave} className="w-full">
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
};

export default ConfigUploader;
