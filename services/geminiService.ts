
import { GoogleGenAI } from "@google/genai";
import { secureGetItem } from "../utils/secureStorage.ts";
import CryptoJS from "crypto-js";
import * as fal from "@fal-ai/serverless-client";


let sessionCost = 0;
const COST_PER_IMAGE = {
  'nano-banana-pro': 0.015,
  'seedream-4.5': 0.05
};

const imageCache = new Map<string, string>();
const CACHE_ENABLED = true; // Feature flag

const sessionWarnings = {
  geminiQuotaExceeded: false,
  geminiQuotaNearLimit: false
};

const sliceRowImage = (base64Image: string, cols: number = 3): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("Slicing requires browser environment."));
      return;
    }

    const img = new Image();
    img.src = base64Image;
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const pieces: string[] = [];
      // Calculate width per slice based on dynamic columns
      const pieceWidth = Math.floor(img.width / cols); 
      const pieceHeight = img.height;

      for (let i = 0; i < cols; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = pieceWidth;
        canvas.height = pieceHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(
            img, 
            i * pieceWidth, 0, pieceWidth, pieceHeight, // Source
            0, 0, canvas.width, canvas.height           // Dest
          );
          // Use high quality output
          pieces.push(canvas.toDataURL('image/jpeg', 0.95));
        }
      }
      resolve(pieces);
    };

    img.onerror = () => reject(new Error("Failed to load image for slicing."));
  });
};

export const getSessionCost = () => sessionCost;
export const resetSessionCost = () => { sessionCost = 0; };

// Generate cache key from inputs
const getCacheKey = (...inputs: any[]): string => {
  const combined = inputs.map(i =>
    typeof i === 'string' ? i : JSON.stringify(i)
  ).join('|');
  return CryptoJS.SHA256(combined).toString();
};

const trackCost = (imageCount: number, model: string = 'nano-banana-pro') => {
  const cost = imageCount * (COST_PER_IMAGE[model as keyof typeof COST_PER_IMAGE] || COST_PER_IMAGE['nano-banana-pro']);
  sessionCost += cost;
  console.log(`💰 [COST] +$${cost.toFixed(3)} | Session total: $${sessionCost.toFixed(3)}`);

  if (sessionCost > 1.0 && sessionCost % 1.0 < 0.1) {
    console.warn(`⚠️ [BUDGET] Session cost exceeded $${Math.floor(sessionCost)}`);
  }
};

const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get the best available API Key
const getEffectiveApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const stored = secureGetItem('USER_GEMINI_API_KEY');
    if (stored && stored.length > 5) return stored;
  }
  return process.env.API_KEY as string;
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Perform a lightweight "ping" to check if the key is valid.
    // Using 'gemini-3-flash-preview' ensures the key works with the newer model series
    // required by the app.
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: 'Ping' }] },
    });
    return true;
  } catch (error) {
    console.error("API Key Validation Failed:", error);
    return false;
  }
};

export const validateFalKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey || apiKey.length < 5) return false;

  try {
    const response = await fetch('https://fal.run/fal-ai/nano-banana-pro/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      // send a minimal payload that is technically valid enough to pass auth
      body: JSON.stringify({
        prompt: "test validation",
        image_urls: [] // Intentionally missing correct input to trigger 400/422 but verify Auth
      })
    });

    // If status is 401 (Unauthorized) or 403 (Forbidden), the key is invalid.
    if (response.status === 401 || response.status === 403) {
      console.warn("FAL Validation Failed: Invalid Credentials");
      return false;
    }

    return true;
  } catch (error) {
    console.error("FAL Key Validation Network Error:", error);
    return false;
  }
};

// Helper to get FAL AI API Key
const getFalApiKey = (): string | null => {
  if (typeof window !== 'undefined') {
    const stored = secureGetItem('USER_FAL_API_KEY');
    if (stored && stored.length > 5) return stored;
  }
  return null;
};

// ===== GEMINI IMAGE EDITING (FREE ALTERNATIVE) =====

const generateImageWithGemini = async (
  modelBase64: string,
  productBase64: string,
  instruction: string = ''
): Promise<string> => {
  const geminiKey = getEffectiveApiKey();
  if (!geminiKey) throw new Error('Gemini API key not found');

  try {
    console.log('[GEMINI] Using FREE image editing...');
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // Prepare multi-image input
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          // Image 1: Model/base image
          {
            inlineData: {
              data: modelBase64.split(',')[1],
              mimeType: 'image/png'
            }
          },
          // Image 2: Product/reference image
          {
            inlineData: {
              data: productBase64.split(',')[1],
              mimeType: 'image/png'
            }
          },
          // Instruction: Combine both
          { text: instruction || 'Professional photoshoot: model wearing the product naturally, studio lighting, high quality, consistent composition, photorealistic result' }
        ]
      },
      config: { imageConfig: { aspectRatio: "16:9", imageSize: "1K" } }
    });

    // Extract image from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const result = `data:image/png;base64,${part.inlineData.data}`;
        console.log('✅ [GEMINI] Image generated - $0 cost!');
        return result;
      }
    }

    throw new Error('No image data in Gemini response');
  } catch (error: any) {
    console.error('[GEMINI] Error:', error.message);
    throw error;
  }
};

