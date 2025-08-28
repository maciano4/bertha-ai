import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActivityLog {
  id: string;
  timestamp: string;
  message: string;
}

export default function ActivityPanel() {
  const [logs, setLogs] = useState<ActivityLog[]>([
    {
      id: "1",
      timestamp: new Date().toLocaleTimeString(),
      message: "Connected to Bertha AI"
    },
    {
      id: "2", 
      timestamp: new Date().toLocaleTimeString(),
      message: "Speech recognition initialized"
    },
    {
      id: "3",
      timestamp: new Date().toLocaleTimeString(), 
      message: "Camera access granted"
    }
  ]);

  const addLog = (message: string) => {
    const newLog: ActivityLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      message
    };
    setLogs(prev => [...prev, newLog].slice(-20)); // Keep last 20 logs
  };

  // Listen for custom events to add logs
  useEffect(() => {
    const handleWebSearch = () => addLog("Web search performed");
    const handleTranslation = () => addLog("Text translated");
    const handleSpeech = () => addLog("Speech synthesis activated");
    const handleCamera = () => addLog("Camera frame captured");

    window.addEventListener('bertha:websearch', handleWebSearch);
    window.addEventListener('bertha:translation', handleTranslation);
    window.addEventListener('bertha:speech', handleSpeech);
    window.addEventListener('bertha:camera', handleCamera);

    return () => {
      window.removeEventListener('bertha:websearch', handleWebSearch);
      window.removeEventListener('bertha:translation', handleTranslation);
      window.removeEventListener('bertha:speech', handleSpeech);
      window.removeEventListener('bertha:camera', handleCamera);
    };
  }, []);

  return (
    <Card className="m-4 shadow-lg flex-1 min-h-0">
      <CardHeader>
        <CardTitle className="text-base">Activity Log</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-40 px-4 pb-4">
          <div className="space-y-1" data-testid="activity-log">
            {logs.map((log) => (
              <p 
                key={log.id} 
                className="text-xs text-muted-foreground"
                data-testid={`log-${log.id}`}
              >
                [{log.timestamp}] {log.message}
              </p>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
