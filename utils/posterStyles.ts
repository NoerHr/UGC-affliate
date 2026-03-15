import type { PosterStyleId, PosterFormat, ProductPlacement, BackgroundType, PosterMood, PosterLayout } from '../types';

export interface PosterStyleDef {
  id: PosterStyleId;
  name: string;
  emoji: string;
  vibe: string;
  colors: string[]; // hex palette
  promptTemplate: string;
}

export const POSTER_STYLES: PosterStyleDef[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    emoji: '🌆',
    vibe: 'neon-soaked dystopian future',
    colors: ['#ff00ff', '#00ffff', '#0a0a2e', '#ff2d95'],
    promptTemplate: 'Cyberpunk aesthetic, neon lights, rain-slicked streets, holographic overlays, electric blue and hot pink palette, futuristic dystopian cityscape, glitch effects, sharp contrast'
  },
  {
    id: 'y2k',
    name: 'Y2K',
    emoji: '💿',
    vibe: 'early 2000s digital nostalgia',
    colors: ['#ff69b4', '#87ceeb', '#c0c0c0', '#fff700'],
    promptTemplate: 'Y2K aesthetic, glossy chrome surfaces, baby pink and sky blue, butterfly motifs, metallic textures, frosted glass, early internet vibes, bubbly typography'
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    emoji: '⬜',
    vibe: 'clean, breathable, less is more',
    colors: ['#ffffff', '#f5f5f5', '#1a1a1a', '#e0e0e0'],
    promptTemplate: 'Minimalist design, ample white space, clean lines, subtle shadows, monochrome palette, elegant simplicity, modern sans-serif, breathing room'
  },
  {
    id: 'streetwear',
    name: 'Streetwear',
    emoji: '🧢',
    vibe: 'urban culture meets high fashion',
    colors: ['#000000', '#ff4500', '#ffffff', '#333333'],
    promptTemplate: 'Streetwear aesthetic, urban grit, bold graphics, oversized typography, concrete textures, graffiti elements, raw and edgy, high contrast black and red'
  },
  {
    id: 'retro90s',
    name: 'Retro 90s',
    emoji: '📼',
    vibe: 'nostalgic 90s vibes',
    colors: ['#ff6b35', '#004e64', '#ffd700', '#9b5de5'],
    promptTemplate: '90s retro aesthetic, VHS texture, warm orange and teal, geometric shapes, chunky fonts, nostalgic grain, pop culture references, vibrant and bold'
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    emoji: '🌴',
    vibe: 'surreal digital dreamscape',
    colors: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff'],
    promptTemplate: 'Vaporwave aesthetic, pastel gradients, Greek statues, palm trees, sunset grids, retro-futuristic, Windows 95 vibes, pink purple and teal'
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    emoji: '🏗️',
    vibe: 'raw, unpolished, anti-design',
    colors: ['#000000', '#ffffff', '#ff0000', '#808080'],
    promptTemplate: 'Brutalist design, raw concrete textures, stark black and white, oversized mono type, intentionally rough, anti-aesthetic, bold red accents, no polish'
  },
  {
    id: 'cottagecore',
    name: 'Cottagecore',
    emoji: '🌿',
    vibe: 'pastoral countryside charm',
    colors: ['#8fbc8f', '#f5deb3', '#deb887', '#2e8b57'],
    promptTemplate: 'Cottagecore aesthetic, soft pastoral tones, wildflowers, linen textures, warm earth tones, vintage botanical, hand-drawn elements, cozy and natural'
  },
  {
    id: 'hyperpop',
    name: 'Hyperpop',
    emoji: '💥',
    vibe: 'chaotic maximalist explosion',
    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
    promptTemplate: 'Hyperpop aesthetic, maximalist chaos, clashing neon colors, distorted elements, emoji overload, glitch art, sensory overload, explosive and loud'
  },
  {
    id: 'film-noir',
    name: 'Film Noir',
    emoji: '🎬',
    vibe: 'moody black and white cinema',
    colors: ['#1a1a2e', '#e0e0e0', '#c0c0c0', '#2c2c2c'],
    promptTemplate: 'Film noir aesthetic, dramatic shadows, high contrast black and white, venetian blind light patterns, smoky atmosphere, mysterious and moody, classic cinema'
  },
  {
    id: 'gradient-dream',
    name: 'Gradient Dream',
    emoji: '🌈',
    vibe: 'smooth flowing color transitions',
    colors: ['#667eea', '#764ba2', '#f97316', '#06b6d4'],
    promptTemplate: 'Gradient dream aesthetic, smooth flowing color transitions, aurora-like gradients, dreamy soft focus, holographic sheen, iridescent surfaces, ethereal glow'
  },
  {
    id: 'city-pop',
    name: 'City Pop',
    emoji: '🏙️',
    vibe: '80s Japanese urban nostalgia',
    colors: ['#ff6b9d', '#c44569', '#f8b500', '#2c3e50'],
    promptTemplate: 'City pop aesthetic, 80s Japanese illustration style, sunset skylines, retro anime vibes, warm oranges and pinks, vinyl record nostalgia, smooth and groovy'
  },
  {
    id: 'memphis',
    name: 'Memphis',
    emoji: '🔺',
    vibe: 'bold geometric 80s design',
    colors: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#2c3e50'],
    promptTemplate: 'Memphis design aesthetic, bold geometric shapes, squiggly lines, terrazzo patterns, primary color blocks, postmodern playfulness, confetti elements'
  },
  {
    id: 'neo-grunge',
    name: 'Neo-Grunge',
    emoji: '🎸',
    vibe: 'modern take on 90s rebellion',
    colors: ['#1a1a1a', '#8b0000', '#dcdcdc', '#4a4a4a'],
    promptTemplate: 'Neo-grunge aesthetic, distressed textures, torn paper edges, dark moody palette, rebellious energy, ink splatter, raw typography, dark red and black'
  },
  {
    id: 'clean-luxury',
    name: 'Clean Luxury',
    emoji: '✨',
    vibe: 'premium elegance and sophistication',
    colors: ['#1a1a1a', '#d4af37', '#f5f5f5', '#2c2c2c'],
    promptTemplate: 'Clean luxury aesthetic, premium gold accents, elegant serif typography, marble textures, sophisticated black and gold, high-end product photography, refined and polished'
  }
];

