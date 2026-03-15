import React, { useState, useEffect } from 'react';
import { AppStep, GenerationState, AiProvider, VideoProvider } from './types.ts';
import {
  generateCombinedImage,
  generateRefinementVariations,
  generateBrandingVariations,
  generateStoryboardGrid,
  extractCell,
  generateSceneVideo,
  upscaleScene,
  repairImage,
  editSceneImage,
  regenerateSceneFromReference,
  validateApiKey,
  validateFalKey
} from './services/geminiService.ts';
import { secureGetItem, secureSetItem, secureRemoveItem, validateApiKeyFormat, sanitizeApiKey } from './utils/secureStorage.ts';
import { getDurationLimits, formatCost, calculateTotalCost, calculateVideoCost, estimateGenerationCount, idrToUsd, usdToIdr, getGenerationTime, getSessionCost, addSessionCost, resetSessionCost, calculateImageCost, calculateUpscaleCost } from './utils/costEstimator.ts';




const SciFiProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const remainingSeconds = Math.max(0, Math.ceil(((100 - progress) / 100) * 45));

  return (
    <div className="w-full font-sans select-none">
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-blue-500 rounded-full animate-ping"></div>
          <span className="text-[9px] md:text-[10px] font-mono font-bold text-blue-400 tracking-widest uppercase">
            System_Processing
          </span>
        </div>
        <span className="text-[9px] md:text-[10px] font-mono font-bold text-zinc-500 tracking-widest">
          EST: {remainingSeconds}s
        </span>
      </div>

      <div className="relative h-6 md:h-7 bg-[#08090a] border border-blue-900/40 skew-x-[-12deg] overflow-hidden group shadow-[0_0_20px_rgba(0,0,0,0.5)]">
        {/* Grid Background Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_2px,rgba(0,0,0,0.8)_2px)] bg-[length:6px_100%] opacity-40 z-10 pointer-events-none"></div>

        {/* Animated Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-blue-600 transition-all duration-700 ease-out z-0 relative"
          style={{ width: `${progress}% ` }}
        >
          {/* Glow leading edge */}
          <div className="absolute right-0 top-0 bottom-0 w-0.5 md:w-1 bg-blue-300 shadow-[0_0_15px_rgba(59,130,246,1)]"></div>
          {/* Inner Shine */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent"></div>
        </div>

        {/* Text Overlay centered */}
        <div className="absolute inset-0 flex items-center justify-center z-20 skew-x-[12deg]">
          <span className="text-[9px] md:text-[10px] font-black text-white/90 tracking-[0.3em] mix-blend-difference">
            {progress}% COMPLETED
          </span>
        </div>
      </div>

      {/* Tech Footer Deco */}
      <div className="flex justify-between mt-1.5 px-1 opacity-60">
        <div className="flex gap-1">
          <div className={`w - 3 h - 1 md: w - 4 md: h - 1 rounded - sm ${progress > 10 ? 'bg-blue-500' : 'bg-zinc-800'} transition - colors duration - 500`}></div>
          <div className={`w - 3 h - 1 md: w - 4 md: h - 1 rounded - sm ${progress > 40 ? 'bg-blue-500' : 'bg-zinc-800'} transition - colors duration - 500`}></div>
          <div className={`w - 3 h - 1 md: w - 4 md: h - 1 rounded - sm ${progress > 70 ? 'bg-blue-500' : 'bg-zinc-800'} transition - colors duration - 500`}></div>
          <div className={`w - 3 h - 1 md: w - 4 md: h - 1 rounded - sm ${progress >= 100 ? 'bg-[#10b981]' : 'bg-zinc-800'} transition - colors duration - 500`}></div>
        </div>
        <span className="text-[7px] md:text-[8px] font-mono text-blue-500/80 tracking-widest">DATA_STREAM_v3.1</span>
      </div>
    </div>
  );
};

