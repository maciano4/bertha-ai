import { randomUUID } from "crypto";

// Voice profile interface
export interface VoiceProfile {
  id: string;
  name: string;
  voiceCharacteristics: {
    pitch?: number;
    rate?: number;
    volume?: number;
    language: string;
  };
  voiceSamples: string[]; // Store sample texts for training
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
}

// Voice matching result
export interface VoiceMatch {
  profileId: string;
  name: string;
  confidence: number;
  characteristics: any;
}

// In-memory storage for voice profiles (can be extended to use database)
class VoiceProfileStorage {
  private profiles = new Map<string, VoiceProfile>();

  // Create a new voice profile
  createProfile(name: string, language: string = 'en-US'): VoiceProfile {
    const profile: VoiceProfile = {
      id: randomUUID(),
      name: name.trim(),
      voiceCharacteristics: {
        language,
      },
      voiceSamples: [],
      createdAt: new Date(),
      lastUsed: new Date(),
      usageCount: 0
    };

    this.profiles.set(profile.id, profile);
    return profile;
  }

  // Add voice training data to a profile
  addVoiceSample(profileId: string, sampleText: string, characteristics?: any): boolean {
    const profile = this.profiles.get(profileId);
    if (!profile) return false;

    profile.voiceSamples.push(sampleText);
    
    // Update characteristics if provided
    if (characteristics) {
      profile.voiceCharacteristics = {
        ...profile.voiceCharacteristics,
        ...characteristics
      };
    }

    return true;
  }

  // Get all voice profiles
  getAllProfiles(): VoiceProfile[] {
    return Array.from(this.profiles.values());
  }

  // Get profile by ID
  getProfile(profileId: string): VoiceProfile | undefined {
    return this.profiles.get(profileId);
  }

  // Find profile by name
  findProfileByName(name: string): VoiceProfile | undefined {
    const profiles = Array.from(this.profiles.values());
    for (const profile of profiles) {
      if (profile.name.toLowerCase() === name.toLowerCase()) {
        return profile;
      }
    }
    return undefined;
  }

  // Update profile usage
  updateUsage(profileId: string): void {
    const profile = this.profiles.get(profileId);
    if (profile) {
      profile.lastUsed = new Date();
      profile.usageCount++;
    }
  }

  // Delete a voice profile
  deleteProfile(profileId: string): boolean {
    return this.profiles.delete(profileId);
  }

  // Simple voice matching based on text patterns and characteristics
  findMatch(spokenText: string, language: string = 'en-US'): VoiceMatch | null {
    let bestMatch: VoiceMatch | null = null;
    let highestScore = 0;

    const profiles = Array.from(this.profiles.values());
    for (const profile of profiles) {
      let score = 0;

      // Language matching (strong indicator)
      if (profile.voiceCharacteristics.language === language) {
        score += 0.3;
      }

      // Text pattern matching
      const textScore = this.calculateTextSimilarity(spokenText, profile.voiceSamples);
      score += textScore * 0.4;

      // Recent usage bonus
      const daysSinceUse = (Date.now() - profile.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUse < 1) score += 0.2;
      else if (daysSinceUse < 7) score += 0.1;

      // Usage frequency bonus
      if (profile.usageCount > 5) score += 0.1;

      if (score > highestScore && score > 0.4) { // Minimum confidence threshold
        highestScore = score;
        bestMatch = {
          profileId: profile.id,
          name: profile.name,
          confidence: Math.min(score, 1.0),
          characteristics: profile.voiceCharacteristics
        };
      }
    }

    return bestMatch;
  }

  // Calculate similarity between spoken text and stored samples
  private calculateTextSimilarity(spokenText: string, samples: string[]): number {
    if (samples.length === 0) return 0;

    const spokenWords = spokenText.toLowerCase().split(/\s+/);
    let totalSimilarity = 0;

    for (const sample of samples) {
      const sampleWords = sample.toLowerCase().split(/\s+/);
      const commonWords = spokenWords.filter(word => 
        sampleWords.includes(word) && word.length > 2
      );
      
      const similarity = commonWords.length / Math.max(spokenWords.length, sampleWords.length);
      totalSimilarity += similarity;
    }

    return totalSimilarity / samples.length;
  }

  // Get voice profile statistics
  getStats() {
    const profiles = this.getAllProfiles();
    return {
      totalProfiles: profiles.length,
      activeProfiles: profiles.filter(p => p.usageCount > 0).length,
      mostUsed: profiles.sort((a, b) => b.usageCount - a.usageCount)[0]?.name || 'None',
      languages: Array.from(new Set(profiles.map(p => p.voiceCharacteristics.language)))
    };
  }
}

// Export singleton instance
export const voiceProfileStorage = new VoiceProfileStorage();

// Helper function to analyze voice input for characteristics
export function analyzeVoiceInput(text: string, language: string) {
  return {
    language,
    wordCount: text.split(/\s+/).length,
    avgWordLength: text.split(/\s+/).reduce((sum, word) => sum + word.length, 0) / text.split(/\s+/).length,
    hasQuestions: text.includes('?'),
    sentiment: text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi') ? 'friendly' : 'neutral'
  };
}