// Map VideoProvider to FAL AI endpoint (LATEST VERSIONS - Dec 2024)
const getFalEndpoint = (provider: string): string => {
  const endpointMap: Record<string, string> = {
    // KLING - Latest versions (v2.5-turbo & v2.6)
    'KLING_2.5': 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',     // ✨ UPDATED to v2.5-turbo Pro
    'KLING_2.6': 'fal-ai/kling-video/v2.6/pro/image-to-video',           // ✨ UPDATED to v2.6 Pro

    // MINIMAX - Latest Hailuo 2.3 Pro (1080p quality)
    'MINIMAX': 'fal-ai/minimax/hailuo-2.3/pro/image-to-video',           // ✨ UPDATED to Hailuo 2.3 Pro

    // SEEDANCE - Latest v1.5 Pro
    'SEEDANCE_PRO': 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',      // ✨ UPDATED to v1.5 Pro
    'SEEDANCE_1.5_PRO': 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',  // ✨ v1.5 Pro

    // WAN - Keep same (no newer version found)
    'WAN_2.5': 'fal-ai/wan-video/v1',
    'WAN_2.6': 'fal-ai/wan-video/v2',

    // VEO - Keep Luma Dream Machine (best alternative)
    'VEO_3.1': 'fal-ai/veo3.1/image-to-video',
    'VEO_3.1_FAST': 'fal-ai/veo3.1/fast/image-to-video'
  };
  return endpointMap[provider] || 'fal-ai/luma-dream-machine';
};

// Enhance user's generic motion prompt with specific controls
const enhanceMotionPrompt = (userPrompt: string): string => {
  if (!userPrompt || userPrompt.trim().length === 0) {
    userPrompt = "natural motion";
  }

  const lower = userPrompt.toLowerCase();

  // ANTI-GLITCH RULES (applied to ALL templates)
  const antiGlitchRules = `
STRICT RULES: Temporal consistency mandatory. No morphing. No warping. No glitches. 
Smooth motion interpolation only. Maintain subject anatomy. No cuts or jumps.
Slow motion speed. Natural physics. Coherent lighting throughout.`;

  let enhancedPrompt = "";

  // STATIC / MINIMAL MOTION
  if (/static|still|freeze|no motion|lock/i.test(lower)) {
    enhancedPrompt = `CAMERA: Completely locked, zero movement. 
SUBJECT: Model breathing gently (chest rise/fall 2cm max). Eyes blink naturally every 3-4 seconds. 
Product 100% stationary. Fabric micro-movements from breathing only.
${antiGlitchRules} ${userPrompt}`;
  }
  // SUBTLE / NATURAL
  else if (/subtle|gentle|natural|minimal|soft/i.test(lower)) {
    enhancedPrompt = `CAMERA: Ultra-slow push-in maximum 10cm over 5 seconds. Linear motion.
SUBJECT: Model breathing naturally. Weight shift side to side 5cm max. Eyes blink. Lips may part slightly.
Hands completely still. No finger movement. Product stable.
${antiGlitchRules} ${userPrompt}`;
  }
  // CINEMATIC / DRAMATIC
  else if (/cinematic|dramatic|elegant|fashion/i.test(lower)) {
    enhancedPrompt = `CAMERA: Slow dolly forward 20cm + gentle upward tilt 3 degrees over 5 seconds.
SUBJECT: Model head turn left 10 degrees in first 2 seconds, hold 1 second, return smoothly in 2 seconds.
Maintain elegant posture. Fabric flows naturally with body movement. Eyes follow head direction smoothly.
${antiGlitchRules} ${userPrompt}`;
  }
  // DYNAMIC / MOVEMENT
  else if (/walk|move|dynamic|action/i.test(lower)) {
    enhancedPrompt = `CAMERA: Smooth tracking following subject at constant distance.
SUBJECT: Model walks forward slowly, 1 step per 2 seconds (max 2 steps total). 
Arms swing naturally in opposition to legs. Product remains visible and stable.
Foot placement heel-to-toe. Weight transfer smooth. No sudden movements.
${antiGlitchRules} ${userPrompt}`;
  }
  // PAN / ROTATE
  else if (/pan|rotate|turn|spin|360/i.test(lower)) {
    enhancedPrompt = `CAMERA: Horizontal pan left to right 20 degrees over 5 seconds. Constant speed.
SUBJECT: Model standing perfectly still during pan. Eyes may follow camera slightly.
Product orientation remains constant in world space (rotates relative to camera).
${antiGlitchRules} ${userPrompt}`;
  }
  // ZOOM
  else if (/zoom|close.*up|detail/i.test(lower)) {
    enhancedPrompt = `CAMERA: Linear zoom in from medium to close shot. Speed: reach target in 4 seconds.
SUBJECT: Model remains perfectly still during zoom. Only breathing visible.
Focus depth changes smoothly. Product detail becomes clear.
${antiGlitchRules} ${userPrompt}`;
  }
  // DEFAULT: Generic prompt → Ultra-subtle motion
  else {
    enhancedPrompt = `CAMERA: Minimal slow push-in 5cm over 5 seconds. Almost imperceptible.
SUBJECT: Model breathing only. Chest rise/fall subtle. Eyes blink naturally.
Micro-sway maximum 3cm. NO hand gestures. NO head turns. NO walking.
Product completely stable. Focus on stillness with life.
${antiGlitchRules} ${userPrompt}`;
  }

  console.log(`[Motion Enhancer] Original: "${userPrompt}"`);
  console.log(`[Motion Enhancer] Enhanced: "${enhancedPrompt.substring(0, 200)}..."`);

  return enhancedPrompt;
};

