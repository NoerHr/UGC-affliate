// Prodia API Service — Free tier: 100 gen/day

export const PRODIA_MODELS = [
  { id: 'sdxl', label: 'Stable Diffusion XL', emoji: '🎯' },
  { id: 'sd3', label: 'Stable Diffusion 3', emoji: '🌟' },
];

export async function generateImageViaProdia(
  prompt: string,
  model: string = 'sdxl',
  apiKey: string = ''
): Promise<string> {
  if (!apiKey) throw new Error('Prodia API key required');

  console.log(`🟣 [Prodia] Generating image with: ${model}`);

  try {
    // Create generation job
    const createResponse = await fetch('https://api.prodia.com/v1/sdxl/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prodia-Key': apiKey
      },
      body: JSON.stringify({
        model: model === 'sdxl' ? 'sdxl' : 'sd3',
        prompt,
        negative_prompt: 'blurry, bad quality, distorted, ugly',
        steps: 25,
        cfg_scale: 7,
        width: 1024,
        height: 1024
      })
    });

    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({}));
      throw new Error(err.error || `Prodia API error: ${createResponse.status}`);
    }

    const job = await createResponse.json();
    const jobId = job.job;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const statusResponse = await fetch(`https://api.prodia.com/v1/job/${jobId}`, {
        headers: { 'X-Prodia-Key': apiKey }
      });

      if (!statusResponse.ok) continue;

      const status = await statusResponse.json();
      if (status.status === 'succeeded') {
        return status.imageUrl;
      }
      if (status.status === 'failed') {
        throw new Error('Prodia generation failed');
      }
    }

    throw new Error('Prodia generation timed out');
  } catch (error: any) {
    console.error('❌ [Prodia] Generation failed:', error);
    throw error;
  }
}

export async function validateProdiaKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.prodia.com/v1/sdxl/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prodia-Key': apiKey
      },
      body: JSON.stringify({
        model: 'sdxl',
        prompt: 'test',
        steps: 1,
        width: 128,
        height: 128
      })
    });
    return response.ok || response.status === 402; // 402 = valid key but no credits
  } catch {
    return false;
  }
}

export function getProdiaStatus(key: string | null): 'connected' | 'not-set' {
  return key && key.length > 5 ? 'connected' : 'not-set';
}
