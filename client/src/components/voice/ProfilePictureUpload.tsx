import { useState } from "react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { UploadResult } from "@uppy/core";

interface ProfilePictureUploadProps {
  profileId: string;
  profileName: string;
  currentPictureUrl?: string;
  onPictureUpdated?: (newUrl: string) => void;
}

export function ProfilePictureUpload({ 
  profileId, 
  profileName, 
  currentPictureUrl, 
  onPictureUpdated 
}: ProfilePictureUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleGetUploadParameters = async () => {
    try {
      const response = await apiRequest('POST', `/api/voice/profiles/${profileId}/picture/upload`);
      const data = await response.json();
      return {
        method: 'PUT' as const,
        url: data.uploadURL
      };
    } catch (error) {
      console.error('Failed to get upload URL:', error);
      throw error;
    }
  };

  const handleComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      setIsUploading(true);
      
      try {
        const uploadedFile = result.successful[0];
        const uploadURL = uploadedFile.uploadURL;

        if (!uploadURL) {
          throw new Error('No upload URL received');
        }

        // Update the voice profile with the new picture
        const updateResponse = await apiRequest('PUT', `/api/voice/profiles/${profileId}/picture`, { profilePictureURL: uploadURL });
        const updateData = await updateResponse.json();

        if (updateData.success) {
          const newPictureUrl = updateData.profilePictureUrl;
          
          toast({
            title: "Profile Picture Updated!",
            description: "Your profile picture has been successfully updated.",
          });

          onPictureUpdated?.(newPictureUrl);
        }
      } catch (error) {
        console.error('Failed to update profile picture:', error);
        toast({
          title: "Upload Failed",
          description: "Failed to update your profile picture. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Profile Picture</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4">
          <Avatar className="w-20 h-20">
            <AvatarImage src={currentPictureUrl} alt={`${profileName}'s profile`} />
            <AvatarFallback className="text-lg font-medium">
              {getInitials(profileName)}
            </AvatarFallback>
          </Avatar>

          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={5242880} // 5MB
            onGetUploadParameters={handleGetUploadParameters}
            onComplete={handleComplete}
            buttonClassName="flex items-center gap-2 text-sm"
          >
            <Camera className="w-4 h-4" />
            {isUploading ? "Uploading..." : currentPictureUrl ? "Change Picture" : "Upload Picture"}
          </ObjectUploader>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Upload a profile picture that will be used as your avatar when Bertha recognizes your voice.
          <br />
          Maximum file size: 5MB. Supported formats: JPG, PNG, GIF.
        </div>
      </CardContent>
    </Card>
  );
}