const LoadingScreen: React.FC<{ message: string }> = ({ message }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += (Math.random() * 1.5) + 0.5;
      if (current > 95) current = 95;
      setProgress(Math.round(current));
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4 text-center animate-in">
      <div className="w-full max-w-lg p-8 rounded-[3rem] border border-white/5 bg-[#0c0c0e]/90 shadow-2xl relative overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-pulse"></div>
        <div className="absolute -left-20 -top-20 w-60 h-60 bg-blue-600/10 rounded-full blur-[80px]"></div>
        <div className="absolute -right-20 -bottom-20 w-60 h-60 bg-purple-600/10 rounded-full blur-[80px]"></div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-white">AI Processing</h3>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest animate-pulse">{message}</p>
          </div>

          <div className="px-2 md:px-6">
            <SciFiProgressBar progress={progress} />
          </div>

          <div className="flex justify-between text-[8px] font-mono text-zinc-600 uppercase tracking-widest opacity-60">
            <span>Model: Gemini-3-Pro</span>
            <span>Task: High-Fidelity Gen</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CATEGORIZED_PROMPTS = {
  "Fashion Wearables": [
    {
      label: "Tops / Atasan",
      text: "CLOTHING REPLACE: Swap the model's upper garment with the Product Image. Warp the fabric texture to fit the model's torso anatomy perfectly. Preserve skin tone, hands, and neck. Match lighting and fabric folds."
    },
    {
      label: "Bottoms / Celana",
      text: "CLOTHING REPLACE: Swap the model's pants/skirt with the Product Image. Align the waistband naturally. Ensure the fabric drapes correctly over the legs. Keep the model's upper body and shoes intact."
    },
    {
      label: "Muslim / Hijab",
      text: "MODEST FASHION: Integrate the product (Hijab/Gamis) onto the model. Ensure a loose, modest fit. If swapping Hijab, frame the face naturally without altering facial features. Fabric should flow elegantly."
    },
    {
      label: "Full Outfit",
      text: "FULL OUTFIT SWAP: Dress the model in the complete set from the Product Image. Retain the model's pose exactly. Re-light the fabric to match the environment. Ensure high-fidelity texture mapping."
    }
  ],
  "Objects & Lifestyle": [
    {
      label: "Handheld / Gadget",
      text: "NATURAL GRIP: Place the product in the model's hand. CRITICAL: Generate realistic fingers wrapping around the object with correct tension. Ensure the object scale is accurate (e.g., phone vs tablet). Add contact shadows."
    },
    {
      label: "Tabletop / Home",
      text: "SCENE PLACEMENT: Place the product on the surface in front of the model. Match the perspective (vanishing point) and depth of field. Cast realistic shadows onto the table consistent with scene lighting."
    },
    {
      label: "Beauty / Skincare",
      text: "BEAUTY SHOT: Model holding the product near the face. Focus on skin texture. Ensure the product label is legible and facing the camera. Do not obstruct key facial features."
    },
    {
      label: "Footwear / Shoes",
      text: "SHOE SWAP: Replace the model's shoes with the Product Image. Ensure the feet are grounded correctly on the floor. Match the angle of the foot/ankle to the shoe perspective."
    }
  ]
};

const BACKGROUND_PRESETS = [
  "High-end Minimalist Studio",
  "Urban City Bokeh",
  "Luxury Interior",
  "Soft Natural Light",
  "Cyberpunk Neon",
  "Abstract Gradient",
  "Beige / Warm Tones",
  "Nature / Outdoor Garden"
];

const FONT_OPTIONS = [
  "Modern Sans",
  "Elegant Serif",
  "Bold Graffiti",
  "Neon Script",
  "Futuristic Mono",
  "Vintage Typewriter",
  "Handwritten Signature",
  "3D Chrome",
  "Gothic Bold",
  "Minimalist Thin"
];

const PLACEMENT_OPTIONS = [
  "Behind Subject",
  "Floating Above",
  "Integrated Neon Sign",
  "Overlay Bottom",
  "Vertical Side",
  "Floor Reflection",
  "Halo Effect",
  "Wrapped Around Subject",
  "Magazine Header"
];

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(true); // Default true to force check
  const [loadingMsg, setLoadingMsg] = useState('');
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [useCustomKey, setUseCustomKey] = useState<boolean>(false);
  const [gridRows, setGridRows] = useState<number>(3);
  const [activeProvider, setActiveProvider] = useState<AiProvider>('FAL');
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [tempFalKey, setTempFalKey] = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [modalProviderTab, setModalProviderTab] = useState<AiProvider>('FAL');

  const [state, setState] = useState<GenerationState>({
    activeProvider: 'FAL',
    selectedImageModel: 'nano-banana-pro',
    modelImage: null,
    productImage: null,
    promptInstruction: '',
    combinedImage: null,
    combinedCandidates: null,
    brandingText: '', 
    stylePrompt: 'High-end minimalist studio with soft moody lighting',
    fontStyle: 'Modern Sans',
    textPlacement: 'Behind Subject',
    storyboardGrid: null,
    scenes: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      image: null,
      videoUrl: null,
      isExtracting: false,
      isGeneratingVideo: false,
      isUpscaling: false,
      isEditing: false,
      duration: 5, // Default 5 seconds
      videoProgress: 0,
      bgMusicPrompt: '',
      dialoguePrompt: '',
      jsonMode: false,
      jsonPrompt: `{ \n  "motion":  "Cinematic pan", \n  "music": "Lo-fi beat", \n  "dialogue": "..."\n } `,
      isVideoMuted: true,
      videoDuration: '00:00',
      selectedVideoProvider: 'VEO_3.1'
    })),
    editPrompts: Array(9).fill(""),
    extractionProgress: 0,
  });


  const [scenePrompts, setScenePrompts] = useState<string[]>(Array(9).fill("Subtle cinematic motion, elegant model moves naturally."));
  const [repairPrompts, setRepairPrompts] = useState<string[]>(Array(9).fill("Fix any glitches and enhance facial details."));
  const [sessionCost, setSessionCost] = useState<number>(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionCost(getSessionCost());
    }, 1000); 

    return () => clearInterval(interval);
  }, []);


  const checkKeys = async () => {
    const geminiKey = secureGetItem('USER_GEMINI_API_KEY');
    const falKey = secureGetItem('USER_FAL_API_KEY');

    if (geminiKey && geminiKey.length > 5) {
      setUseCustomKey(true);
      setActiveProvider('GEMINI');
      setShowKeyModal(false);
      return;
    }

    if (falKey && falKey.length > 5) {
      setUseCustomKey(true);
      setActiveProvider('FAL');
      setShowKeyModal(false);
      return;
    }

    setShowKeyModal(true);
  };

  useEffect(() => {
    checkKeys();
  }, []);

  const handleSaveCustomKey = async () => {
    setKeyError('');

    if (!tempFalKey && !tempGeminiKey) {
      setKeyError('Please enter at least one API key');
      return;
    }

    setIsValidatingKey(true);
    let anyKeyValid = false;

    try {
      if (tempGeminiKey) {
        const sanitized = sanitizeApiKey(tempGeminiKey);

        if (!validateApiKeyFormat(sanitized, 'GEMINI')) {
          setKeyError('Invalid Gemini key format');
          setIsValidatingKey(false);
          return;
        }

        const isValid = await validateApiKey(sanitized);
        if (!isValid) {
          setKeyError('Gemini key validation failed');
          setIsValidatingKey(false);
          return;
        }

        secureSetItem('USER_GEMINI_API_KEY', sanitized);
        console.log('✅ Gemini key saved');
        anyKeyValid = true;
      }

      if (tempFalKey) {
        const sanitized = sanitizeApiKey(tempFalKey);

        if (!validateApiKeyFormat(sanitized, 'FAL')) {
          setKeyError('Invalid FAL key format');
          setIsValidatingKey(false);
          return;
        }

        const isValid = await validateFalKey(sanitized);
        if (!isValid) {
          setKeyError('FAL key validation failed');
          setIsValidatingKey(false);
          return;
        }

        secureSetItem('USER_FAL_API_KEY', sanitized);
        console.log('✅ FAL key saved');
        setActiveProvider('FAL');
        setState(prev => ({ ...prev, activeProvider: 'FAL' }));
        anyKeyValid = true;
      }

      if (anyKeyValid) {
        setUseCustomKey(true);
        setShowKeyModal(false);
        setTempGeminiKey('');
        setTempFalKey('');
      }

    } catch (e: any) {
      console.error('[KEY ERROR]', e);
      setKeyError(e.message || 'Validation failed');
    } finally {
      setIsValidatingKey(false);
    }
  };

  const handleDisconnect = () => {
    if (activeProvider === 'GEMINI') secureRemoveItem('USER_GEMINI_API_KEY');
    if (activeProvider === 'FAL') secureRemoveItem('USER_FAL_API_KEY');
    setUseCustomKey(false);
    setShowKeyModal(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'model' | 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setState(prev => ({ ...prev, [type === 'model' ? 'modelImage' : 'productImage']: ev.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSceneReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isEditing: true } : s) }));
      try {
        const row = Math.floor(idx / 3);
        const defaultPrompts = [
          "Close-up product detail shot, macro photography, sharp focus",
          "Medium shot, product interaction, holding or using the product naturally",
          "Lifestyle context shot, cinematic environment, product in scene"
        ];
        const userPrompt = state.editPrompts[idx] || state.promptInstruction || "";
        const finalPrompt = `${defaultPrompts[row]}. ${userPrompt} `;
        const newImage = await regenerateSceneFromReference(base64, finalPrompt, state.stylePrompt);
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: newImage, isEditing: false } : s)
        }));
      } catch (error) {
        handleError(error);
        setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isEditing: false } : s) }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleError = (e: any) => {
    console.error(e);
    if (e.message === "QUOTA_LIMIT_ZERO") {
      setQuotaError("YOUR API QUOTA IS ZERO. Please upgrade your Google Cloud Project to a PAID plan and enable billing for Gemini 3 Pro & Veo 3.1.");
    } else if (e.message === "API_KEY_INVALID") {
      alert("API Key is invalid or expired. Please re-authenticate.");
      secureRemoveItem('USER_GEMINI_API_KEY');
      setShowKeyModal(true);
    } else {
      alert("Error occurred: " + (e.message || "Unknown error"));
    }
  };

  const downloadMedia = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onRefineClick = async () => {
    if (!state.modelImage || !state.productImage) return;

    setLoadingMsg("GENERATING 3 REFINEMENT VARIATIONS...");
    setQuotaError(null);
    try {
      const res = await generateRefinementVariations(
        state.modelImage,
        state.productImage,
        state.promptInstruction,
        state.selectedImageModel // Pass selected model
      );
      setState(prev => ({
        ...prev,
        combinedCandidates: res,
        combinedImage: res[0]
      }));
      setStep(AppStep.REFINE);
    } catch (e: any) {
      handleError(e);
    }
    setLoadingMsg("");
  };

  const onApplyBrandingClick = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("GENERATING 3 BRANDING VARIATIONS...");
    setQuotaError(null);
    try {
      const res = await generateBrandingVariations(
        state.combinedImage,
        state.brandingText, // Removed 'LUXE' fallback to allow empty text
        state.stylePrompt || "Cinematic",
        state.fontStyle || "Modern Sans",
        state.textPlacement || "Behind Subject"
      );
      setState(prev => ({
        ...prev,
        combinedImage: res[0],
        combinedCandidates: res
      }));
    } catch (e: any) {
      handleError(e);
    }
    setLoadingMsg("");
  };

  const onGridClick = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg(`GENERATING ${gridRows}x3 PRODUCTION GRID...`);
    setQuotaError(null);
    try {
      const res = await generateStoryboardGrid(
        state.combinedImage,
        state.brandingText,
        state.stylePrompt || "Cinematic",
        state.promptInstruction,
        state.selectedImageModel, // Pass model
        gridRows // ✨ Pass the selected row count (1, 2, or 3)
      );
      setState(prev => ({ ...prev, storyboardGrid: res }));
      setStep(AppStep.STORYBOARD);
    } catch (e: any) {
      handleError(e);
    }
    setLoadingMsg("");
  };

  const onRegenerateGrid = async () => {
    onGridClick(); // Reuse the existing grid generation logic
  };

  const onFinalRenderClick = async () => {
    if (!state.storyboardGrid) return;
    setStep(AppStep.RESULTS);
    setQuotaError(null);
    const totalCells = gridRows * 3;
    for (let i = 0; i < totalCells; i++) {
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: true } : s) }));
      await new Promise(r => setTimeout(r, 200));

      try {
        const img = await extractCell(
          state.storyboardGrid!, 
          i, 
          gridRows, 
          state.modelImage || undefined
        );
        
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === i ? { ...s, image: img, isExtracting: false } : s),
          extractionProgress: Math.round(((i + 1) / totalCells) * 100)
        }));
      } catch (e: any) {
        console.error("Extraction failed for index " + i, e);
        if (e.message === "QUOTA_LIMIT_ZERO") {
          setQuotaError("Quota Limit Reached during extraction. Some scenes might not load.");
          break;
        }
      }
    }
  };

  const onUpscale = async (idx: number, size: '2K' | '4K') => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isUpscaling: true } : s) }));
    try {
      const img = await upscaleScene(state.scenes[idx].image!, size);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isUpscaling: false } : s) }));
    } catch (e) { handleError(e); }
  };

  const onRepair = async (idx: number) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isExtracting: true } : s) }));
    try {
      const img = await repairImage(state.scenes[idx].image!, repairPrompts[idx], state.modelImage || undefined);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isExtracting: false } : s) }));
    } catch (e) { handleError(e); }
  };

  const onEditImage = async (idx: number) => {
    const prompt = state.editPrompts[idx];
    if (!prompt || !state.scenes[idx].image) return;

    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isEditing: true } : s) }));
    try {
      const img = await editSceneImage(state.scenes[idx].image!, prompt, state.modelImage || undefined);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isEditing: false } : s) }));
    } catch (e) { handleError(e); }
  };

  const onVideo = async (idx: number) => {
    const scene = state.scenes[idx];
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: true, videoProgress: 0 } : s) }));
    let finalPrompt = "";
    if (scene.jsonMode && scene.jsonPrompt) {
      finalPrompt = scene.jsonPrompt;
    } else {
      const motion = scenePrompts[idx];
      const music = scene.bgMusicPrompt;
      const dialogue = scene.dialoguePrompt;

      const parts = [];
      if (motion) parts.push(`Motion: ${motion} `);
      if (music) parts.push(`Background Music: ${music} `);
      if (dialogue) parts.push(`Dialogue: ${dialogue} `);

      finalPrompt = parts.join(". ");
    }

    const selectedProvider = scene.selectedVideoProvider || 'VEO_3.1';
    if (activeProvider === 'GEMINI' && selectedProvider !== 'VEO_3.1') {
      alert(`⚠️ Model ${selectedProvider} is only available with FAL AI.\n\nPlease disconnect and connect with FAL AI API key to use this model.\n\nCurrent Provider: GEMINI (Veo 3.1 Only)`);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: false, videoProgress: 0 } : s) }));
      return;
    }

    try {
      const videoOptions = {
        duration: scene.duration,
        enableAudio: scene.enableAudio || false,
        resolution: scene.videoResolution || '720p'
      };

      console.log(`[APP] Generating video with options:`, videoOptions);

      const url = await generateSceneVideo(
        state.scenes[idx].image!,
        finalPrompt,
        (progress) => {
          setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, videoProgress: progress } : s) }));
        },
        selectedProvider, // Pass the selected provider
        activeProvider, // Pass active provider (GEMINI or FAL)
        videoOptions // Pass video generation options
      );
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, videoUrl: url, isGeneratingVideo: false, videoProgress: 100 } : s) }));
    } catch (e) {
      handleError(e);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: false, videoProgress: 0 } : s) }));
    }
  };

  const toggleJsonMode = (idx: number) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, jsonMode: !s.jsonMode } : s) }));
  };

  const updateSceneField = (idx: number, field: keyof GenerationState['scenes'][0], value: any) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, [field]: value } : s) }));
  };

  const formatDuration = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s} `;
  };

  return (
    <div className="min-h-screen bg-[#050506] text-white selection:bg-blue-500/30 font-sans pb-20 relative overflow-x-hidden">

      {/* 1. Header Section */}
      <header className="pt-6 sm:pt-8 md:pt-12 pb-4 sm:pb-6 md:pb-8 relative px-3 sm:px-4">

        {/* Status Indicator / Disconnect - Responsive Flex */}
        <div className="flex flex-col sm:flex-row justify-center sm:justify-end items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          {/* Cost Tracker Badge */}
          {sessionCost > 0 && (
            <div className={`bg-gradient-to-r ${sessionCost > 2 ? 'from-red-950/40 to-red-900/20 border-red-500/40' : sessionCost > 1 ? 'from-yellow-950/40 to-yellow-900/20 border-yellow-500/40' : 'from-blue-950/40 to-blue-900/20 border-blue-500/40'} border rounded-full px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2 transition-all duration-300`}>
              <div className="text-[9px] sm:text-[10px] font-mono font-bold text-white tracking-wider">
                💰 ${sessionCost.toFixed(3)}
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${sessionCost > 2 ? 'bg-red-400 animate-pulse' : sessionCost > 1 ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
            </div>
          )}

          {/* Provider Status */}
          <div
            onClick={handleDisconnect}
            className={`bg-[#0c1a11] border ${useCustomKey ? 'border-blue-900/40 bg-blue-950/20' : 'border-[#1e3a24]'} rounded-full px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2 transition-all duration-300 cursor-pointer hover:opacity-80 group`}
            title="Click to Disconnect / Change Key"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${useCustomKey ? 'bg-blue-400 shadow-[0_0_8px_#3b82f6]' : 'bg-[#10b981] shadow-[0_0_8px_#10b981]'}`}></div>
            <span className={`${useCustomKey ? 'text-blue-400' : 'text-[#10b981]'} text-[8px] sm:text-[9px] font-bold uppercase tracking-widest`}>
              {activeProvider} {useCustomKey ? '(Custom)' : '(Project)'}
            </span>
            <i className="fa-solid fa-power-off text-[9px] sm:text-[10px] text-zinc-500 group-hover:text-red-400 ml-1 sm:ml-2 transition-colors"></i>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2 sm:space-y-3 md:space-y-4">
          <h1 className="text-lg sm:text-xl md:text-3xl lg:text-5xl font-black uppercase tracking-tight leading-tight px-2">UGC AI Affiliate Storyboard Scene</h1>
        </div>
      </header>

      {/* 2. Responsive Navigation Flow */}
      <nav className="flex flex-wrap justify-center items-center gap-x-1.5 gap-y-2 sm:gap-x-2 md:gap-x-4 lg:gap-8 mb-6 sm:mb-8 md:mb-12 lg:mb-16 px-3 sm:px-4">
        {[
          { step: AppStep.UPLOAD, label: 'Upload Assets' },
          { step: AppStep.REFINE, label: 'Refine Image' },
          { step: AppStep.STORYBOARD, label: 'Storyboard Grid' },
          { step: AppStep.RESULTS, label: 'Final Render' }
        ].map((item, idx, arr) => {
          const isActive = step === item.step;
          const isCompleted = arr.findIndex(x => x.step === step) > idx;
          const canNavigate =
            (item.step === AppStep.UPLOAD) ||
            (item.step === AppStep.REFINE && (state.combinedImage || state.modelImage)) ||
            (item.step === AppStep.STORYBOARD && state.storyboardGrid) ||
            (item.step === AppStep.RESULTS && state.scenes.some(s => s.image));

          return (
            <React.Fragment key={item.step}>
              <div
                onClick={() => canNavigate && setStep(item.step)}
                className={`flex items - center gap - 2 md: gap - 3 px - 4 py - 3 md: px - 6 md: py - 4 rounded - xl md: rounded - 2xl border transition - all ${isActive
                  ? 'bg-[#0f172a] border-blue-600/50 text-white shadow-[0_0_20px_rgba(37,99,235,0.15)] scale-105'
                  : isCompleted
                    ? 'bg-[#0c1a11]/20 border-green-600/30 text-green-500 hover:bg-[#0c1a11]/40'
                    : 'bg-[#0c0c0e] border-white/5 text-zinc-600'
                  } ${canNavigate ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} `}>
                <div className={`w - 1.5 h - 1.5 rounded - full ${isActive ? 'bg-blue-500' : isCompleted ? 'bg-green-500' : 'bg-zinc-800'} `}></div>
                <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest whitespace-nowrap">{item.label}</span>
              </div>
              {idx < arr.length - 1 && (
                <i className="fa-solid fa-arrow-right text-[10px] opacity-10 hidden md:block"></i>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 lg:px-12">
        {loadingMsg && <LoadingScreen message={loadingMsg} />}

        {/* Global Error Notice */}
        {quotaError && (
          <div className="mb-8 p-6 bg-red-600/10 border border-red-500/30 rounded-[2rem] animate-in flex items-center gap-6">
            <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
            </div>
            <div>
              <h4 className="text-[12px] font-black uppercase tracking-widest text-red-500 mb-1">Quota Warning</h4>
              <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-tight leading-relaxed">{quotaError}</p>
            </div>
          </div>
        )}

        {/* UPLOAD STEP */}
        {step === AppStep.UPLOAD && (
          <div className="animate-in flex flex-col items-center max-w-5xl mx-auto w-full px-4 md:px-0">

            {/* Wrapper Container for Image Inputs - ALWAYS 2 COLUMNS */}
            <div className="w-full bg-[#0c0c0e] border border-white/5 rounded-[2rem] sm:rounded-[2.5rem] md:rounded-[3.5rem] p-3 sm:p-4 md:p-8 shadow-2xl relative mb-8">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-6 lg:gap-8 w-full">
                {[{ id: 'model', label: 'Model Base' }, { id: 'product', label: 'Product Item' }].map(u => (
                  <label key={u.id} className="relative aspect-[3/4] bg-[#050506] rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/40 hover:shadow-[0_0_30px_rgba(37,99,235,0.15)] transition-all duration-500 overflow-hidden group">
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.id as any)} />

                    {state[`${u.id}Image` as keyof GenerationState] ? (
                      <div className="w-full h-full relative">
                        <img src={state[`${u.id}Image` as keyof GenerationState] as string} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300"></div>
                      </div>
                    ) : (
                      <div className="text-center opacity-40 group-hover:opacity-100 transition-all duration-300 p-2 sm:p-3 md:p-4 transform group-hover:-translate-y-1">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3 md:mb-4 border border-white/5 group-hover:border-blue-500/50 group-hover:bg-blue-500/10 transition-all duration-300 shadow-lg">
                          <i className="fa-solid fa-plus text-sm sm:text-lg md:text-xl text-zinc-400 group-hover:text-blue-400 transition-colors"></i>
                        </div>
                        <p className="text-[8px] sm:text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-zinc-500 group-hover:text-white transition-colors">{u.label}</p>
                      </div>
                    )}

                    {/* Hover Overlay for Re-upload if image exists */}
                    {state[`${u.id}Image` as keyof GenerationState] && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="bg-white/10 rounded-full px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 backdrop-blur-md border border-white/20">
                          <span className="text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-white">Change Image</span>
                        </div>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="w-full bg-[#0c0c0e] rounded-[2rem] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/50 transform scale-y-0 group-hover:scale-y-100 transition-transform duration-500 origin-top"></div>

              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500 block mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-wand-sparkles text-blue-500"></i>
                  Auto-Optimization Prompt (Select Category)
                </div>
              </label>

              {/* CATEGORIZED RECOMMENDATION CHIPS */}
              <div className="flex flex-col gap-4 mb-4">
                {Object.entries(CATEGORIZED_PROMPTS).map(([category, items]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 ml-1">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((rec, i) => (
                        <button
                          key={i}
                          onClick={() => setState(prev => ({ ...prev, promptInstruction: rec.text }))}
                          className="bg-white/5 hover:bg-blue-600/20 border border-white/10 hover:border-blue-500/30 rounded-lg px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:text-blue-400 transition-all active:scale-95 text-left"
                          title={rec.text}
                        >
                          {rec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <textarea
                value={state.promptInstruction}
                onChange={(e) => setState(prev => ({ ...prev, promptInstruction: e.target.value }))}
                placeholder="✨ Describe exactly how the model should interact with the product..."
                className="w-full bg-[#0c0c0e] border border-white/10 rounded-xl py-4 px-4 text-[11px] outline-none focus:border-blue-500/50 transition-colors resize-none h-24 placeholder:text-zinc-700"
              />

              {/* IMAGE MODEL SELECTION */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                  <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
                  Image Generation Model
                </label>
                <select
                  value={state.selectedImageModel}
                  onChange={(e) => setState(prev => ({ ...prev, selectedImageModel: e.target.value as 'nano-banana-pro' | 'seedream-4.5' }))}
                  className="w-full bg-[#0c0c0e] border border-white/10 rounded-xl py-4 px-4 text-[11px] font-bold uppercase tracking-wider outline-none focus:border-purple-500/50 transition-colors"
                >
                  <option value="nano-banana-pro">🍌 Nano Banana Pro (Best Consistency)</option>
                  <option value="seedream-4.5">🌱 Seedream 4.5 (High Quality)</option>
                </select>
              </div>

              <button />
            </div>

            <button
              disabled={!state.modelImage || !state.productImage}
              onClick={onRefineClick}
              className="mt-8 md:mt-12 w-full md:w-auto bg-[#1d4ed8] hover:bg-blue-600 disabled:opacity-20 disabled:cursor-not-allowed px-12 md:px-24 py-5 md:py-6 rounded-full font-black uppercase tracking-[0.2em] text-[12px] shadow-[0_15px_40px_rgba(37,99,235,0.3)] transition-all active:scale-95 border border-white/5 relative overflow-hidden group"
            >
              <span className="relative z-10">Start Refinement</span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        )}

        {/* REFINE STEP */}
        {step === AppStep.REFINE && (
          <div className="animate-in flex flex-col items-center w-full">
            <h3 className="text-[12px] md:text-[14px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-8 md:mb-10 text-center">Select Preferred Variation</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full max-w-6xl mb-8 px-4 md:px-0">
              {(state.combinedCandidates || [state.combinedImage]).filter(Boolean).map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setState(prev => ({ ...prev, combinedImage: img }))}
                  className={`
                    group relative rounded-[2.5rem] md:rounded-[3rem] overflow-hidden cursor-pointer transition-all duration-500 aspect-[9/16]
                    ${state.combinedImage === img ? 'scale-[1.02] md:scale-105 z-10 shadow-2xl' : 'scale-95 opacity-80 hover:opacity-100 hover:scale-100'}
`}
                >
                  <div className={`absolute inset-0 ${state.combinedImage === img ? 'animated-gradient-border' : ''}`}>
                    <div className="bg-inner-card w-full h-full relative z-10">
                      <img src={img as string} className="w-full h-full object-cover" />
                    </div>
                  </div>
                  {state.combinedImage === img && (
                    <div className="absolute top-6 right-6 z-20 bg-blue-600 w-10 h-10 rounded-full flex items-center justify-center shadow-lg">
                      <i className="fa-solid fa-check text-white text-sm"></i>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* NEW: REGENERATE BUTTON IF GLITCHY */}
            <div className="flex justify-center mb-12 w-full max-w-lg mx-auto">
              <button
                onClick={onRefineClick}
                className="flex items-center gap-3 px-8 py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 hover:border-red-500/60 rounded-full transition-all group w-full justify-center"
              >
                <i className="fa-solid fa-rotate-right text-red-500 group-hover:rotate-180 transition-transform duration-500"></i>
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 group-hover:text-red-300">Regenerate Variations (Fix Glitches)</span>
              </button>
            </div>

            <div className="w-full max-w-4xl bg-[#0c0c0e] border border-white/5 rounded-[2.5rem] md:rounded-[3rem] p-6 md:p-8 mb-12 shadow-2xl relative">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6 text-center">Creative Direction</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
                {/* Inputs... */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Neon Brand Text</label>
                  <input type="text" value={state.brandingText} onChange={(e) => setState(prev => ({ ...prev, brandingText: e.target.value }))} placeholder="e.g. ALANA" className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors placeholder:text-zinc-800" />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center px-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Background / Atmosphere</label>
                  </div>
                  <div className="space-y-2">
                    <input type="text" value={state.stylePrompt} onChange={(e) => setState(prev => ({ ...prev, stylePrompt: e.target.value }))} placeholder="e.g. Cyberpunk City" className="w-full bg-[#050506] border border-white/10 rounded-3xl px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors placeholder:text-zinc-800" />
                    <div className="flex flex-wrap gap-2 px-2">
                      {BACKGROUND_PRESETS.map((bg, i) => (
                        <button key={i} onClick={() => setState(prev => ({ ...prev, stylePrompt: bg }))} className="bg-[#18181b] hover:bg-blue-900/20 border border-white/5 hover:border-blue-500/30 rounded-full px-3 py-1.5 text-[9px] text-zinc-400 hover:text-blue-400 font-medium transition-colors">
                          {bg}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Font Style</label>
                  <select value={state.fontStyle} onChange={(e) => setState(prev => ({ ...prev, fontStyle: e.target.value }))} className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors cursor-pointer appearance-none">
                    {FONT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Text Placement</label>
                  <select value={state.textPlacement} onChange={(e) => setState(prev => ({ ...prev, textPlacement: e.target.value }))} className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors cursor-pointer appearance-none">
                    {PLACEMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-center">
                <button onClick={onApplyBrandingClick} className="w-full md:w-auto bg-[#2563eb]/20 hover:bg-[#2563eb]/40 border border-[#2563eb]/50 text-[#3b82f6] px-8 md:px-12 py-4 rounded-full font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-3">
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  Apply Style & Branding
                </button>
              </div>
            </div>

            {/* --- GRID SELECTION PANEL --- */}
            <div className="w-full max-w-4xl bg-[#0c0c0e] border border-white/5 rounded-[2.5rem] p-6 md:p-8 mb-8 shadow-xl">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6 text-center">Storyboard Layout</h3>

              <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
                {[1, 2, 3].map((rows) => (
                  <button
                    key={rows}
                    onClick={() => setGridRows(rows)}
                    className={`
                      relative group flex flex-col items-center justify-center gap-2 w-full md:w-1/3 py-6 px-4 rounded-2xl border transition-all duration-300
                      ${gridRows === rows
                        ? 'bg-blue-600/10 border-blue-500 text-white shadow-[0_0_30px_rgba(37,99,235,0.2)]'
                        : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:border-white/20'
                      }
                    `}
                  >
                    <div className="flex gap-1 mb-2">
                      {/* Visual representation of grid rows */}
                      <div className="flex flex-col gap-1">
                        {Array.from({ length: rows }).map((_, i) => (
                          <div key={i} className={`w-8 h-4 rounded-sm border border-current ${gridRows === rows ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
                        ))}
                      </div>
                    </div>

                    <span className="text-[14px] font-black uppercase tracking-wider">{rows} x 3 Grid</span>
                    <span className={`text-[10px] font-mono font-bold ${gridRows === rows ? 'text-blue-400' : 'text-zinc-600'}`}>
                      Est. ${ (rows * 0.015).toFixed(3) }
                    </span>

                    {/* Checkmark for selected */}
                    {gridRows === rows && (
                      <div className="absolute top-3 right-3 text-blue-500">
                        <i className="fa-solid fa-circle-check"></i>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto px-4 md:px-0">
              <button onClick={() => setStep(AppStep.UPLOAD)} className="w-full md:w-auto px-10 py-5 border border-white/10 rounded-full font-black uppercase tracking-widest text-[11px] hover:bg-white/5 transition-colors">Back</button>

              <button
                onClick={onGridClick}
                className="w-full md:w-auto bg-[#1d4ed8] hover:bg-blue-600 px-16 py-5 rounded-full font-black uppercase tracking-widest text-[11px] shadow-xl transition-all transform hover:scale-105"
              >
                Generate {gridRows}x3 Grid
              </button>
            </div>
          </div>
        )}

        {/* STORYBOARD GRID STEP */}
        {step === AppStep.STORYBOARD && (
          <div className="animate-in flex flex-col items-center px-4">
            <div className={`bg-[#0c0c0e] p-4 md:p-6 rounded-[3rem] border border-white/5 mb-8 shadow-2xl transition-all duration-500
              ${gridRows === 1 ? 'w-full max-w-4xl' : gridRows === 2 ? 'w-full max-w-2xl' : 'w-full max-w-md'}
            `}>
              <img 
                src={state.storyboardGrid!} 
                className={`rounded-[2rem] w-full object-contain
                  ${gridRows === 1 ? 'aspect-[16/9]' : gridRows === 2 ? 'aspect-[4/5]' : 'aspect-[9/16]'}
                `} 
              />
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
              <button
                onClick={onRegenerateGrid}
                className="w-full md:w-auto bg-white/5 hover:bg-white/10 border border-white/10 px-10 py-5 rounded-full font-black uppercase tracking-[0.2em] text-[11px] transition-colors flex items-center justify-center gap-2 text-zinc-400 hover:text-white"
              >
                <i className="fa-solid fa-rotate-right"></i>
                Regenerate Grid
              </button>
              <button onClick={onFinalRenderClick} className="w-full md:w-auto bg-[#1d4ed8] hover:bg-blue-600 px-12 md:px-24 py-5 md:py-6 rounded-full font-black uppercase tracking-[0.2em] text-[12px] shadow-2xl">
                Proceed to Final Render
              </button>
            </div>
          </div>
        )}

        {/* 3. FINAL RENDER (RESULTS) */}
        {step === AppStep.RESULTS && (
          <div className="animate-in grid grid-cols-12 gap-8 md:gap-12">

            {/* Sidebar (Stacks on mobile) */}
            <aside className="col-span-12 lg:col-span-3 space-y-6 md:space-y-10 order-2 lg:order-1">
              <div className="space-y-4">
                <h3 className="text-[13px] font-black uppercase tracking-[0.3em] text-blue-500">Master Reference</h3>
                <p className="text-[11px] font-medium text-zinc-500 leading-relaxed uppercase">
                  System slicing scenes from master grid.
                </p>
              </div>

              <div className={`bg-[#0c0c0e] p-4 rounded-[2.5rem] border border-white/5 overflow-hidden mx-auto lg:max-w-none transition-all
              ${gridRows === 1 ? 'max-w-full' : 'max-w-xs'} 
            `}>
              {state.storyboardGrid && (
                <img 
                  src={state.storyboardGrid} 
                  className={`rounded-[1.5rem] w-full object-cover opacity-80
                    ${gridRows === 1 ? 'aspect-[16/9]' : gridRows === 2 ? 'aspect-[4/5]' : 'aspect-[9/16]'}
                  `} 
                />
              )}
            </div>
            </aside>

            {/* Main Content */}
            <section className="col-span-12 lg:col-span-9 space-y-8 md:space-y-12 order-1 lg:order-2">

              <div className="flex flex-col xl:flex-row justify-between items-end gap-6 md:gap-8">
                <div className="space-y-2 w-full xl:w-auto">
                  <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic">
                    Final <span className="text-[#4dabf7] not-italic">Render</span>
                  </h2>
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-600">Shot Selection & Motion Export</p>
                </div>

                {/* NEW SCI-FI PROGRESS BAR & BILLING INFO */}
                <div className="w-full xl:w-2/5 flex flex-col gap-3">
                  <SciFiProgressBar progress={state.extractionProgress} />

                  {!useCustomKey && (
                    <div className="bg-[#0f172a]/50 border border-blue-500/20 rounded-lg p-3 flex items-start gap-3 animate-in">
                      <div className="p-1.5 bg-blue-500/10 rounded-md">
                        <i className="fa-solid fa-file-invoice-dollar text-blue-400 text-xs"></i>
                      </div>
                      <div>
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-blue-300 mb-0.5">
                          Cloud Project Billing Active
                        </h4>
                        <p className="text-[9px] text-zinc-400 font-medium leading-relaxed">
                          Estimated Cost & Credit Usage: Video generation is calculated per minute.
                          <span className="block text-zinc-500 mt-0.5">Check your Google Cloud Console for real-time billing details.</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Individual Shot Grid - Improved Responsive */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                {/* Only render scenes up to the total needed based on rows.
                    3 rows = 9 scenes, 2 rows = 6 scenes, 1 row = 3 scenes
                 */}
                {state.scenes.slice(0, gridRows * 3).map((scene, idx) => (
                  <div key={scene.id} className="bg-[#0c0c0e] border border-white/5 rounded-[2.5rem] md:rounded-[3.5rem] p-5 md:p-6 flex flex-col gap-5 md:gap-6 relative group overflow-hidden">

                    <div className={`aspect-[9/16] rounded-[2rem] md:rounded-[2.5rem] overflow-hidden relative shadow-2xl ${(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo || scene.isEditing) ? 'animated-gradient-border' : 'border border-white/5'
                      }`}>
                      <div className="bg-inner-card w-full h-full relative z-10">
                        {scene.image ? (
                          scene.videoUrl ?
                            <video
                              src={scene.videoUrl}
                              autoPlay
                              loop
                              muted={scene.isVideoMuted}
                              onLoadedMetadata={(e) => {
                                const duration = e.currentTarget.duration;
                                updateSceneField(idx, 'videoDuration', formatDuration(duration));
                              }}
                              className="w-full h-full object-cover"
                            /> :
                            <img src={scene.image} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-zinc-900/10">
                            {scene.isExtracting ? (
                              <>
                                <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                                <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Slicing Shot</span>
                              </>
                            ) : (
                              <i className="fa-solid fa-image-slash text-zinc-800 text-2xl"></i>
                            )}
                          </div>
                        )}
                      </div>

                      {(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo || scene.isEditing) && (
                        <div className="absolute inset-0 bg-[#050506]/90 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
                          
                          {scene.isGeneratingVideo ? (
                            <div className="flex flex-col items-center justify-center text-center px-6">
                              
                              <div className="relative w-14 h-14 mb-5">
                                <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full"></div>
                                <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                {/* Ikon Film di tengah */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <i className="fa-solid fa-video text-blue-500/60 text-sm animate-pulse"></i>
                                </div>
                              </div>

                              <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-white mb-3">
                                Generating Motion
                              </h4>

                              <div className="bg-blue-900/20 border border-blue-500/30 px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                                <p className="text-[9px] font-mono font-bold text-blue-400 tracking-wider">
                                  <i className="fa-regular fa-clock mr-2"></i>
                                  EST: 4-5 MINUTES
                                </p>
                              </div>

                              <p className="text-[8px] text-zinc-500 mt-4 font-medium uppercase tracking-wide opacity-60">
                                Please do not close this tab
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin mb-4"></div>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Processing</p>
                            </div>
                          )}
                        </div>
                      )}

                      {scene.image && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-2 z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 w-max px-4">
                          <div className="flex bg-black/80 backdrop-blur-xl rounded-2xl p-1.5 border border-white/10 shadow-2xl items-center gap-1.5">

                            {/* Downloads */}
                            <button onClick={() => downloadMedia(scene.image!, `shot - ${idx + 1} -still.png`)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors group/btn relative" title="Download Image">
                              <i className="fa-solid fa-image text-zinc-400 group-hover/btn:text-white transition-colors"></i>
                              <i className="fa-solid fa-arrow-down text-[8px] absolute bottom-1.5 right-1.5 text-zinc-500 group-hover/btn:text-white"></i>
                            </button>

                            {scene.videoUrl && (
                              <button onClick={() => downloadMedia(scene.videoUrl!, `shot - ${idx + 1} -motion.mp4`)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-blue-600/30 transition-colors group/btn relative bg-blue-600/10 border border-blue-500/20" title="Download Video">
                                <i className="fa-solid fa-film text-blue-400"></i>
                                <i className="fa-solid fa-arrow-down text-[8px] absolute bottom-1.5 right-1.5 text-blue-300"></i>
                              </button>
                            )}

                            <div className="w-px h-4 bg-white/20 mx-1"></div>

                            {/* Upscales */}
                            <button onClick={() => onUpscale(idx, '2K')} className="px-2 py-1.5 text-[8px] font-black uppercase rounded-lg hover:bg-blue-600 transition-colors text-white hover:text-white text-zinc-400">2K</button>
                            <button onClick={() => onUpscale(idx, '4K')} className="px-2 py-1.5 text-[8px] font-black uppercase rounded-lg hover:bg-blue-600 transition-colors text-white hover:text-white text-zinc-400">4K</button>

                            <div className="w-px h-4 bg-white/20 mx-1"></div>

                            {/* NEW: Upload Reference for Fix */}
                            <label className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-blue-600 transition-colors text-zinc-400 hover:text-white cursor-pointer" title="Upload Reference to Fix">
                              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleSceneReferenceUpload(e, idx)} />
                              <i className="fa-solid fa-upload text-[12px]"></i>
                            </label>

                            {/* Repair */}
                            <button onClick={() => onRepair(idx)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-blue-600 transition-colors text-zinc-400 hover:text-white" title="Auto Repair">
                              <i className="fa-solid fa-wand-magic-sparkles text-[12px]"></i>
                            </button>

                          </div>
                        </div>
                      )}

                      {/* Video Controls Overlay */}
                      {scene.videoUrl && (
                        <div className="absolute bottom-3 right-3 z-50 flex items-center gap-2 animate-in">
                          <span className="text-[9px] font-mono font-bold bg-black/60 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10 text-white shadow-lg">
                            {scene.videoDuration || "00:00"}
                          </span>
                          <button
                            onClick={() => updateSceneField(idx, 'isVideoMuted', !scene.isVideoMuted)}
                            className="w-7 h-7 flex items-center justify-center bg-black/60 rounded-full backdrop-blur-sm border border-white/10 hover:bg-white/20 transition-colors shadow-lg"
                            title={scene.isVideoMuted ? "Unmute" : "Mute"}
                          >
                            <i className={`fa - solid ${scene.isVideoMuted ? 'fa-volume-xmark' : 'fa-volume-high'} text - [10px] text - white`}></i>
                          </button>
                        </div>
                      )}

                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-6 py-2 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl z-40">
                        Shot 0{idx + 1}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* NEW: IMAGE EDITING INPUT */}
                      <div className="flex gap-2">
                        <div className="bg-[#12141a] rounded-xl flex-1 border border-white/5 relative group/input">
                          <input
                            type="text"
                            value={state.editPrompts?.[idx] || ""}
                            onChange={(e) => {
                              const newPrompts = [...state.editPrompts];
                              newPrompts[idx] = e.target.value;
                              setState(prev => ({ ...prev, editPrompts: newPrompts }));
                            }}
                            placeholder="Edit pose, angle (e.g. Side profile, Zoom out)..."
                            className="w-full bg-transparent text-[10px] py-3 px-4 outline-none placeholder:text-zinc-700 text-zinc-300 font-medium tracking-wide"
                          />
                          <i className="fa-solid fa-pen-nib absolute right-3 top-1/2 -translate-y-1/2 text-zinc-700 text-xs"></i>
                        </div>
                        <button
                          onClick={() => onEditImage(idx)}
                          disabled={!state.scenes[idx].image || state.scenes[idx].isEditing || !state.editPrompts[idx]}
                          className="bg-[#1e1e24] hover:bg-blue-600 border border-white/5 rounded-xl w-10 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-[#1e1e24] shadow-lg"
                          title="Apply Image Edit"
                        >
                          <i className="fa-solid fa-check text-[10px] text-white"></i>
                        </button>
                      </div>

                      {/* VIDEO PROVIDER SELECTION */}
                      <div className="bg-[#070708] rounded-2xl p-4 border border-white/5 relative">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 block mb-3">
                          Video Generation Provider
                        </label>

                        <div className="relative">
                          <select
                            value={scene.selectedVideoProvider || 'VEO_3.1'}
                            onChange={(e) => updateSceneField(idx, 'selectedVideoProvider', e.target.value)}
                            className="w-full bg-[#12141a] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-300 outline-none focus:border-blue-500/50 transition-colors cursor-pointer appearance-none pr-10"
                          >
                            <optgroup label="Google Veo">
                              <option value="VEO_3.1">🎬 Veo 3.1</option>
                              <option value="VEO_3.1_FAST">🎬 Veo 3.1 Fast</option>
                            </optgroup>
                            <optgroup label="Kling AI">
                              <option value="KLING_2.5">⚡ Kling 2.5</option>
                              <option value="KLING_2.6">⚡ Kling 2.6</option>
                            </optgroup>
                            <optgroup label="Wan AI">
                              <option value="WAN_2.5">🌊 Wan 2.5</option>
                              <option value="WAN_2.6">🌊 Wan 2.6</option>
                            </optgroup>
                            <optgroup label="Seedance">
                              <option value="SEEDANCE_PRO">🌱 Seedance Pro</option>
                              <option value="SEEDANCE_1.5_PRO">🌱 Seedance 1.5 Pro</option>
                            </optgroup>
                            <optgroup label="Minimax">
                              <option value="MINIMAX">🎯 Minimax</option>
                            </optgroup>
                          </select>

                          {/* Dropdown icon */}
                          <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none"></i>
                        </div>

                        {/* AUDIO TOGGLE - ONLY for models with native audio support */}
                        {(scene.selectedVideoProvider === 'VEO_3.1' ||
                          scene.selectedVideoProvider === 'VEO_3.1_FAST' ||
                          scene.selectedVideoProvider === 'KLING_2.6' ||
                          scene.selectedVideoProvider === 'WAN_2.6' ||
                          scene.selectedVideoProvider === 'SEEDANCE_1.5_PRO') && (
                            <div className="mt-3 p-3 bg-[#12141a] border border-blue-500/20 rounded-xl">
                              <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={scene.enableAudio || false}
                                  onChange={(e) => updateSceneField(idx, 'enableAudio', e.target.checked)}
                                  className="w-4 h-4 rounded border-2 border-blue-500/50 bg-zinc-900 checked:bg-blue-600 checked:border-blue-600 cursor-pointer transition-all"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <i className="fa-solid fa-volume-high text-blue-400 text-xs"></i>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Enable Native Audio</span>
                                  </div>
                                  <p className="text-[8px] text-zinc-500 mt-0.5">Generate synchronized audio with video</p>
                                </div>
                              </label>
                            </div>
                          )}

                        {/* RESOLUTION SELECTOR - ALL MODELS */}
                        <div className="mt-3">
                          <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 block mb-2">
                            Video Resolution
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => updateSceneField(idx, 'videoResolution', '720p')}
                              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${(scene.videoResolution || '720p') === '720p'
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-[#12141a] border-white/10 text-zinc-400 hover:border-blue-500/50'
                                }`}
                            >
                              720p HD
                            </button>
                            <button
                              onClick={() => updateSceneField(idx, 'videoResolution', '1080p')}
                              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${scene.videoResolution === '1080p'
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-[#12141a] border-white/10 text-zinc-400 hover:border-blue-500/50'
                                }`}
                            >
                              <span>1080p Full HD</span>
                              <span className="text-[8px] ml-1 text-yellow-400">+50%</span>
                            </button>
                          </div>
                        </div>


                      </div>

                      {/* DURATION CONTROL */}
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Video Duration</span>
                          <span className="text-sm font-mono font-black text-blue-400">{scene.duration}s</span>
                        </div>
                        <input
                          type="range"
                          min={getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').min}
                          max={getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').max}
                          value={scene.duration}
                          onChange={(e) => updateSceneField(idx, 'duration', parseInt(e.target.value))}
                          className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between mt-2">
                          <span className="text-[10px] text-zinc-500 font-medium">{getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').min}s min</span>
                          <span className="text-[10px] text-zinc-500 font-medium">{getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').max}s max</span>
                        </div>

                        {/* COST ESTIMATION */}
                        <div className="mt-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Estimated Cost</span>
                            <span className="text-xs font-black text-green-400">
                              {formatCost(calculateVideoCost(scene.selectedVideoProvider || 'VEO_3.1', scene.duration, scene.videoResolution || '720p', scene.enableAudio))}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[9px]">
                            <span className="text-zinc-600">Rp 100,000 Budget =</span>
                            <span className="font-bold text-blue-400">
                              {estimateGenerationCount(idrToUsd(100000), scene.selectedVideoProvider || 'VEO_3.1', scene.duration).count}x videos
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] mt-1.5">
                            <span className="text-zinc-600">Est. Generation Time</span>
                            <span className="font-bold text-purple-400">
                              {getGenerationTime(scene.selectedVideoProvider || 'VEO_3.1')}
                            </span>
                          </div>
                          {scene.videoResolution === '1080p' && (
                            <div className="mt-2 pt-2 border-t border-zinc-800 text-[8px] text-yellow-400 flex items-center gap-1">
                              <i className="fa-solid fa-info-circle"></i>
                              <span>1080p costs 1.5x more than 720p</span>
                            </div>
                          )}
                          {scene.enableAudio && scene.selectedVideoProvider?.includes('VEO') && (
                            <div className="mt-2 pt-2 border-t border-zinc-800 text-[8px] text-yellow-400 flex items-center gap-1">
                              <i className="fa-solid fa-info-circle"></i>
                              <span>Audio adds +50% cost for VEO models</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ADVANCED VIDEO GENERATION CONTROLS */}
                      <div className="bg-[#070708] rounded-2xl p-5 border border-white/5 relative">
                        {/* Motion Control Label */}
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Motion Control</span>
                          {/* JSON Toggle - ONLY FOR VEO 3 */}
                          {(scene.selectedVideoProvider === 'VEO_3.1') && (
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleJsonMode(idx)}>
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${scene.jsonMode ? 'text-zinc-500' : 'text-blue-400'}`}>Simple</span>
                              <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${scene.jsonMode ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${scene.jsonMode ? 'translate-x-5' : 'translate-x-0'}`}></div>
                              </div>
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${scene.jsonMode ? 'text-blue-400' : 'text-zinc-500'}`}>JSON</span>
                            </div>
                          )}
                        </div>

                        {scene.jsonMode ? (
                          <textarea
                            value={scene.jsonPrompt}
                            onChange={(e) => updateSceneField(idx, 'jsonPrompt', e.target.value)}
                            className="w-full bg-transparent text-[10px] font-mono text-blue-200/80 h-32 resize-none outline-none leading-relaxed placeholder:text-zinc-800"
                            placeholder='{"motion": "...", "music": "...", "dialogue": "..."}'
                          />
                        ) : (
                          <div className="space-y-3">
                            <textarea
                              value={scenePrompts[idx]}
                              onChange={(e) => { const p = [...scenePrompts]; p[idx] = e.target.value; setScenePrompts(p); }}
                              className="w-full bg-transparent text-[11px] font-medium text-zinc-400 h-16 resize-none outline-none leading-relaxed placeholder:text-zinc-700 border-b border-white/5 pb-2"
                              placeholder="Motion prompt (e.g. subtle, cinematic, static, pan, walk)..."
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={scene.bgMusicPrompt || ""}
                                onChange={(e) => updateSceneField(idx, 'bgMusicPrompt', e.target.value)}
                                placeholder="Bg Music (e.g. Jazz)"
                                className="bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-blue-500/50 placeholder:text-zinc-700"
                              />
                              <input
                                type="text"
                                value={scene.dialoguePrompt || ""}
                                onChange={(e) => updateSceneField(idx, 'dialoguePrompt', e.target.value)}
                                placeholder="Dialogue (optional)"
                                className="bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-blue-500/50 placeholder:text-zinc-700"
                              />
                            </div>
                          </div>
                        )}
                      </div>



                      <button
                        onClick={() => onVideo(idx)}
                        disabled={!scene.image || scene.isGeneratingVideo}
                        className="w-full bg-[#12141a] hover:bg-[#1d4ed8] border border-white/5 py-4 md:py-5 rounded-2xl text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] transition-all disabled:opacity-10 active:scale-95 shadow-xl"
                      >
                        {scene.isGeneratingVideo ? 'Processing...' : 'Generate Motion'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ENTRY GATE / ACCESS CONTROL */}
      {showKeyModal && !useCustomKey && (
        <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="bg-[#0c0c0e] p-8 md:p-12 rounded-[3rem] md:rounded-[4rem] w-full max-w-md border border-blue-600/20 text-center space-y-6 shadow-2xl relative overflow-hidden">

            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-green-500"></div>

            <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto border border-blue-500/20">
              <i className="fa-solid fa-fingerprint text-blue-500 text-2xl md:text-3xl"></i>
            </div>

            <div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter mb-3 italic">System Access</h2>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Connect API keys - One-time setup</p>
            </div>


            {/* FAL AI - REQUIRED */}
            <div className="text-left space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                    <i className="fa-solid fa-bolt text-white text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400">FAL AI</h3>
                    <p className="text-[8px] text-zinc-600 font-medium">Required for full features</p>
                  </div>
                </div>
                <div className="bg-purple-500/20 text-purple-400 text-[8px] font-black uppercase px-2 py-1 rounded-full border border-purple-500/40">
                  PAID
                </div>
              </div>

              <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3 space-y-2">
                <div className="text-[9px] text-zinc-400 space-y-1">
                  <div className="flex items-start gap-2">
                    <i className="fa-solid fa-video text-purple-400 mt-0.5"></i>
                    <span>Video generation (Kling, Wan, Minimax)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <i className="fa-solid fa-sparkles text-purple-400 mt-0.5"></i>
                    <span>Premium images (Seedream 4.5)</span>
                  </div>
                </div>
                <input
                  type="password"
                  value={tempFalKey}
                  onChange={(e) => setTempFalKey(e.target.value)}
                  placeholder="fal_... (required)"
                  className="w-full bg-[#050506] border border-white/10 rounded-lg py-2.5 px-3 text-[10px] font-mono text-white outline-none focus:border-purple-600/50 transition-colors placeholder:text-zinc-700"
                />
                <a
                  href="https://fal.ai/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[8px] text-purple-400 hover:text-purple-300 underline block"
                >
                  Get key at fal.ai/dashboard →
                </a>
              </div>
            </div>

            <button
              onClick={handleSaveCustomKey}
              disabled={isValidatingKey || !tempFalKey}
              className="w-full bg-gradient-to-r from-purple-600/30 to-purple-600/50 hover:from-purple-600/50 hover:to-purple-600/70 disabled:opacity-50 border border-purple-500/50 text-white py-4 rounded-xl font-bold uppercase text-[11px] tracking-widest transition-all mt-4"
            >
              {isValidatingKey ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                  Validating...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-rocket mr-2"></i>
                  Connect & Start
                </>
              )}
            </button>

            {keyError && (
              <div className="bg-red-900/20 border border-red-700/50 text-red-300 text-[9px] rounded-lg px-4 py-3 mt-4">
                <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                {keyError}
              </div>
            )}

            <p className="text-zinc-700 text-[8px] text-center uppercase tracking-wide mt-4">
              <span className="font-black">Get paid key for full features</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;