const generateVideoWithFal = async (
  imageBase64: string,
  prompt: string,
  provider: string,
  onProgress?: (progress: number) => void,
  options?: {
    duration?: number;
    enableAudio?: boolean;
    resolution?: '720p' | '1080p';
  }
): Promise<string> => {
  const falKey = getFalApiKey();
  if (!falKey) {
    throw new Error('FAL AI API key not found. Please connect with FAL AI credentials.');
  }

  const endpoint = getFalEndpoint(provider);
  const baseUrl = `https://fal.run/${endpoint}`;

  try {
    if (onProgress) onProgress(10);
    console.log(`[FAL AI REST] Provider: ${provider}`);
    const enhancedPrompt = enhanceMotionPrompt(prompt);
    const inputPayload: any = {
      image_url: imageBase64,
      prompt: enhancedPrompt
    };
    if (options?.duration) inputPayload.duration = options.duration;
    if (options?.enableAudio && (provider.includes('KLING') || provider.includes('VEO'))) {
      inputPayload.enable_audio = true;
    }
    
    // Submit Request
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(inputPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FAL AI request failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.request_id) {
      console.log(`[FAL AI] Polling ID: ${result.request_id}`);

      let currentProgress = 10;
      const statusUrl = `https://queue.fal.run/${endpoint}/requests/${result.request_id}/status`;
      
      // Loop polling
      while (true) {
        // Cek status
        const statusResponse = await fetch(statusUrl, {
          headers: { 'Authorization': `Key ${falKey}` }
        });
        const statusData = await statusResponse.json();

        if (statusData.status === 'COMPLETED') {
          if (onProgress) onProgress(100); // Done
          
          const videoUrl = statusData.video?.url || statusData.output?.video_url || statusData.data?.video_url;
          if (!videoUrl) throw new Error('No video URL in completed response');
          
          // Fetch blob agar bisa di-play browser tanpa CORS issue
          const vidResp = await fetch(videoUrl);
          const blob = await vidResp.blob();
          return URL.createObjectURL(blob);
        }

        if (statusData.status === 'FAILED') {
          throw new Error(`Video generation failed: ${statusData.error || 'Unknown error'}`);
        }
        const remaining = 90 - currentProgress;
        currentProgress += (remaining * 0.15); // Naik 15% dari sisa jarak
        if (remaining > 1) currentProgress += 1; 
        if (currentProgress > 95) currentProgress = 95;
        if (onProgress) onProgress(Math.floor(currentProgress));
        await sleep(2000);
      }
    }

    // Sync mode fallback
    if (onProgress) onProgress(100);
    const videoUrl = result.video?.url || result.output?.video_url;
    const vidResp = await fetch(videoUrl);
    const blob = await vidResp.blob();
    return URL.createObjectURL(blob);

  } catch (error: any) {
    console.error('[FAL AI REST] Error:', error);
    throw new Error(`Video generation failed: ${error.message || 'Unknown error'}`);
  }
};

async function callWithRetry<T>(fn: (ai: GoogleGenAI) => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create new instance with effective key (BYOK or Env)
      const apiKey = getEffectiveApiKey();
      if (!apiKey) throw new Error("API_KEY_MISSING");

      const ai = new GoogleGenAI({ apiKey });
      return await fn(ai);
    } catch (error: any) {
      lastError = error;
      const errorStr = (error.message || "").toLowerCase();

      if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted")) {
        if (errorStr.includes("limit: 0")) {
          throw new Error("QUOTA_LIMIT_ZERO");
        }
        if (attempt < maxRetries - 1) {
          await sleep((attempt + 1) * 10000);
          continue;
        }
      }
      if (errorStr.includes("not found") || errorStr.includes("api key") || errorStr.includes("api_key_missing")) {
        throw new Error("API_KEY_INVALID");
      }

      throw error;
    }
  }
  throw lastError;
}

