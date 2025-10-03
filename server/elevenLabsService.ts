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
   * Note: Voice cloning must be done through the ElevenLabs website currently.
   * This method is a placeholder for future API support.
   */
  async createVoiceClone(options: VoiceCloneOptions): Promise<{ voiceId: string; name: string }> {
    try {
      console.log(`Voice cloning through API is not yet supported`);
      throw new Error("Voice cloning must be done through the ElevenLabs website. Please visit https://elevenlabs.io to create custom voices.");
    } catch (error) {
      console.error("Error creating voice clone:", error);
      throw new Error(`Failed to create voice clone: ${error instanceof Error ? error.message : "Unknown error"}`);
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
