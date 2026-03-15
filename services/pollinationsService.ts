// Pollinations.ai Service — 100% free, no API key, no login
// Uses simple URL-based image generation

export async function generateImageViaPollinations(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  // Pollinations has a prompt length limit — truncate to prevent 500 errors
  const cleanPrompt = prompt.slice(0, 480).trim();
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const seed = Math.floor(Math.random() * 999999);

  // Try with FLUX model first, then fallback to default
  const attempts = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${Math.min(width, 1024)}&height=${Math.min(height, 1024)}&nologo=true&seed=${seed}&model=flux`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt.slice(0, 200))}?width=768&height=768&nologo=true&seed=${seed + 1}`,
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      console.log(`🌸 [Pollinations] Attempt ${i + 1}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const response = await fetch(attempts[i], { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`⚠️ [Pollinations] Attempt ${i + 1} returned ${response.status}`);
        continue;
      }

      const blob = await response.blob();
      if (blob.size < 1000) {
        console.warn(`⚠️ [Pollinations] Response too small (${blob.size} bytes), retrying...`);
        continue;
      }

      return URL.createObjectURL(blob);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`⚠️ [Pollinations] Attempt ${i + 1} timed out`);
        continue;
      }
      console.error(`❌ [Pollinations] Attempt ${i + 1} failed:`, error);
      if (i === attempts.length - 1) throw error;
    }
  }

  throw new Error('Pollinations: all attempts failed. Try a shorter/simpler prompt or use another provider.');
}

export function getPollinationsDirectUrl(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): string {
  const cleanPrompt = prompt.slice(0, 480).trim();
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const seed = Math.floor(Math.random() * 999999);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${Math.min(width, 1024)}&height=${Math.min(height, 1024)}&nologo=true&seed=${seed}&model=flux`;
}

export function getPollinationsStatus(): 'available' {
  return 'available';
}
