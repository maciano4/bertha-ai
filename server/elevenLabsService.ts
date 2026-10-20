import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

if (!process.env.ELEVENLABS_API_KEY) {
  console.warn("ELEVENLABS_API_KEY not set. Voice cloning features will not work.");
}

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || ""
});

export interface VoiceCloneOptions {
  name: string;
  description?: string;
  files: Buffer[];
  labels?: Record<string, string>;
}

export interface TextToSpeechOptions {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export class ElevenLabsService {
  /**
   * Create an instant voice clone from audio samples
   * Requires at least 1 audio file (recommended 3-10 clips of 30s-5min each)
   * NOTE: Voice cloning requires a paid ElevenLabs subscription (Creator tier or higher)
   */
  async createVoiceClone(options: VoiceCloneOptions): Promise<{ voiceId: string; name: string }> {
    try {
      console.log(`Creating voice clone: "${options.name}" with ${options.files.length} audio sample(s)`);
      
      if (options.files.length === 0) {
        throw new Error("At least one audio file is required for voice cloning");
      }
      
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      // Add voice metadata
      form.append('name', options.name);
      if (options.description) {
        form.append('description', options.description);
      }
      
      // Add labels as JSON string
      if (options.labels && Object.keys(options.labels).length > 0) {
        form.append('labels', JSON.stringify(options.labels));
      }
      
      // Add audio files
      options.files.forEach((buffer, index) => {
        form.append('files', buffer, {
          filename: `sample_${index}.mp3`,
          contentType: 'audio/mpeg',
        });
      });
      
      // Make direct API call using fetch
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
          ...form.getHeaders(),
        },
        body: form as any,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Voice cloning API error:', errorText);
        
        if (response.status === 401 || response.status === 403) {
          throw new Error("Voice cloning requires a paid ElevenLabs subscription (Creator tier or higher). Please upgrade your plan at elevenlabs.io");
        }
        
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const result: any = await response.json();
      console.log(`✅ Voice clone created successfully: ${result.voice_id}`);
      
      return {
        voiceId: result.voice_id,
        name: options.name
      };
    } catch (error) {
      console.error("Error creating voice clone:", error);
      
      // Provide helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('permission') || error.message.includes('tier') || error.message.includes('subscription')) {
          throw error; // Re-throw subscription errors as-is
        }
        throw new Error(`Failed to create voice clone: ${error.message}`);
      }
      
      throw new Error("Failed to create voice clone: Unknown error");
    }
  }

  /**
   * Get all available voices (both custom and default)
   */
  async listVoices() {
    try {
      const response = await client.voices.getAll();
      return response.voices.map((voice: any) => ({
        voiceId: voice.voice_id || voice.voiceId,
        name: voice.name,
        category: voice.category,
        description: voice.description,
        labels: voice.labels,
        previewUrl: voice.preview_url || voice.previewUrl,
        availableForTiers: voice.available_for_tiers || voice.availableForTiers
      }));
    } catch (error) {
      console.error("Error listing voices:", error);
      throw new Error("Failed to list voices");
    }
  }

  /**
   * Get details of a specific voice
   */
  async getVoice(voiceId: string) {
    try {
      const voice: any = await client.voices.get(voiceId);
      return {
        voiceId: voice.voice_id || voice.voiceId,
        name: voice.name,
        category: voice.category,
        description: voice.description,
        labels: voice.labels,
        previewUrl: voice.preview_url || voice.previewUrl,
        samples: voice.samples
      };
    } catch (error) {
      console.error(`Error getting voice ${voiceId}:`, error);
      throw new Error("Failed to get voice details");
    }
  }

  /**
   * Delete a custom voice
   */
  async deleteVoice(voiceId: string) {
    try {
      await client.voices.delete(voiceId);
      console.log(`✅ Voice ${voiceId} deleted successfully`);
      return true;
    } catch (error) {
      console.error(`Error deleting voice ${voiceId}:`, error);
      throw new Error("Failed to delete voice");
    }
  }

  /**
   * Generate speech from text using a specific voice
   */
  async textToSpeech(options: TextToSpeechOptions): Promise<Buffer> {
    try {
      console.log(`Generating speech with voice ${options.voiceId}: "${options.text.slice(0, 50)}..."`);
      
      const audioStream = await client.textToSpeech.convert(options.voiceId, {
        text: options.text,
        modelId: options.modelId || "eleven_multilingual_v2",
        voiceSettings: {
          stability: options.stability ?? 0.5,
          similarityBoost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.0,
          useSpeakerBoost: options.useSpeakerBoost ?? true
        }
      });

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const reader = audioStream.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      
      const audioBuffer = Buffer.concat(chunks);
      console.log(`✅ Generated ${audioBuffer.length} bytes of audio`);
      
      return audioBuffer;
    } catch (error) {
      console.error("Error generating speech:", error);
      throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Stream speech generation for real-time playback
   */
  async streamTextToSpeech(options: TextToSpeechOptions): Promise<ReadableStream<Uint8Array>> {
    try {
      console.log(`Streaming speech with voice ${options.voiceId}`);
      
      const audioStream = await client.textToSpeech.convert(options.voiceId, {
        text: options.text,
        modelId: options.modelId || "eleven_multilingual_v2",
        voiceSettings: {
          stability: options.stability ?? 0.5,
          similarityBoost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.0,
          useSpeakerBoost: options.useSpeakerBoost ?? true
        }
      });

      return audioStream;
    } catch (error) {
      console.error("Error streaming speech:", error);
      throw new Error("Failed to stream speech");
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats() {
    try {
      const subscription: any = await client.user.subscription;
      return {
        characterCount: subscription.character_count || subscription.characterCount || 0,
        characterLimit: subscription.character_limit || subscription.characterLimit || 0,
        canExtendCharacterLimit: subscription.can_extend_character_limit || subscription.canExtendCharacterLimit || false,
        nextCharacterCountResetUnix: subscription.next_character_count_reset_unix || subscription.nextCharacterCountResetUnix || 0,
        voiceLimit: subscription.voice_limit || subscription.voiceLimit || 0,
        professionalVoiceLimit: subscription.professional_voice_limit || subscription.professionalVoiceLimit || 0,
        canUseInstantVoiceCloning: subscription.can_use_instant_voice_cloning || subscription.canUseInstantVoiceCloning || false,
        availableModels: subscription.available_models || subscription.availableModels || []
      };
    } catch (error) {
      console.error("Error getting usage stats:", error);
      throw new Error("Failed to get usage statistics");
    }
  }
}

// Export singleton instance
export const elevenLabsService = new ElevenLabsService();