const cropImageLocally = (base64Image: string, index: number, totalRows: number = 3): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("Manual crop requires browser environment."));
      return;
    }
    const img = new Image();
    img.src = base64Image;
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const rows = Math.max(1, totalRows);
      const cols = 3;
      
      const pieceWidth = img.width / cols;
      const pieceHeight = img.height / rows;
      const colIndex = index % cols;
      const rowIndex = Math.floor(index / cols);
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Failed to create canvas context"));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      const sx = colIndex * pieceWidth;
      const sy = rowIndex * pieceHeight;
      const sw = pieceWidth;
      const sh = pieceHeight;

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      resolve(canvas.toDataURL('image/png', 0.95)); // Kualitas 95%
    };

    img.onerror = () => reject(new Error("Failed to load source image for cropping."));
  });
};

const generateImageWithFal = async (modelBase64: string, productBase64: string, instruction: string = '', useModel: string = 'nano-banana-pro'): Promise<string> => {
  const falKey = getFalApiKey();
  if (!falKey) throw new Error('FAL AI API key not found');

  try {
    if (CACHE_ENABLED) {
      const cacheKey = getCacheKey('image', modelBase64, productBase64, instruction, useModel);
      const cached = imageCache.get(cacheKey);

      console.log(`🔍 [CACHE DEBUG] Key: ${cacheKey.substring(0, 16)}... | Cache size: ${imageCache.size}`);
      console.log(`   Model: ${useModel} | Instruction length: ${instruction?.length || 0} chars`);

      if (cached) {
        console.log(`✅ [CACHE HIT] Returning cached result - $0 cost saved!`);
        return cached;
      }
      console.log(`🔄 [CACHE MISS] Calling FAL API... (will cache result)`);
    }

    const endpointMap: Record<string, string> = {
      'nano-banana-pro': 'fal-ai/nano-banana-pro/edit',
      'seedream-4.5': 'fal-ai/bytedance/seedream/v4.5/edit'
    };
    const endpoint = endpointMap[useModel] || 'fal-ai/nano-banana-pro/edit';
    console.log(`[FAL AI SDK Image] Using ${useModel} at ${endpoint}`);
    fal.config({ credentials: falKey });
    const result: any = await fal.subscribe(endpoint, {
      input: {
        image_urls: [modelBase64, productBase64],  // Both images as array
        prompt: instruction || 'Professional photoshoot, model wearing the product naturally, studio lighting, high quality, consistent composition',
        num_images: 1,
        aspect_ratio: '16:9',
        output_format: 'jpeg',
        enable_safety_checker: false
      },
      logs: true
    });

    const imageUrl = result.images?.[0]?.url || result.image?.url || result.output?.url;

    if (!imageUrl) {
      console.error('[FAL AI SDK] No image URL in response:', result);
      throw new Error('No image URL in response');
    }

    console.log(`[FAL AI SDK Image] Success! URL: ${imageUrl}`);

    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    const finalResult = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    trackCost(1, useModel);
    if (CACHE_ENABLED) {
      const cacheKey = getCacheKey('image', modelBase64, productBase64, instruction, useModel);
      imageCache.set(cacheKey, finalResult);
      console.log(`💾 [CACHE] Result saved for future reuse`);
    }

    return finalResult;
  } catch (error) {
    console.error('[FAL AI Image] Error:', error);
    throw error;
  }
};