export interface FormatDef {
  id: PosterFormat;
  label: string;
  width: number;
  height: number;
  aspect: string;
}

export const POSTER_FORMATS: FormatDef[] = [
  { id: 'ig-story', label: 'IG Story', width: 1080, height: 1920, aspect: '9:16' },
  { id: 'ig-feed', label: 'IG Feed', width: 1080, height: 1080, aspect: '1:1' },
  { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, aspect: '9:16' },
  { id: 'a4', label: 'A4 Print', width: 2480, height: 3508, aspect: '1:1.41' },
  { id: 'twitter', label: 'Twitter/X', width: 1200, height: 675, aspect: '16:9' },
  { id: 'yt-thumb', label: 'YT Thumb', width: 1280, height: 720, aspect: '16:9' }
];

export interface PlacementDef {
  id: ProductPlacement;
  label: string;
  description: string;
}

export const PRODUCT_PLACEMENTS: PlacementDef[] = [
  { id: 'center-hero', label: 'Center Hero', description: 'Product front and center, bold and dominant' },
  { id: 'floating', label: 'Floating', description: 'Product floating with shadow, ethereal feel' },
  { id: 'lifestyle', label: 'Lifestyle', description: 'Product in natural use context' },
  { id: 'flat-lay', label: 'Flat Lay', description: 'Top-down arrangement with props' },
  { id: 'held-by-model', label: 'Held by Model', description: 'Model holding/wearing the product' },
  { id: 'angled-dynamic', label: 'Angled Dynamic', description: 'Tilted angle with motion blur' }
];

