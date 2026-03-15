// Video Generation Provider Types
export type VideoProvider = 'VEO_3.1' | 'KLING_2.5' | 'KLING_2.6' | 'WAN_2.5' | 'WAN_2.6' | 'SEEDANCE_PRO' | 'SEEDANCE_1.5_PRO' | 'MINIMAX';

export interface SceneFrame {
  id: number;
  image: string | null;
  videoUrl: string | null;
  isExtracting: boolean;
  isGeneratingVideo: boolean;
  isUpscaling: boolean;
  isEditing: boolean;

  // Reference Image Upload
  referenceImage?: string | null;

  // Video Generation Advanced Fields
  duration: number; // Video duration in seconds
  videoProgress: number;
  bgMusicPrompt?: string;
  dialoguePrompt?: string;
  jsonMode?: boolean;
  jsonPrompt?: string;

  // Audio & Playback Controls
  isVideoMuted?: boolean;
  videoDuration?: string;

  // Video Provider Selection
  selectedVideoProvider?: VideoProvider;

  // NEW: Audio Generation (Kling 2.6+ feature)
  enableAudio?: boolean;  // Toggle for native audio generation

  // NEW: Resolution Settings
  videoResolution?: '720p' | '1080p';  // Video quality setting
}



// --- FAL AI Only System ---
export type AiProvider = 'FAL' | 'GEMINI';

export interface GenerationState {
  // ... existing fields ...
  activeProvider: AiProvider; // Track which provider is active
  selectedImageModel: 'nano-banana-pro' | 'seedream-4.5'; // Image generation model
  modelImage: string | null;
  productImage: string | null;
  promptInstruction: string;
  combinedImage: string | null;
  combinedCandidates: string[] | null;
  brandingText: string;
  stylePrompt: string;
  fontStyle: string;
  textPlacement: string;
  storyboardGrid: string | null;
  scenes: SceneFrame[];
  editPrompts: string[];
  extractionProgress: number;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  REFINE = 'REFINE',
  STORYBOARD = 'STORYBOARD',
  RESULTS = 'RESULTS'
}

export interface CustomizationOptions {
  background: string;
  backgroundRef: string;
  lightingRef: string;
  neonText: string;
  fontStyle: string;
}