const generateWithSDXLFallback = async (modelBase64: string, productBase64: string, instruction: string, falKey: string): Promise<string> => {
  console.log('[FAL AI] Using SDXL Lightning fallback...');

  const response = await fetch('https://fal.run/fal-ai/fast-sdxl', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `${instruction || 'Professional photoshoot'}, model wearing product, studio lighting, high quality, detailed, 9:16 portrait`,
      image_size: 'portrait_16_9',
      num_inference_steps: 4,
      guidance_scale: 1,
      num_images: 1,
      enable_safety_checker: false
    })
  });

  const responseText = await response.text();
  console.log(`[FAL AI SDXL] Response: ${responseText.substring(0, 300)}`);

  if (!response.ok) {
    throw new Error(`SDXL error (${response.status}): ${responseText.substring(0, 200)}`);
  }

  const result = JSON.parse(responseText);
  const imageUrl = result.images?.[0]?.url || result.image?.url;

  if (!imageUrl) {
    throw new Error('No image URL in SDXL response');
  }
  const imgResp = await fetch(imageUrl);
  const blob = await imgResp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const generateCombinedImage = async (
  modelBase64: string,
  productBase64: string,
  instruction: string = "",
  selectedModel: string = 'nano-banana-pro'
): Promise<string> => {

  if (selectedModel === 'nano-banana-pro') {
    const geminiKey = getEffectiveApiKey();

    if (geminiKey) {
      try {
        console.log('💚 [TIER 1] Attempting FREE Gemini image editing...');
        const result = await generateImageWithGemini(modelBase64, productBase64, instruction);
        return result; // Success! $0 cost
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';

        // Check if quota exceeded
        if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('resource_exhausted')) {
          // Show warning ONCE per session
          if (!sessionWarnings.geminiQuotaExceeded) {
            console.warn('⚠️ ═══════════════════════════════════════════');
            console.warn('⚠️ GEMINI QUOTA EXCEEDED (1,500/day limit)');
            console.warn('⚠️ Switching to FAL AI - $0.015 per image');
            console.warn('⚠️ Quota resets in 24 hours');
            console.warn('⚠️ ═══════════════════════════════════════════');
            sessionWarnings.geminiQuotaExceeded = true;

            // Alert user (first time only)
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                alert(
                  '⚠️ Gemini Free Quota Exceeded\n\n' +
                  'Daily limit: 1,500 images\n' +
                  'Switching to FAL AI: $0.015/image\n\n' +
                  'Quota resets in 24 hours.'
                );
              }, 100);
            }
          }
          console.log('🔄 [FALLBACK] Using FAL AI...');
        } else {
          // Other error, just log
          console.warn('[GEMINI] Failed, falling back to FAL:', errorMsg);
        }
      }
    }
  }
  console.log('💰 [TIER 2] Using FAL AI (paid)');
  return generateImageWithFal(modelBase64, productBase64, instruction, selectedModel);
};

export const generateRefinementVariations = async (
  modelBase64: string, 
  productBase64: string, 
  instruction: string = "", 
  selectedModel: string = 'nano-banana-pro'
): Promise<string[]> => {
  
  console.log('⚡ [OPTIMIZED] Generating 3 variations in 1 request (Triptych mode)...');

  const multiViewPrompt = `
    SPLIT SCREEN TRIPTYCH, 3 DISTINCT PANELS SIDE-BY-SIDE.
    Create 3 different variations of the subject using the product.
    LEFT PANEL: ${instruction} (Pose A).
    MIDDLE PANEL: ${instruction} (Pose B / Close up).
    RIGHT PANEL: ${instruction} (Pose C / Different angle).
    Ensure distinct separation between panels. Consistent lighting across all 3.
    Use aspect ratio 16:9 to fit three vertical portraits side-by-side.
  `;

  try {
    const bigImage = await generateCombinedImage(
      modelBase64, 
      productBase64, 
      multiViewPrompt, 
      selectedModel
    );
    const variations = await sliceRowImage(bigImage, 3);

    if (variations.length === 0) throw new Error("Slicing failed");
    
    console.log(`✅ [OPTIMIZED] Successfully created ${variations.length} variations from 1 generation.`);
    return variations;

  } catch (error) {
    console.error("Single-shot variation failed:", error);
    throw error;
  }
};

