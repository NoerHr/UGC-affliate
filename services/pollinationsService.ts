// Pollinations.ai Service — 100% free, no API key, no login
// Uses simple URL-based image generation

export async function generateImageViaPollinations(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  console.log('🌸 [Pollinations] Generating image...');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Pollinations returned ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error('❌ [Pollinations] Generation failed:', error);
    throw new Error(`Pollinations generation failed: ${error.message}`);
  }
}

export function getPollinationsDirectUrl(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): string {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

// Pollinations status is always "available" since no key needed
export function getPollinationsStatus(): 'available' {
  return 'available';
}
