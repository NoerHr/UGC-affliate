// Together AI Service — Free $5 credits on signup

export const TOGETHER_MODELS = [
  { id: 'black-forest-labs/FLUX.1-schnell-Free', label: 'FLUX.1 Schnell (Free)', emoji: '⚡' },
  { id: 'black-forest-labs/FLUX.1.1-pro', label: 'FLUX 1.1 Pro', emoji: '🚀' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL', emoji: '🎯' },
];

export async function generateImageViaTogether(
  prompt: string,
  model: string = 'black-forest-labs/FLUX.1-schnell-Free',
  apiKey: string = ''
): Promise<string> {
  if (!apiKey) throw new Error('Together AI API key required');

  console.log(`🔵 [Together] Generating image with: ${model}`);

  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt,
        width: 1024,
        height: 1024,
        steps: 4,
        n: 1,
        response_format: 'b64_json'
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Together API error: ${response.status}`);
    }

    const data = await response.json();
    const b64 = data.data?.[0]?.b64_json;
    if (b64) {
      return `data:image/png;base64,${b64}`;
    }

    const url = data.data?.[0]?.url;
    if (url) return url;

    throw new Error('No image in Together response');
  } catch (error: any) {
    console.error('❌ [Together] Generation failed:', error);
    throw error;
  }
}

export async function validateTogetherKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.together.xyz/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getTogetherStatus(key: string | null): 'connected' | 'not-set' {
  return key && key.length > 5 ? 'connected' : 'not-set';
}