const generateBrandingWithGemini = async (baseImage: string, text: string, style: string, fontStyle: string, placement: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    const brandingLine = text && text.trim().length > 0
      ? `- BRANDING: Neon sign "${text}" (${fontStyle}) placed ${placement}.`
      : `- BRANDING: NO TEXT. Do not generate any text or neon signs in the background.`;

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          {
            text: `SCENE MASTERING (LOCK SUBJECT):
- SUBJECT: Keep person/product EXACTLY as input.
- FACE: Do not change the facial features.
- BACKGROUND: ${style}.
${brandingLine}
- QUALITY: Photorealistic, 9:16, 1K.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_STYLE_PREVIEW");
  });
};

// Helper function to generate branding variation with FAL AI (fallback)
const generateBrandingWithFal = async (baseImage: string, text: string, style: string, fontStyle: string, placement: string): Promise<string> => {
  const falKey = getFalApiKey();
  if (!falKey) throw new Error('FAL AI API key not found');

  try {
    const brandingInstruction = text && text.trim().length > 0
      ? `Change only the background to: ${style}. Add neon sign text "${text}" in ${fontStyle} font, placed ${placement}. Keep the subject (person/product) EXACTLY the same - same face, same pose, same clothing, same lighting on subject. Only modify the background.`
      : `Change only the background to: ${style}. Keep the subject (person/product) EXACTLY the same - same face, same pose, same clothing, same lighting on subject. Do NOT add any text or neon signs. Only modify the background.`;

    console.log('[FAL AI Branding] Generating background variation...');
    const baseUrl = 'https://fal.run/fal-ai/nano-banana-pro/edit';

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_urls: [baseImage],  // Array format for edit endpoint
        prompt: brandingInstruction,
        num_images: 1,
        aspect_ratio: '9:16',
        output_format: 'jpeg',
        sync_mode: true,  // Synchronous mode
        enable_safety_checker: false
      })
    });

    const result = await response.json();
    const imageUrl = result.images?.[0]?.url || result.image?.url || result.output?.url;

    if (!imageUrl) {
      console.error('[FAL AI Branding] No image URL in response:', result);
      throw new Error('No image URL in FAL response');
    }

    console.log('[FAL AI Branding] ✓ Background variation generated');

    // Download and convert to base64
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    const finalResult = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Track cost
    trackCost(1, 'nano-banana-pro');
    console.log('✅ [FAL AI Branding] Background variation generated - $0.015');

    return finalResult;
  } catch (error) {
    console.error('[FAL AI Branding] Error:', error);
    throw error;
  }
};

export const generateBrandingVariations = async (
  baseImage: string, 
  text: string, 
  style: string, 
  fontStyle: string, 
  placement: string
): Promise<string[]> => {
  const falKey = getFalApiKey();
  if (!falKey) throw new Error('FAL AI API key not found');

  console.log('⚡ [OPTIMIZED BRANDING] Generating 3 variations in 1 request (Triptych)...');
  const triptychPrompt = `
    SPLIT SCREEN TRIPTYCH, 3 DISTINCT VERTICAL PANELS SIDE-BY-SIDE.
    Create 3 different creative variations of the scene.
    
    CORE INSTRUCTION:
    - Change background to: ${style}.
    - Keep the subject (person/product) consistent.
    
    BRANDING VARIATIONS (Apply slightly different layouts per panel):
    - Panel 1: Neon sign "${text}" (${fontStyle}) placed ${placement}.
    - Panel 2: Neon text "${text}" integrated subtly into background.
    - Panel 3: Bold "${text}" text with glow effect.
    
    FORMAT RULES:
    - Aspect Ratio: 16:9 (Landscape containing 3 vertical strips).
    - Clear separation between panels.
    - Photorealistic, High Quality.
  `;

  try {
    const response = await fetch('https://fal.run/fal-ai/nano-banana-pro/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_urls: [baseImage], // Input gambar base
        prompt: triptychPrompt,
        num_images: 1,           // Cukup 1 gambar (yang isinya 3 panel)
        aspect_ratio: '16:9',    // Wajib Landscape untuk Triptych
        output_format: 'jpeg',
        sync_mode: true,
        enable_safety_checker: false
      })
    });

    const result = await response.json();
    const imageUrl = result.images?.[0]?.url || result.image?.url || result.output?.url;

    if (!imageUrl) {
      console.error('[Branding] No image URL:', result);
      throw new Error('Failed to generate branding grid');
    }

    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    const rowBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    trackCost(1, 'nano-banana-pro');
    console.log(`✅ [OPTIMIZED BRANDING] Success! 1 Query = 3 Variations.`);
    return await sliceRowImage(rowBase64, 3);

  } catch (error) {
    console.error('[Branding] Error:', error);
    throw new Error("Failed to generate optimized branding variations");
  }
};

export const generateStoryboardGrid = async (
  baseImage: string,
  text: string,
  style: string,
  instruction: string = "",
  selectedModel: string = 'nano-banana-pro',
  targetRows: number = 3
): Promise<string> => {
  const falKey = getFalApiKey();
  if (!falKey) throw new Error('FAL AI API key not found');

  const rows = Math.min(Math.max(targetRows, 1), 3); // Limit antara 1 sampai 3
  const cols = 3; // Fixed 3 kolom untuk strategi Triptych 16:9

  try {
    console.log(`[FAL Storyboard] Generating ${rows}x${cols} grid...`);
    console.log(`💰 [COST] Estimated cost: $${(rows * 0.015).toFixed(3)}`);
    const lowerInstr = (instruction + " " + (text || "")).toLowerCase();
    let category = 'FASHION';
    if (/lipstick|mascara|serum|cream|cosmetic|skincare/i.test(lowerInstr)) category = 'BEAUTY';
    else if (/phone|gadget|watch|jewelry/i.test(lowerInstr)) category = 'DETAIL_PRODUCT';
    const rowPromises = Array(rows).fill(null).map(async (_, rowIndex) => {
      let rowTheme = "";
    
      if (rows === 1) {
         rowTheme = "VARIETY MIX: Left=Close-up Detail, Middle=Medium Shot, Right=Lifestyle Context. Complete product showcase.";
      } else {
         if (category === 'BEAUTY' || category === 'DETAIL_PRODUCT') {
            if (rowIndex === 0) rowTheme = "EXTREME CLOSE-UP: Macro details. Texture focus.";
            else if (rowIndex === 1) rowTheme = "PRODUCT DISPLAY: Hero shot on platform/table.";
            else rowTheme = "LIFESTYLE: Model using the product naturally.";
         } else {
            if (rowIndex === 0) rowTheme = "CLOSE-UP & DETAILS: Fabric/Material focus. Waist-up.";
            else if (rowIndex === 1) rowTheme = "MEDIUM SHOTS: Posing confidently. 3/4 angle.";
            else rowTheme = "FULL BODY: Walking or Environmental shot.";
         }
      }

      const rowPrompt = `
        SPLIT SCREEN TRIPTYCH, 3 DISTINCT VERTICAL PANELS.
        Create 3 separate variations side-by-side in one image.
        THEME: ${rowTheme}
        INSTRUCTION: ${instruction}. ${style}.
        
        CRITICAL FORMATTING RULES:
        1. Aspect Ratio must be 16:9 containing 3 vertical strips.
        2. EACH PANEL MUST BE DISTINCT. No bleeding between panels.
        3. Subject stays within their own panel.
        4. CONSISTENCY: Keep exact same product and model identity.
      `;

      const response = await fetch('https://fal.run/fal-ai/nano-banana-pro/edit', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_urls: [baseImage],
          prompt: rowPrompt,
          num_images: 1,
          aspect_ratio: "16:9", // Wajib Landscape untuk Triptych
          output_format: 'jpeg',
          sync_mode: true,
          enable_safety_checker: false
        })
      });

      const result = await response.json();
      const imageUrl = result.images?.[0]?.url || result.image?.url;
      if (!imageUrl) throw new Error(`Row ${rowIndex + 1} generation failed`);

      const imgResp = await fetch(imageUrl);
      const blob = await imgResp.blob();
      
      const rowBase64 = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      });

      trackCost(1, selectedModel);
      return await sliceRowImage(rowBase64, cols);
    });
    const rowResults = await Promise.all(rowPromises);
    const allCells = rowResults.flat(); 
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    const cellWidth = 540; 
    const cellHeight = 960; 

    canvas.width = cellWidth * cols;    
    canvas.height = cellHeight * rows;  

    const loadImage = (src: string) => new Promise<HTMLImageElement>((res) => {
      const i = new Image(); i.onload = () => res(i); i.src = src;
    });

    for (let i = 0; i < allCells.length; i++) {
      if (!allCells[i]) continue;
      
      const r = Math.floor(i / cols);
      const c = i % cols;
      const img = await loadImage(allCells[i]);

      const x = c * cellWidth;
      const y = r * cellHeight;

      ctx.drawImage(img, x, y, cellWidth, cellHeight);
      
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, cellWidth, cellHeight);
    }

    return canvas.toDataURL('image/jpeg', 0.95);

  } catch (error) {
    console.error('[FAL Storyboard] Error:', error);
    throw error;
  }
};


export const extractCell = async (gridImage: string, index: number, totalRows: number, referenceImage?: string): Promise<string> => {
  try {
    return await cropImageLocally(gridImage, index, totalRows);
  } catch (error) {
    console.error("Extract error:", error);
    throw new Error("FAILED_EXTRACTION");
  }
};

// UPSCALE using FAL AI Nano Banana Pro Edit
export const upscaleScene = async (imageBase64: string, size: '2K' | '4K'): Promise<string> => {
  const falKey = getFalApiKey();
  if (!falKey) throw new Error('FAL AI API key not found. Please connect with FAL AI credentials.');

  try {
    console.log(`[FAL AI Upscale] Upscaling to ${size} using Nano Banana Pro...`);

    // Use Nano Banana Pro Edit endpoint for upscaling
    const baseUrl = 'https://fal.run/fal-ai/nano-banana-pro/edit';

    // Better upscale prompt for nano banana pro
    const upscalePrompt = size === '4K'
      ? `Ultra high resolution 4K upscale. Enhance all details, sharpen textures, maintain identity. Professional quality, photorealistic.`
      : `High resolution 2K upscale. Enhance details, sharpen image, maintain identity. Professional quality.`;

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_urls: [imageBase64],
        prompt: upscalePrompt,
        num_images: 1,
        aspect_ratio: '9:16',
        output_format: 'jpeg',
        sync_mode: true,
        enable_safety_checker: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FAL AI Upscale] Error response:', errorText);
      throw new Error(`FAL AI upscale failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const imageUrl = result.images?.[0]?.url || result.image?.url || result.output?.url;

    if (!imageUrl) {
      console.error('[FAL AI Upscale] No image URL in response:', result);
      throw new Error('No image URL in FAL upscale response');
    }

    console.log('[FAL AI Upscale] ✓ Upscale completed');

    // Download and convert to base64
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    const finalResult = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Track cost for upscaling (using nano banana pro rates)
    const upscaleCost = 0.015; // Same as regular nano banana pro edit
    sessionCost += upscaleCost;
    console.log(`✅ [FAL AI Upscale] Completed - $${upscaleCost.toFixed(3)}`);

    return finalResult;
  } catch (error) {
    console.error('[FAL AI Upscale] Error:', error);
    throw error;
  }
};

