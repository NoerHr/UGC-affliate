// HuggingFace Inference API Service — Free tier with rate limits

export interface HfModel {
  id: string;
  label: string;
  type: 'image' | 'video';
  emoji: string;
}

export const HF_IMAGE_MODELS: HfModel[] = [
  { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell', type: 'image', emoji: '⚡' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL', type: 'image', emoji: '🎯' },
];

export const HF_VIDEO_MODELS: HfModel[] = [
  { id: 'tencent/HunyuanVideo', label: 'HunyuanVideo', type: 'video', emoji: '🎬' },
  { id: 'Wan-AI/Wan2.1-T2V-14B', label: 'Wan 2.1 T2V', type: 'video', emoji: '🌊' },
];

export async function generateImageViaHuggingFace(
  prompt: string,
  model: string = 'black-forest-labs/FLUX.1-schnell',
  token: string = ''
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log(`🤗 [HuggingFace] Generating image with: ${model}`);

  try {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ inputs: prompt })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 503) {
        throw new Error('Model is loading, please try again in ~30 seconds');
      }
      throw new Error(errorData.error || `HuggingFace API error: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error('❌ [HuggingFace] Generation failed:', error);
    throw error;
  }
}

export async function generateVideoViaHuggingFace(
  imageBase64: string,
  prompt: string,
  model: string = 'tencent/HunyuanVideo',
  token: string = ''
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log(`🤗 [HuggingFace] Generating video with: ${model}`);

  try {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: prompt,
          parameters: { image: imageBase64 }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 503) {
        throw new Error('Video model is loading. Free tier video generation may take longer.');
      }
      throw new Error(errorData.error || `HuggingFace video error: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error('❌ [HuggingFace] Video generation failed:', error);
    throw error;
  }
}

export async function validateHfToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://huggingface.co/api/whoami', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getHfStatus(token: string | null): 'connected' | 'not-set' {
  return token && token.length > 5 ? 'connected' : 'not-set';
}
