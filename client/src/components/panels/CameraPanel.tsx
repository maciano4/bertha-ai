import { useCamera } from "@/hooks/useCamera";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, CameraOff } from "lucide-react";

export default function CameraPanel() {
  const { isActive, isSupported, error, videoRef, startCamera, stopCamera } = useCamera();

  if (!isSupported) {
    return (
      <Card className="m-4 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Visual Context
            <CameraOff className="h-5 w-5 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40 text-muted-foreground bg-muted rounded-lg">
            <div className="text-center">
              <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Camera not supported</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="camera-feed m-4 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          Visual Context
          <Button
            variant="ghost"
            size="icon"
            onClick={isActive ? stopCamera : startCamera}
            data-testid="button-toggle-camera"
          >
            {isActive ? (
              <Camera className="h-5 w-5 text-accent" />
            ) : (
              <CameraOff className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative bg-muted rounded-lg overflow-hidden">
          {isActive ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-40 object-cover"
              data-testid="video-camera"
            />
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <div className="text-center">
                <Camera className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">
                  {error ? "Camera access denied" : "Click to enable camera"}
                </p>
                {error && (
                  <p className="text-xs text-destructive mt-1">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