export const repairImage = async (imageBase64: string, prompt: string, referenceImage?: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    const parts: any[] = [];
    if (referenceImage) {
      parts.push({ inlineData: { data: referenceImage.split(',')[1], mimeType: 'image/png' } });
    }
    parts.push({ inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } });

    const textPrompt = referenceImage
      ? `AI IMAGE REPAIR:
Input 1: REFERENCE IDENTITY.
Input 2: IMAGE TO REPAIR.
INSTRUCTION: ${prompt}.
CRITICAL: Ensure the face matches Input 1. Correct anatomy and lighting.`
      : `AI IMAGE REPAIR: ${prompt}. Correct anatomy and lighting while maintaining identity.`;

    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: { parts },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_REPAIR");
  });
};

// --- NEW: REGENERATE SCENE WITH REFERENCE (For Fixing Inconsistent Products) ---
export const regenerateSceneFromReference = async (
  referenceBase64: string,
  prompt: string,
  style: string
): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: referenceBase64.split(',')[1], mimeType: 'image/png' } },
          {
            text: `REGENERATE SCENE WITH REFERENCE:
- REFERENCE IMAGE: Use this object/person as the PRIMARY SUBJECT.
- TASK: Create a new scene featuring this subject.
- CONTEXT: ${prompt}
- STYLE: ${style}
- CONSTRAINT: The subject from the image must be clearly visible and preserved.
- OUTPUT: Photorealistic 9:16 image.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_REGEN");
  });
};

// EDIT SCENE using FAL AI Nano Banana Pro - DIRECT ONLY
export const editSceneImage = async (imageBase64: string, prompt: string, referenceImage?: string): Promise<string> => {
  const falKey = getFalApiKey();
  if (!falKey) throw new Error('FAL AI API key not found. Please connect with FAL AI credentials.');

  try {
    console.log('[FAL AI Edit] Editing scene image with Nano Banana Pro...');

    const baseUrl = 'https://fal.run/fal-ai/nano-banana-pro/edit';

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_urls: [imageBase64],
        prompt: `${prompt}. CRITICAL: Keep the same face, same product, same style. Only modify pose, gesture, or camera angle as requested. Maintain identity.`,
        num_images: 1,
        aspect_ratio: '9:16',
        output_format: 'jpeg',
        sync_mode: true,
        enable_safety_checker: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FAL AI Edit] Error response:', errorText);
      throw new Error(`FAL AI edit failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const imageUrl = result.images?.[0]?.url || result.image?.url || result.output?.url;

    if (!imageUrl) {
      console.error('[FAL AI Edit] No image URL in response:', result);
      throw new Error('No image URL in FAL edit response');
    }

    console.log('[FAL AI Edit] ✓ Scene edited');
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    const finalResult = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    trackCost(1, 'nano-banana-pro');
    console.log('✅ [FAL AI Edit] Scene edited - $0.015');

    return finalResult;
  } catch (error) {
    console.error('[FAL AI Edit] Error:', error);
    throw error;
  }
};

