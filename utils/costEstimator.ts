// Cost Estimation Utility for FAL AI Generation

export interface CostBreakdown {
    imageGeneration: number;
    videoGeneration: number;
    total: number;
    details: {
        imageCount: number;
        videoCount: number;
        totalDuration: number;
    };
}

// FAL AI Pricing (REAL rates from fal.ai)
const COST_PER_IMAGE_MAP: Record<string, number> = {
    'nano-banana-pro': 0.025,  // $0.025 per image (FAL AI Nano Banana Pro)
    'seedream-4.5': 0.05,       // $0.05 per image (FAL AI Seedream 4.5)
    // Free providers
    'pollinations': 0.00,       // Free - no API key needed
    'huggingface': 0.00,        // Free tier
    'puter': 0.00,              // Free - user-pays model
    'prodia': 0.00,             // Free tier (100/day)
    'together-free': 0.00,      // Free credits
    'together-paid': 0.003,     // Together paid
    // Poster generation
    'poster-free': 0.00,
    'poster-gemini': 0.025,
    'poster-fal': 0.025,
};

const COST_PER_IMAGE = 0.025; // Default to nano-banana-pro pricing

const VIDEO_COST_PER_SECOND: Record<string, number> = {
    'VEO_3.1': 0.10, // $0.10/second (audio OFF), $0.15/second (audio ON)
    'VEO_3_FAST': 0.10,
    'VEO_3_SLOW': 0.20,
    'KLING_2.5': 0.08,
    'KLING_2.6': 0.08,
    'MINIMAX': 0.07,
    'SEEDANCE_PRO': 0.09,
    'SEEDANCE_1.5_PRO': 0.09,
    'WAN_2.5': 0.06,
    'WAN_2.6': 0.06,
};

// Average generation time in minutes (based on FAL AI processing)
const VIDEO_GENERATION_TIME: Record<string, { min: number; max: number }> = {
    'VEO_3.1': { min: 3, max: 5 },
    'VEO_3_FAST': { min: 2, max: 3 },
    'VEO_3_SLOW': { min: 5, max: 8 },
    'KLING_2.5': { min: 2, max: 4 },
    'KLING_2.6': { min: 2, max: 4 },
    'MINIMAX': { min: 3, max: 6 },
    'SEEDANCE_PRO': { min: 4, max: 7 },
    'SEEDANCE_1.5_PRO': { min: 4, max: 7 },
    'WAN_2.5': { min: 3, max: 5 },
    'WAN_2.6': { min: 3, max: 5 },
};

export const MODEL_DURATION_LIMITS: Record<string, { min: number; max: number }> = {
    // Google Veo 3: 4, 6, or 8 seconds (NOT 10!)
    'VEO_3.1': { min: 4, max: 8 },
    'VEO_3_FAST': { min: 4, max: 8 },
    'VEO_3_SLOW': { min: 4, max: 8 },

    // Kling AI: 5 or 10 seconds
    'KLING_2.5': { min: 5, max: 10 },
    'KLING_2.6': { min: 5, max: 10 },

    // Minimax/Hailuo: 6-10 seconds (standard 6, newer models 10)
    'MINIMAX': { min: 6, max: 10 },

    // Seedance 1.5 Pro: 4-12 seconds (official spec)
    'SEEDANCE_PRO': { min: 4, max: 12 },
    'SEEDANCE_1.5_PRO': { min: 4, max: 12 },

    // Wan AI: Estimated similar to Kling (no official data found)
    'WAN_2.5': { min: 5, max: 10 },
    'WAN_2.6': { min: 5, max: 10 },
};

// Calculate cost for a single video/scene
export function calculateVideoCost(
    model: string,
    durationSeconds: number,
    resolution?: '720p' | '1080p',
    enableAudio?: boolean
): number {
    const costPerSecond = VIDEO_COST_PER_SECOND[model] || 0.05;
    let baseCost = durationSeconds * costPerSecond;

    // 1080p costs ~1.5x more than 720p (industry standard)
    if (resolution === '1080p') {
        baseCost *= 1.5;
    }

    // VEO models cost +50% more with audio enabled ($0.10 → $0.15)
    if (enableAudio && model.includes('VEO')) {
        baseCost *= 1.5;
    }

    return baseCost;
}

