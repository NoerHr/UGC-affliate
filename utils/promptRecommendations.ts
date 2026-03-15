// Smart Motion Prompt Recommendations
// Anti-glitch, optimized prompts for different scene types

export type PromptCategory = 'product' | 'fashion' | 'lifestyle' | 'action' | 'portrait';

export interface PromptRecommendation {
    label: string;
    prompt: string;
    description: string;
    category: PromptCategory;
}

// Optimized anti-glitch prompts
export const PROMPT_RECOMMENDATIONS: PromptRecommendation[] = [
    // PRODUCT SHOWCASE
    {
        label: "Product Close-up (Static)",
        prompt: "subtle",
        description: "Minimal camera push-in, product perfectly still, breathing motion only",
        category: 'product'
    },
    {
        label: "Product 360° Rotation",
        prompt: "pan",
        description: "Slow horizontal camera pan, product visible throughout, no subject movement",
        category: 'product'
    },
    {
        label: "Product Detail Zoom",
        prompt: "zoom",
        description: "Smooth zoom to product details, model remains still",
        category: 'product'
    },

    // FASHION
    {
        label: "Fashion Pose (Subtle)",
        prompt: "natural",
        description: "Gentle breathing, slight fabric sway, eyes blink naturally, no walking",
        category: 'fashion'
    },
    {
        label: "Fashion Turn (Cinematic)",
        prompt: "cinematic",
        description: "Elegant head turn 10°, fabric flows naturally, smooth motion",
        category: 'fashion'
    },
    {
        label: "Fashion Walk",
        prompt: "walk",
        description: "Model walks 2 steps forward naturally, product visible, tracking camera",
        category: 'fashion'
    },

    // LIFESTYLE
    {
        label: "Lifestyle Natural",
        prompt: "gentle natural motion with subtle breathing and micro-movements",
        description: "Natural breathing, slight weight shift, minimal motion",
        category: 'lifestyle'
    },
    {
        label: "Lifestyle Dynamic",
        prompt: "dynamic",
        description: "Natural movement with product interaction, smooth transitions",
        category: 'lifestyle'
    },

    // PORTRAIT/FACE
    {
        label: "Portrait Subtle",
        prompt: "static breathing only, eyes blink naturally every 3 seconds, head perfectly still",
        description: "Ultra-minimal: eyes blink, breathing only, perfect for close-ups",
        category: 'portrait'
    },
    {
        label: "Portrait with Expression",
        prompt: "natural facial micro-expressions, gentle smile, eyes track forward",
        description: "Subtle facial movements, natural expressions",
        category: 'portrait'
    },

    // ACTION (Controlled)
    {
        label: "Controlled Action",
        prompt: "slow motion product reveal, hand moves 20cm maximum, smooth trajectory",
        description: "Controlled hand movement, product reveal, no sudden motions",
        category: 'action'
    }
];

// Get recommendations by category
export function getRecommendationsByCategory(category: PromptCategory): PromptRecommendation[] {
    return PROMPT_RECOMMENDATIONS.filter(rec => rec.category === category);
}

// Smart category detection (can be enhanced with AI later)
export function detectSceneCategory(sceneIndex: number): PromptCategory {
    // Simple heuristic for now - can be improved with image analysis
    if (sceneIndex === 0) return 'product'; // First scene usually product showcase
    if (sceneIndex <= 2) return 'fashion'; // Early scenes fashion poses
    if (sceneIndex <= 5) return 'lifestyle'; // Mid scenes lifestyle
    return 'action'; // Later scenes more dynamic
}
