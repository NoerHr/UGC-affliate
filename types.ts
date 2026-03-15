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

  // Audio Generation (Kling 2.6+ feature)
  enableAudio?: boolean;

  // Resolution Settings
  videoResolution?: '720p' | '1080p';
}

// --- AI Provider System ---
export type AiProvider = 'FAL' | 'GEMINI' | 'PUTER' | 'HUGGINGFACE' | 'POLLINATIONS' | 'PRODIA' | 'TOGETHER';

export interface GenerationState {
  activeProvider: AiProvider;
  selectedImageModel: 'nano-banana-pro' | 'seedream-4.5';
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
  RESULTS = 'RESULTS',
  POSTER = 'POSTER',
  CLIP_EDITOR = 'CLIP_EDITOR'
}

export interface CustomizationOptions {
  background: string;
  backgroundRef: string;
  lightingRef: string;
  neonText: string;
  fontStyle: string;
}

// --- Poster Generator Types ---
export type PosterStyleId =
  | 'cyberpunk' | 'y2k' | 'minimalist' | 'streetwear' | 'retro90s'
  | 'vaporwave' | 'brutalist' | 'cottagecore' | 'hyperpop' | 'film-noir'
  | 'gradient-dream' | 'city-pop' | 'memphis' | 'neo-grunge' | 'clean-luxury';

export type PosterFormat = 'ig-story' | 'ig-feed' | 'tiktok' | 'a4' | 'twitter' | 'yt-thumb';

export type ProductPlacement = 'center-hero' | 'floating' | 'lifestyle' | 'flat-lay' | 'held-by-model' | 'angled-dynamic';

export type BackgroundType = 'solid' | 'gradient' | 'pattern' | 'photo' | 'abstract' | 'none';

export type PosterMood = 'energetic' | 'calm' | 'luxury' | 'playful' | 'dark' | 'dreamy' | 'bold' | 'minimal';

export type PosterLayout = 'centered' | 'split' | 'diagonal' | 'grid-overlay' | 'full-bleed' | 'frame';

export interface PosterConfig {
  styleId: PosterStyleId;
  format: PosterFormat;
  placement: ProductPlacement;
  backgroundType: BackgroundType;
  mood: PosterMood;
  layout: PosterLayout;
  brandName: string;
  tagline: string;
  ctaText: string;
  boldness: number; // 1-10
  variationCount: number; // 1-4
  colorOverride: string;
  mainPrompt: string;
  additionalInstructions: string;
  motionPrompt: string;
}

export interface PosterResult {
  id: string;
  imageUrl: string;
  prompt: string;
  style: PosterStyleId;
  format: PosterFormat;
  videoUrl?: string;
  isAnimating?: boolean;
  animationProgress?: number;
}

export interface PosterState {
  productImage: string | null;
  config: PosterConfig;
  results: PosterResult[];
  isGenerating: boolean;
  generationProgress: number;
}

// --- Clip Editor Types ---
export interface ClipPoint {
  timestamp: number;
  label: string;
}

export interface ClipSegment {
  id: string;
  start: number;
  end: number;
  label: string;
  enabled: boolean;
}

export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slide' | 'zoom';

export interface ClipConfig {
  sourceVideoUrl: string;
  segments: ClipSegment[];
  transition: TransitionType;
  transitionDuration: number;
  outputFormat: 'mp4' | 'webm';
  speed: number;
  enableReverse: boolean;
  loopCount: number;
  addFadeIn: boolean;
  addFadeOut: boolean;
  fadeDuration: number;
}

export interface ClipEditorState {
  videoFile: string | null;
  videoDuration: number;
  clips: ClipSegment[];
  config: ClipConfig;
  previewUrl: string | null;
  isProcessing: boolean;
}