export const generateSceneVideo = async (
  imageBase64: string,
  prompt: string,
  onProgress?: (progress: number) => void,
  provider: string = 'VEO_3.1',
  activeProvider: string = 'GEMINI',
  videoOptions?: {
    duration?: number;
    enableAudio?: boolean;
    resolution?: '720p' | '1080p';
  }
): Promise<string> => {
  if (activeProvider === 'FAL') {
    console.log(`Generating video with FAL AI using model: ${provider}`);
    // Pass options to FAL video generation
    return generateVideoWithFal(imageBase64, prompt, provider, onProgress, videoOptions);
  }
  if (provider !== 'VEO_3.1') {
    console.warn(`Provider ${provider} not supported with Gemini. Using Veo 3.1`);
  }
  return callWithRetry(async (ai) => {
    let progress = 0;
    if (onProgress) onProgress(5); // Start

    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: `${prompt}. Maintain absolute consistency. Cinematic slow motion.`,
      image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += Math.floor(Math.random() * 5) + 2;
        if (progress > 90) progress = 90;
        if (onProgress) onProgress(progress);
      }
    }, 1000);

    try {
      while (!operation.done) {
        await sleep(5000);
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }
    } finally {
      clearInterval(progressInterval);
    }

    if (onProgress) onProgress(100);

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const apiKey = getEffectiveApiKey();
    const response = await fetch(`${downloadLink}&key=${apiKey}`);

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  });
};
