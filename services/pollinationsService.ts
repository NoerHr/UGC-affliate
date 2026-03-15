// Pollinations.ai Service — 100% free, no API key, no login
// Uses simple URL-based image generation

function sanitizePrompt(prompt: string): string {
  // Remove emojis and non-ASCII characters (they balloon URL encoding)
  return prompt
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')   // emoticons
    .replace(/[\u{2600}-\u{27BF}]/gu, '')      // symbols
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')    // misc symbols
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')    // transport
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')    // extended
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')    // extended-A
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')      // variation selectors
    .replace(/[\u{200D}]/gu, '')               // zero-width joiner
    .replace(/[^\x20-\x7E]/g, ' ')             // keep only printable ASCII
    .replace(/\s+/g, ' ')                       // collapse whitespace
    .trim();
}

export async function generateImageViaPollinations(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  const sanitized = sanitizePrompt(prompt);
  const seed = Math.floor(Math.random() * 999999);

  // Progressive attempts with shorter prompts and smaller dimensions
  const attempts = [
    { prompt: sanitized.slice(0, 350), w: Math.min(width, 1024), h: Math.min(height, 1024), model: 'flux' },
    { prompt: sanitized.slice(0, 200), w: 768, h: 768, model: 'flux' },
    { prompt: sanitized.slice(0, 120), w: 512, h: 512, model: 'flux' },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const encodedPrompt = encodeURIComponent(a.prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${a.w}&height=${a.h}&nologo=true&seed=${seed + i}&model=${a.model}`;

    // Skip if encoded URL is absurdly long
    if (url.length > 2000) {
      console.warn(`[Pollinations] Attempt ${i + 1} URL too long (${url.length}), shortening...`);
      continue;
    }

    try {
      console.log(`[Pollinations] Attempt ${i + 1} (${a.prompt.length} chars)...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[Pollinations] Attempt ${i + 1} returned ${response.status}`);
        continue;
      }

      const blob = await response.blob();
      if (blob.size < 1000) {
        console.warn(`[Pollinations] Response too small (${blob.size} bytes), retrying...`);
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

  throw new Error('Pollinations: all attempts failed. Try a shorter/simpler prompt or use another provider.');
}

export function getPollinationsDirectUrl(
  prompt: string,
  width: number = 1024,
  height: number = 1024
): string {
  const sanitized = sanitizePrompt(prompt).slice(0, 200);
  const encodedPrompt = encodeURIComponent(sanitized);
  const seed = Math.floor(Math.random() * 999999);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${Math.min(width, 1024)}&height=${Math.min(height, 1024)}&nologo=true&seed=${seed}&model=flux`;
}

export function getPollinationsStatus(): 'available' {
  return 'available';
}
