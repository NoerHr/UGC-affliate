// Pollinations.ai Service — free image generation
// NOTE: As of March 2026, Pollinations frequently returns 500 errors.
// The app auto-falls back to Puter.js when this happens.

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function generateImageViaPollinations(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  const sanitized = sanitizePrompt(prompt);

  // Progressive attempts: different prompt lengths, dimensions, and endpoints
  const attempts = [
    // Try without width/height first (most reliable)
    { prompt: sanitized.slice(0, 200), params: '' },
    // Try with small dimensions
    { prompt: sanitized.slice(0, 150), params: '?width=512&height=512' },
    // Minimal prompt, no extra params
    { prompt: sanitized.slice(0, 80), params: '' },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const encodedPrompt = encodeURIComponent(a.prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}${a.params}`;

    try {
      console.log(`[Pollinations] Attempt ${i + 1} (${a.prompt.length} chars)...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[Pollinations] Attempt ${i + 1} returned ${response.status}`);
        continue;
      }

      const blob = await response.blob();
      if (blob.size < 1000) {
        console.warn(`[Pollinations] Response too small (${blob.size} bytes)`);
        continue;
      }

      return URL.createObjectURL(blob);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`[Pollinations] Attempt ${i + 1} timed out`);
        continue;
      }
      console.error(`[Pollinations] Attempt ${i + 1} failed:`, error);
      if (i === attempts.length - 1) throw error;
    }
  }

  throw new Error('Pollinations is currently unavailable (server errors). Please try Puter.js or another provider instead.');
}

export function getPollinationsDirectUrl(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): string {
  const sanitized = sanitizePrompt(prompt).slice(0, 150);
  const encodedPrompt = encodeURIComponent(sanitized);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}`;
}

export function getPollinationsStatus(): 'available' {
  return 'available';
}