// Helper: Calculate cost for a single scene (used in UI)
export function calculateSceneVideoCost(
    model: VideoProvider,
    durationSeconds: number
): { cost: number; costPerSecond: number } {
    const costPerSecond = VIDEO_COST_PER_SECOND[model] || 0.05;
    const cost = durationSeconds * costPerSecond;

    return {
        cost,
        costPerSecond
    };
}

// Import VideoProvider type for function signature
import type { VideoProvider } from '../types';

export function calculateTotalCost(
    imageCount: number,
    videos: Array<{ model: string; duration: number }>
): CostBreakdown {
    const imageGeneration = calculateImageCost() * imageCount;

    let videoGeneration = 0;
    let totalDuration = 0;

    videos.forEach(({ model, duration }) => {
        videoGeneration += calculateVideoCost(model, duration);
        totalDuration += duration;
    });

    return {
        imageGeneration,
        videoGeneration,
        total: imageGeneration + videoGeneration,
        details: {
            imageCount,
            videoCount: videos.length,
            totalDuration,
        },
    };
}

export function formatCost(amount: number): string {
    return `$${amount.toFixed(3)}`;
}

export function getDurationLimits(model: string): { min: number; max: number } {
    return MODEL_DURATION_LIMITS[model] || { min: 5, max: 10 };
}

export function getGenerationTime(model: string): string {
    const time = VIDEO_GENERATION_TIME[model] || { min: 3, max: 5 };
    return `${time.min}-${time.max} min`;
}

export function estimateGenerationCount(
    budgetUSD: number,
    model: string,
    durationSeconds: number
): { count: number; costPerGeneration: number; totalCost: number } {
    const costPerGeneration = calculateVideoCost(model, durationSeconds);
    const count = Math.floor(budgetUSD / costPerGeneration);
    const totalCost = count * costPerGeneration;

    return {
        count,
        costPerGeneration,
        totalCost,
    };
}

// Convert IDR to USD (approximate rate: 1 USD = 15,700 IDR)
export function idrToUsd(idr: number): number {
    return idr / 15700;
}

export function usdToIdr(usd: number): number {
    return usd * 15700;
}

// ============================================
// SESSION COST TRACKING
// ============================================

export interface CostEntry {
    type: 'image' | 'video' | 'upscale' | 'edit' | 'poster';
    operation: string;
    amount: number;
    timestamp: number;
    details?: string;
}

const COST_STORAGE_KEY = 'session_total_cost';
const COST_HISTORY_KEY = 'session_cost_history';

// Add cost to session
export function addSessionCost(entry: CostEntry): number {
    const current = getSessionCost();
    const newTotal = current + entry.amount;

    localStorage.setItem(COST_STORAGE_KEY, newTotal.toString());

    const history = getCostHistory();
    history.push(entry);
    localStorage.setItem(COST_HISTORY_KEY, JSON.stringify(history));

    console.log(`[COST] ${entry.operation}: +$${entry.amount.toFixed(3)} | Total: $${newTotal.toFixed(3)}`);

    return newTotal;
}

// Get current session cost
export function getSessionCost(): number {
    const saved = localStorage.getItem(COST_STORAGE_KEY);
    return saved ? parseFloat(saved) : 0;
}

// Get cost history
export function getCostHistory(): CostEntry[] {
    const saved = localStorage.getItem(COST_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
}

// Reset session cost
export function resetSessionCost(): void {
    localStorage.removeItem(COST_STORAGE_KEY);
    localStorage.removeItem(COST_HISTORY_KEY);
    console.log('[COST] Reset');
}

// Calculate image generation cost
export function calculateImageCost(model: string = 'nano-banana-pro'): number {
    return COST_PER_IMAGE_MAP[model] || COST_PER_IMAGE;
}

// Calculate upscale cost
export function calculateUpscaleCost(scale: '2K' | '4K'): number {
    return scale === '4K' ? 0.05 : 0.03;
}