export interface MoodDef {
  id: PosterMood;
  label: string;
  emoji: string;
}

export const POSTER_MOODS: MoodDef[] = [
  { id: 'energetic', label: 'Energetic', emoji: '⚡' },
  { id: 'calm', label: 'Calm', emoji: '🌊' },
  { id: 'luxury', label: 'Luxury', emoji: '💎' },
  { id: 'playful', label: 'Playful', emoji: '🎪' },
  { id: 'dark', label: 'Dark', emoji: '🌑' },
  { id: 'dreamy', label: 'Dreamy', emoji: '☁️' },
  { id: 'bold', label: 'Bold', emoji: '🔥' },
  { id: 'minimal', label: 'Minimal', emoji: '◻️' }
];

export interface LayoutDef {
  id: PosterLayout;
  label: string;
}

export const POSTER_LAYOUTS: LayoutDef[] = [
  { id: 'centered', label: 'Centered' },
  { id: 'split', label: 'Split Screen' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'grid-overlay', label: 'Grid Overlay' },
  { id: 'full-bleed', label: 'Full Bleed' },
  { id: 'frame', label: 'Framed' }
];

export const BACKGROUND_TYPES: { id: BackgroundType; label: string }[] = [
  { id: 'solid', label: 'Solid Color' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'photo', label: 'Photo' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'none', label: 'Transparent' }
];

export const QUICK_PROMPT_CHIPS = [
  'luxury feel', 'street style', 'minimalist clean', 'neon glow',
  'vintage film', 'high fashion', 'tropical vibes', 'dark moody',
  'pastel soft', 'chrome metallic', 'hand-drawn', 'watercolor'
];

export const MOTION_PROMPT_CHIPS = [
  'slow zoom in', 'pan left to right', 'particles floating', 'dramatic reveal',
  'parallax depth', 'text animation', 'light sweep', 'rotate 360',
  'glitch transition', 'smoke effect', 'bokeh drift', 'pulse beat'
];

export function buildPosterPrompt(config: {
  style: PosterStyleDef;
  format: FormatDef;
  placement: PlacementDef;
  mood: MoodDef;
  layout: LayoutDef;
  bgType: string;
  brandName: string;
  tagline: string;
  ctaText: string;
  boldness: number;
  mainPrompt: string;
  additionalInstructions: string;
}): string {
  const parts = [
    `Create a stunning ${config.format.aspect} advertising poster.`,
    config.style.promptTemplate,
    `Product placement: ${config.placement.description}.`,
    `Layout: ${config.layout.label} composition.`,
    `Mood: ${config.mood.label}, ${config.mood.emoji} vibes.`,
    `Background: ${config.bgType} style.`,
    config.boldness > 7 ? 'Extra bold, high impact, attention-grabbing.' : config.boldness > 4 ? 'Balanced boldness with refined details.' : 'Subtle and understated elegance.',
  ];

  if (config.brandName) parts.push(`Brand name "${config.brandName}" prominently displayed.`);
  if (config.tagline) parts.push(`Tagline: "${config.tagline}".`);
  if (config.ctaText) parts.push(`Call to action: "${config.ctaText}".`);
  if (config.mainPrompt) parts.push(config.mainPrompt);
  if (config.additionalInstructions) parts.push(config.additionalInstructions);

  parts.push('Professional quality, print-ready, high resolution, commercial grade advertisement.');

  return parts.join(' ');
}

export function getDefaultPosterConfig() {
  return {
    styleId: 'clean-luxury' as PosterStyleId,
    format: 'ig-story' as PosterFormat,
    placement: 'center-hero' as ProductPlacement,
    backgroundType: 'gradient' as BackgroundType,
    mood: 'luxury' as PosterMood,
    layout: 'centered' as PosterLayout,
    brandName: '',
    tagline: '',
    ctaText: '',
    boldness: 5,
    variationCount: 2,
    colorOverride: '',
    mainPrompt: '',
    additionalInstructions: '',
    motionPrompt: ''
  };
}
