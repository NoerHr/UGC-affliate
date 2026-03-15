// Puter.js Service — 40+ AI models, NO API key, user-pays model
// Requires <script src="https://js.puter.com/v2/"></script> in index.html

declare const puter: any;

export interface PuterModel {
  id: string;
  label: string;
  emoji: string;
}

export const PUTER_IMAGE_MODELS: PuterModel[] = [
  { id: 'dall-e-3', label: 'DALL-E 3', emoji: '🎨' },
  { id: 'gpt-image-1', label: 'GPT Image', emoji: '🖼️' },
  { id: 'flux-schnell', label: 'FLUX.1 Schnell', emoji: '⚡' },
  { id: 'flux-1.1-pro', label: 'FLUX 1.1 Pro', emoji: '🚀' },
  { id: 'stable-diffusion-xl', label: 'SDXL', emoji: '🎯' },
  { id: 'stable-diffusion-3', label: 'SD3', emoji: '🌟' },
];

function isPuterAvailable(): boolean {
  return typeof puter !== 'undefined' && puter?.ai?.txt2img;
}

export async function generateImageViaPuter(
  prompt: string,
  model: string = 'dall-e-3'
): Promise<string> {
  if (!isPuterAvailable()) {
    throw new Error('Puter.js not loaded. Make sure <script src="https://js.puter.com/v2/"></script> is in index.html');
  }

  try {
    console.log(`🟢 [Puter] Generating image with model: ${model}`);
    const result = await puter.ai.txt2img(prompt, { model });

    if (result instanceof Blob) {
      return URL.createObjectURL(result);
    }

    // Handle base64 or URL response
    if (typeof result === 'string') {
      if (result.startsWith('data:') || result.startsWith('http')) {
        return result;
      }
      return `data:image/png;base64,${result}`;
    }

    // Handle object with image property
    if (result?.image) {
      if (result.image instanceof Blob) {
        return URL.createObjectURL(result.image);
      }
      return result.image;
    }

    throw new Error('Unexpected Puter response format');
  } catch (error: any) {
    console.error('❌ [Puter] Generation failed:', error);
    throw new Error(`Puter generation failed: ${error.message}`);
  }
}

export async function listPuterModels(): Promise<string[]> {
  if (!isPuterAvailable()) return [];
  try {
    const models = await puter.ai.models();
    return models?.filter((m: any) => m.type === 'text-to-image')?.map((m: any) => m.id) || [];
  } catch {
    return PUTER_IMAGE_MODELS.map(m => m.id);
  }
}

export function getPuterStatus(): 'available' | 'not-loaded' | 'not-authenticated' {
  if (!isPuterAvailable()) return 'not-loaded';
  try {
    if (puter?.auth?.isSignedIn?.()) return 'available';
    return 'not-authenticated';
  } catch {
    return 'available'; // Assume available if we can't check auth
  }
}

export async function signInPuter(): Promise<boolean> {
  if (!isPuterAvailable()) return false;
  try {
    await puter.auth.signIn();
    return true;
  } catch {
    return false;
  }
}
