import React, { useState, useEffect, useRef } from 'react';
import { AppStep, GenerationState, AiProvider, VideoProvider, PosterState, PosterResult, ClipSegment, ClipConfig, ClipEditorState } from './types.ts';
import {
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
import { generateImageViaPollinations } from './services/pollinationsService.ts';
import { generateImageViaHuggingFace, validateHfToken } from './services/huggingfaceService.ts';
import { generateImageViaPuter, PUTER_IMAGE_MODELS } from './services/puterService.ts';
import { generateImageViaProdia, validateProdiaKey } from './services/prodiaService.ts';
import { generateImageViaTogether, validateTogetherKey } from './services/togetherService.ts';
import { secureGetItem, secureSetItem, secureRemoveItem, validateApiKeyFormat, sanitizeApiKey } from './utils/secureStorage.ts';
import { getDurationLimits, formatCost, calculateVideoCost, estimateGenerationCount, idrToUsd, getGenerationTime, getSessionCost, addSessionCost, resetSessionCost, calculateImageCost } from './utils/costEstimator.ts';
import { POSTER_STYLES, POSTER_FORMATS, PRODUCT_PLACEMENTS, POSTER_MOODS, POSTER_LAYOUTS, BACKGROUND_TYPES, QUICK_PROMPT_CHIPS, MOTION_PROMPT_CHIPS, buildPosterPrompt, getDefaultPosterConfig } from './utils/posterStyles.ts';
import { randomCutVideo, smartCutVideo, equalSplitVideo, parseTimestamps, createClipFromSegments, exportClip, calculateTotalDuration, formatTimestamp, generateSegmentId } from './utils/videoClipper.ts';

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="w-full select-none">
    <div className="flex justify-between items-end mb-2">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
        <span className="text-xs font-bold text-cyan-400 lowercase">cooking...</span>
      </div>
      <span className="text-xs font-mono font-bold text-zinc-500">{progress}% done</span>
    </div>
    <div className="relative h-3 bg-[#111118] rounded-full overflow-hidden border border-white/5">
      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-lime-400 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }}>
        <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 rounded-full blur-sm"></div>
      </div>
    </div>
  </div>
);

const LoadingScreen: React.FC<{ message: string }> = ({ message }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let c = 0;
    const iv = setInterval(() => { c += Math.random() * 1.5 + 0.5; if (c > 95) c = 95; setProgress(Math.round(c)); }, 400);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4 text-center animate-in">
      <div className="w-full max-w-lg p-8 rounded-3xl border border-white/5 bg-[#111118]/90 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-lime-400 to-cyan-500 animate-pulse"></div>
        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <div className="w-12 h-12 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-sm font-bold text-white lowercase">cooking something fire...</h3>
            <p className="text-xs font-bold text-cyan-400 lowercase animate-pulse">{message}</p>
          </div>
          <div className="px-6"><ProgressBar progress={progress} /></div>
        </div>
      </div>
    </div>
  );
};

const CATEGORIZED_PROMPTS = {
  "Fashion Wearables": [
    { label: "Tops / Atasan", text: "CLOTHING REPLACE: Swap the model's upper garment with the Product Image. Warp the fabric texture to fit the model's torso anatomy perfectly. Preserve skin tone, hands, and neck. Match lighting and fabric folds." },
    { label: "Bottoms / Celana", text: "CLOTHING REPLACE: Swap the model's pants/skirt with the Product Image. Align the waistband naturally. Ensure the fabric drapes correctly over the legs. Keep the model's upper body and shoes intact." },
    { label: "Muslim / Hijab", text: "MODEST FASHION: Integrate the product (Hijab/Gamis) onto the model. Ensure a loose, modest fit. If swapping Hijab, frame the face naturally without altering facial features. Fabric should flow elegantly." },
    { label: "Full Outfit", text: "FULL OUTFIT SWAP: Dress the model in the complete set from the Product Image. Retain the model's pose exactly. Re-light the fabric to match the environment. Ensure high-fidelity texture mapping." }
  ],
  "Objects & Lifestyle": [
    { label: "Handheld / Gadget", text: "NATURAL GRIP: Place the product in the model's hand. CRITICAL: Generate realistic fingers wrapping around the object with correct tension. Ensure the object scale is accurate. Add contact shadows." },
    { label: "Tabletop / Home", text: "SCENE PLACEMENT: Place the product on the surface in front of the model. Match the perspective and depth of field. Cast realistic shadows onto the table consistent with scene lighting." },
    { label: "Beauty / Skincare", text: "BEAUTY SHOT: Model holding the product near the face. Focus on skin texture. Ensure the product label is legible and facing the camera. Do not obstruct key facial features." },
    { label: "Footwear / Shoes", text: "SHOE SWAP: Replace the model's shoes with the Product Image. Ensure the feet are grounded correctly on the floor. Match the angle of the foot/ankle to the shoe perspective." }
  ]
};

const BACKGROUND_PRESETS = [
  "High-end Minimalist Studio", "Urban City Bokeh", "Luxury Interior", "Soft Natural Light",
  "Cyberpunk Neon", "Abstract Gradient", "Beige / Warm Tones", "Nature / Outdoor Garden"
];
const FONT_OPTIONS = ["Modern Sans","Elegant Serif","Bold Graffiti","Neon Script","Futuristic Mono","Vintage Typewriter","Handwritten Signature","3D Chrome","Gothic Bold","Minimalist Thin"];
const PLACEMENT_OPTIONS = ["Behind Subject","Floating Above","Integrated Neon Sign","Overlay Bottom","Vertical Side","Floor Reflection","Halo Effect","Wrapped Around Subject","Magazine Header"];

type ModalProviderTab = 'POLLINATIONS' | 'PUTER' | 'HUGGINGFACE' | 'PRODIA' | 'TOGETHER' | 'FAL' | 'GEMINI';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [showKeyModal, setShowKeyModal] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [gridRows, setGridRows] = useState(3);
  const [activeProvider, setActiveProvider] = useState<AiProvider>('POLLINATIONS');
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [tempFalKey, setTempFalKey] = useState('');
  const [tempHfKey, setTempHfKey] = useState('');
  const [tempProdiaKey, setTempProdiaKey] = useState('');
  const [tempTogetherKey, setTempTogetherKey] = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [modalProviderTab, setModalProviderTab] = useState<ModalProviderTab>('POLLINATIONS');

  const [state, setState] = useState<GenerationState>({
    activeProvider: 'POLLINATIONS',
    selectedImageModel: 'nano-banana-pro',
    modelImage: null, productImage: null, promptInstruction: '',
    combinedImage: null, combinedCandidates: null,
    brandingText: '', stylePrompt: 'High-end minimalist studio with soft moody lighting',
    fontStyle: 'Modern Sans', textPlacement: 'Behind Subject',
    storyboardGrid: null,
    scenes: Array.from({ length: 9 }, (_, i) => ({
      id: i, image: null, videoUrl: null, isExtracting: false, isGeneratingVideo: false,
      isUpscaling: false, isEditing: false, duration: 5, videoProgress: 0,
      bgMusicPrompt: '', dialoguePrompt: '', jsonMode: false,
      jsonPrompt: '{\n  "motion": "Cinematic pan",\n  "music": "Lo-fi beat",\n  "dialogue": "..."\n}',
      isVideoMuted: true, videoDuration: '00:00', selectedVideoProvider: 'VEO_3.1' as VideoProvider
    })),
    editPrompts: Array(9).fill(''), extractionProgress: 0,
  });

  // Poster state
  const [posterState, setPosterState] = useState<PosterState>({
    productImage: null, config: getDefaultPosterConfig(), results: [], isGenerating: false, generationProgress: 0
  });
  const [posterSubStep, setPosterSubStep] = useState<'upload' | 'style' | 'settings' | 'results'>('upload');
  const [posterProvider, setPosterProvider] = useState<AiProvider>('POLLINATIONS');

  // Clip editor state
  const [clipState, setClipState] = useState<ClipEditorState>({
    videoFile: null, videoDuration: 0, clips: [], previewUrl: null, isProcessing: false,
    config: { sourceVideoUrl: '', segments: [], transition: 'cut', transitionDuration: 0.5, outputFormat: 'mp4', speed: 1, enableReverse: false, loopCount: 1, addFadeIn: false, addFadeOut: false, fadeDuration: 0.5 }
  });
  const [clipQuickAction, setClipQuickAction] = useState<'random' | 'beat' | 'equal' | 'manual' | null>(null);
  const [clipManualInput, setClipManualInput] = useState('');
  const [clipRandomCount, setClipRandomCount] = useState(5);
  const [clipBeatInterval, setClipBeatInterval] = useState(2);
  const [clipEqualParts, setClipEqualParts] = useState(4);
  const clipVideoRef = useRef<HTMLVideoElement>(null);

  const [scenePrompts, setScenePrompts] = useState<string[]>(Array(9).fill("Subtle cinematic motion, elegant model moves naturally."));
  const [repairPrompts, setRepairPrompts] = useState<string[]>(Array(9).fill("Fix any glitches and enhance facial details."));
  const [sessionCost, setSessionCost] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setSessionCost(getSessionCost()), 1000);
    return () => clearInterval(iv);
  }, []);

  // --- Key Management ---
  const checkKeys = async () => {
    const pollinations = true; // Always available
    const geminiKey = secureGetItem('USER_GEMINI_API_KEY');
    const falKey = secureGetItem('USER_FAL_API_KEY');
    const hfKey = secureGetItem('USER_HF_API_KEY');

    if (falKey && falKey.length > 5) { setUseCustomKey(true); setActiveProvider('FAL'); setShowKeyModal(false); return; }
    if (geminiKey && geminiKey.length > 5) { setUseCustomKey(true); setActiveProvider('GEMINI'); setShowKeyModal(false); return; }
    if (hfKey && hfKey.length > 5) { setUseCustomKey(true); setActiveProvider('HUGGINGFACE'); setShowKeyModal(false); return; }

    // Pollinations is always free, allow entry
    setActiveProvider('POLLINATIONS');
    setUseCustomKey(true);
    setShowKeyModal(false);
  };

  useEffect(() => { checkKeys(); }, []);

  const handleSaveCustomKey = async () => {
    setKeyError('');
    setIsValidatingKey(true);
    let anyValid = false;
    try {
      if (modalProviderTab === 'POLLINATIONS') {
        setActiveProvider('POLLINATIONS'); anyValid = true;
      }
      if (tempFalKey) {
        const s = sanitizeApiKey(tempFalKey);
        if (!validateApiKeyFormat(s, 'FAL')) { setKeyError('Invalid FAL key'); setIsValidatingKey(false); return; }
        const ok = await validateFalKey(s);
        if (!ok) { setKeyError('FAL key validation failed'); setIsValidatingKey(false); return; }
        secureSetItem('USER_FAL_API_KEY', s); setActiveProvider('FAL'); anyValid = true;
      }
      if (tempGeminiKey) {
        const s = sanitizeApiKey(tempGeminiKey);
        if (!validateApiKeyFormat(s, 'GEMINI')) { setKeyError('Invalid Gemini key'); setIsValidatingKey(false); return; }
        const ok = await validateApiKey(s);
        if (!ok) { setKeyError('Gemini key failed'); setIsValidatingKey(false); return; }
        secureSetItem('USER_GEMINI_API_KEY', s); setActiveProvider('GEMINI'); anyValid = true;
      }
      if (tempHfKey) {
        const s = sanitizeApiKey(tempHfKey);
        const ok = await validateHfToken(s);
        if (!ok) { setKeyError('HuggingFace token invalid'); setIsValidatingKey(false); return; }
        secureSetItem('USER_HF_API_KEY', s); setActiveProvider('HUGGINGFACE'); anyValid = true;
      }
      if (tempProdiaKey) {
        const s = sanitizeApiKey(tempProdiaKey);
        const ok = await validateProdiaKey(s);
        if (!ok) { setKeyError('Prodia key invalid'); setIsValidatingKey(false); return; }
        secureSetItem('USER_PRODIA_API_KEY', s); anyValid = true;
      }
      if (tempTogetherKey) {
        const s = sanitizeApiKey(tempTogetherKey);
        const ok = await validateTogetherKey(s);
        if (!ok) { setKeyError('Together key invalid'); setIsValidatingKey(false); return; }
        secureSetItem('USER_TOGETHER_API_KEY', s); anyValid = true;
      }
      if (anyValid) { setUseCustomKey(true); setShowKeyModal(false); }
    } catch (e: any) { setKeyError(e.message || 'Validation failed'); }
    finally { setIsValidatingKey(false); }
  };

  const handleDisconnect = () => {
    secureRemoveItem('USER_GEMINI_API_KEY'); secureRemoveItem('USER_FAL_API_KEY');
    secureRemoveItem('USER_HF_API_KEY'); secureRemoveItem('USER_PRODIA_API_KEY'); secureRemoveItem('USER_TOGETHER_API_KEY');
    setUseCustomKey(false); setShowKeyModal(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'model' | 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setState(prev => ({ ...prev, [type === 'model' ? 'modelImage' : 'productImage']: ev.target?.result as string }));
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
        const defaults = ["Close-up product detail shot","Medium shot, product interaction","Lifestyle context shot, cinematic environment"];
        const userP = state.editPrompts[idx] || state.promptInstruction || "";
        const img = await regenerateSceneFromReference(base64, `${defaults[row]}. ${userP}`, state.stylePrompt);
        setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isEditing: false } : s) }));
      } catch (error) { handleError(error); setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isEditing: false } : s) })); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleError = (e: any) => {
    console.error(e);
    if (e.message === "QUOTA_LIMIT_ZERO") setQuotaError("API quota is zero. Please check billing.");
    else if (e.message === "API_KEY_INVALID") { alert("API Key invalid. Please reconnect."); secureRemoveItem('USER_GEMINI_API_KEY'); setShowKeyModal(true); }
    else alert("Error: " + (e.message || "Unknown error"));
  };

  const downloadMedia = (url: string, filename: string) => {
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const onRefineClick = async () => {
    if (!state.modelImage || !state.productImage) return;
    setLoadingMsg("generating variations..."); setQuotaError(null);
    try {
      const res = await generateRefinementVariations(state.modelImage, state.productImage, state.promptInstruction, state.selectedImageModel);
      setState(prev => ({ ...prev, combinedCandidates: res, combinedImage: res[0] }));
      setStep(AppStep.REFINE);
    } catch (e: any) { handleError(e); }
    setLoadingMsg("");
  };

  const onApplyBrandingClick = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("applying branding..."); setQuotaError(null);
    try {
      const res = await generateBrandingVariations(state.combinedImage, state.brandingText, state.stylePrompt || "Cinematic", state.fontStyle || "Modern Sans", state.textPlacement || "Behind Subject");
      setState(prev => ({ ...prev, combinedImage: res[0], combinedCandidates: res }));
    } catch (e: any) { handleError(e); }
    setLoadingMsg("");
  };

  const onGridClick = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg(`generating ${gridRows}x3 grid...`); setQuotaError(null);
    try {
      const res = await generateStoryboardGrid(state.combinedImage, state.brandingText, state.stylePrompt || "Cinematic", state.promptInstruction, state.selectedImageModel, gridRows);
      setState(prev => ({ ...prev, storyboardGrid: res }));
      setStep(AppStep.STORYBOARD);
    } catch (e: any) { handleError(e); }
    setLoadingMsg("");
  };

  const onFinalRenderClick = async () => {
    if (!state.storyboardGrid) return;
    setStep(AppStep.RESULTS); setQuotaError(null);
    const totalCells = gridRows * 3;
    for (let i = 0; i < totalCells; i++) {
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: true } : s) }));
      await new Promise(r => setTimeout(r, 200));
      try {
        const img = await extractCell(state.storyboardGrid!, i, gridRows, state.modelImage || undefined);
        setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === i ? { ...s, image: img, isExtracting: false } : s), extractionProgress: Math.round(((i + 1) / totalCells) * 100) }));
      } catch (e: any) {
        if (e.message === "QUOTA_LIMIT_ZERO") { setQuotaError("Quota limit reached."); break; }
      }
    }
  };

  const onUpscale = async (idx: number, size: '2K' | '4K') => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isUpscaling: true } : s) }));
    try { const img = await upscaleScene(state.scenes[idx].image!, size); setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isUpscaling: false } : s) })); }
    catch (e) { handleError(e); }
  };

  const onRepair = async (idx: number) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isExtracting: true } : s) }));
    try { const img = await repairImage(state.scenes[idx].image!, repairPrompts[idx], state.modelImage || undefined); setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isExtracting: false } : s) })); }
    catch (e) { handleError(e); }
  };

  const onEditImage = async (idx: number) => {
    const prompt = state.editPrompts[idx];
    if (!prompt || !state.scenes[idx].image) return;
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isEditing: true } : s) }));
    try { const img = await editSceneImage(state.scenes[idx].image!, prompt, state.modelImage || undefined); setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isEditing: false } : s) })); }
    catch (e) { handleError(e); }
  };

  const onVideo = async (idx: number) => {
    const scene = state.scenes[idx];
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: true, videoProgress: 0 } : s) }));
    let finalPrompt = "";
    if (scene.jsonMode && scene.jsonPrompt) { finalPrompt = scene.jsonPrompt; }
    else {
      const parts = [];
      if (scenePrompts[idx]) parts.push(`Motion: ${scenePrompts[idx]}`);
      if (scene.bgMusicPrompt) parts.push(`Background Music: ${scene.bgMusicPrompt}`);
      if (scene.dialoguePrompt) parts.push(`Dialogue: ${scene.dialoguePrompt}`);
      finalPrompt = parts.join(". ");
    }
    const selectedProvider = scene.selectedVideoProvider || 'VEO_3.1';
    if (activeProvider === 'GEMINI' && selectedProvider !== 'VEO_3.1') {
      alert(`Model ${selectedProvider} requires FAL AI. Please connect FAL key.`);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: false } : s) }));
      return;
    }
    try {
      const url = await generateSceneVideo(state.scenes[idx].image!, finalPrompt, (p) => setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, videoProgress: p } : s) })), selectedProvider, activeProvider, { duration: scene.duration, enableAudio: scene.enableAudio || false, resolution: scene.videoResolution || '720p' });
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, videoUrl: url, isGeneratingVideo: false, videoProgress: 100 } : s) }));
    } catch (e) { handleError(e); setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: false, videoProgress: 0 } : s) })); }
  };

  const updateSceneField = (idx: number, field: keyof GenerationState['scenes'][0], value: any) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, [field]: value } : s) }));
  };

  const formatDuration = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Poster Generation ---
  const onGeneratePoster = async () => {
    const pc = posterState.config;
    const styleDef = POSTER_STYLES.find(s => s.id === pc.styleId) || POSTER_STYLES[0];
    const formatDef = POSTER_FORMATS.find(f => f.id === pc.format) || POSTER_FORMATS[0];
    const placementDef = PRODUCT_PLACEMENTS.find(p => p.id === pc.placement) || PRODUCT_PLACEMENTS[0];
    const moodDef = POSTER_MOODS.find(m => m.id === pc.mood) || POSTER_MOODS[0];
    const layoutDef = POSTER_LAYOUTS.find(l => l.id === pc.layout) || POSTER_LAYOUTS[0];

    const prompt = buildPosterPrompt({
      style: styleDef, format: formatDef, placement: placementDef, mood: moodDef, layout: layoutDef,
      bgType: pc.backgroundType, brandName: pc.brandName, tagline: pc.tagline, ctaText: pc.ctaText,
      boldness: pc.boldness, mainPrompt: pc.mainPrompt, additionalInstructions: pc.additionalInstructions
    });

    setPosterState(prev => ({ ...prev, isGenerating: true, generationProgress: 0 }));

    try {
      const results: PosterResult[] = [];
      for (let i = 0; i < pc.variationCount; i++) {
        setPosterState(prev => ({ ...prev, generationProgress: Math.round(((i) / pc.variationCount) * 100) }));
        let imageUrl = '';
        const varPrompt = `${prompt} Variation ${i + 1} of ${pc.variationCount}, unique composition.`;

        if (posterProvider === 'POLLINATIONS') {
          imageUrl = await generateImageViaPollinations(varPrompt, formatDef.width, formatDef.height);
        } else if (posterProvider === 'HUGGINGFACE') {
          const hfKey = secureGetItem('USER_HF_API_KEY') || '';
          imageUrl = await generateImageViaHuggingFace(varPrompt, 'black-forest-labs/FLUX.1-schnell', hfKey);
        } else if (posterProvider === 'PUTER') {
          imageUrl = await generateImageViaPuter(varPrompt);
        } else if (posterProvider === 'PRODIA') {
          const pKey = secureGetItem('USER_PRODIA_API_KEY') || '';
          imageUrl = await generateImageViaProdia(varPrompt, 'sdxl', pKey);
        } else if (posterProvider === 'TOGETHER') {
          const tKey = secureGetItem('USER_TOGETHER_API_KEY') || '';
          imageUrl = await generateImageViaTogether(varPrompt, 'black-forest-labs/FLUX.1-schnell-Free', tKey);
        }

        results.push({ id: `poster_${Date.now()}_${i}`, imageUrl, prompt: varPrompt, style: pc.styleId, format: pc.format });
      }
      setPosterState(prev => ({ ...prev, results, isGenerating: false, generationProgress: 100 }));
      setPosterSubStep('results');
    } catch (e: any) {
      handleError(e);
      setPosterState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  // --- Clip Editor Handlers ---
  const onClipVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setClipState(prev => ({ ...prev, videoFile: url, config: { ...prev.config, sourceVideoUrl: url } }));
  };

  const onClipVideoLoaded = () => {
    if (clipVideoRef.current) {
      setClipState(prev => ({ ...prev, videoDuration: clipVideoRef.current!.duration }));
    }
  };

  const applyClipAction = () => {
    const dur = clipState.videoDuration;
    if (!dur) return;
    let segs: ClipSegment[] = [];
    if (clipQuickAction === 'random') segs = randomCutVideo(dur, clipRandomCount);
    else if (clipQuickAction === 'beat') segs = smartCutVideo(dur, clipBeatInterval);
    else if (clipQuickAction === 'equal') segs = equalSplitVideo(dur, clipEqualParts);
    else if (clipQuickAction === 'manual') segs = parseTimestamps(clipManualInput, dur);
    setClipState(prev => ({ ...prev, clips: segs }));
  };

  const onExportClip = async () => {
    if (!clipVideoRef.current || clipState.clips.length === 0) return;
    setClipState(prev => ({ ...prev, isProcessing: true }));
    try {
      const blob = await createClipFromSegments(clipVideoRef.current, clipState.clips, clipState.config, (p) => setClipState(prev => ({ ...prev })));
      exportClip(blob, 'creatorkit-clip');
    } catch (e: any) { alert('Export failed: ' + e.message); }
    setClipState(prev => ({ ...prev, isProcessing: false }));
  };

  // --- Provider status helpers ---
  const getProviderStatus = (provider: ModalProviderTab): 'connected' | 'free' | 'not-set' => {
    if (provider === 'POLLINATIONS') return 'free';
    if (provider === 'PUTER') return 'free';
    if (provider === 'FAL') return secureGetItem('USER_FAL_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'GEMINI') return secureGetItem('USER_GEMINI_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'HUGGINGFACE') return secureGetItem('USER_HF_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'PRODIA') return secureGetItem('USER_PRODIA_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'TOGETHER') return secureGetItem('USER_TOGETHER_API_KEY') ? 'connected' : 'not-set';
    return 'not-set';
  };

  const NAV_ITEMS = [
    { step: AppStep.UPLOAD, label: 'upload', emoji: '📤' },
    { step: AppStep.REFINE, label: 'refine', emoji: '✨' },
    { step: AppStep.STORYBOARD, label: 'storyboard', emoji: '🎬' },
    { step: AppStep.RESULTS, label: 'results', emoji: '🎥' },
    { step: AppStep.POSTER, label: 'poster maker', emoji: '🎨' },
    { step: AppStep.CLIP_EDITOR, label: 'clip editor', emoji: '✂️' },
  ];

  const canNavigate = (s: AppStep) => {
    if (s === AppStep.UPLOAD || s === AppStep.POSTER || s === AppStep.CLIP_EDITOR) return true;
    if (s === AppStep.REFINE) return !!(state.combinedImage || state.modelImage);
    if (s === AppStep.STORYBOARD) return !!state.storyboardGrid;
    if (s === AppStep.RESULTS) return state.scenes.some(sc => sc.image);
    return false;
  };

  // ===================== RENDER =====================
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white selection:bg-cyan-500/30 font-sans pb-20 relative overflow-x-hidden">

      {/* HEADER */}
      <header className="pt-6 sm:pt-8 md:pt-12 pb-4 sm:pb-6 md:pb-8 relative px-3 sm:px-4">
        <div className="flex flex-col sm:flex-row justify-center sm:justify-end items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          {sessionCost > 0 && (
            <div className={`bg-gradient-to-r ${sessionCost > 2 ? 'from-red-950/40 to-red-900/20 border-red-500/40' : 'from-cyan-950/40 to-cyan-900/20 border-cyan-500/40'} border rounded-full px-3 sm:px-4 py-1.5 flex items-center gap-2`}>
              <span className="text-xs font-mono font-bold text-white">${sessionCost.toFixed(3)}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${sessionCost > 2 ? 'bg-red-400 animate-pulse' : 'bg-cyan-400'}`}></div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGuide(true)} className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-all">guide</button>
            <button onClick={() => setShowKeyModal(true)} className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-all">api keys</button>
            <div onClick={handleDisconnect} className="bg-cyan-950/20 border border-cyan-500/30 rounded-full px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:opacity-80">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]"></div>
              <span className="text-cyan-400 text-xs font-bold lowercase">{activeProvider}</span>
            </div>
          </div>
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight">
            <span className="gradient-text">CreatorKit AI</span>
            <span className="ml-2 text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full font-bold align-top">beta</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium lowercase">create stunning content with ai</p>
        </div>
      </header>

      {/* NAVIGATION */}
      <nav className="flex flex-wrap justify-center items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8 md:mb-12 px-3 sm:px-4">
        {NAV_ITEMS.map((item, idx) => {
          const isActive = step === item.step;
          const isCompleted = NAV_ITEMS.findIndex(x => x.step === step) > idx && idx < 4;
          const can = canNavigate(item.step);
          return (
            <button key={item.step} onClick={() => can && setStep(item.step)}
              className={`flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl border transition-all text-xs font-bold lowercase
              ${isActive ? 'bg-gradient-to-r from-cyan-600/20 to-lime-500/20 border-cyan-500/50 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                : isCompleted ? 'bg-lime-950/20 border-lime-500/30 text-lime-400'
                : 'bg-[#111118] border-white/5 text-zinc-500 hover:bg-white/5'}
              ${can ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
              <span>{item.emoji}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 lg:px-12">
        {loadingMsg && <LoadingScreen message={loadingMsg} />}

        {quotaError && (
          <div className="mb-8 p-4 sm:p-6 bg-red-600/10 border border-red-500/30 rounded-2xl animate-in flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
            </div>
            <div>
              <h4 className="text-xs font-bold text-red-400 mb-1">quota warning</h4>
              <p className="text-xs text-zinc-400">{quotaError}</p>
            </div>
          </div>
        )}

        {/* ========== UPLOAD STEP ========== */}
        {step === AppStep.UPLOAD && (
          <div className="animate-in flex flex-col items-center max-w-5xl mx-auto w-full px-2 md:px-0">
            <div className="w-full bg-[#111118] border border-white/5 rounded-3xl p-3 sm:p-4 md:p-8 shadow-2xl mb-8">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-6">
                {[{ id: 'model', label: 'drop your model pic' }, { id: 'product', label: 'add product here' }].map(u => (
                  <label key={u.id} className="relative aspect-[3/4] bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.1)] transition-all duration-500 overflow-hidden group">
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.id as any)} />
                    {state[`${u.id}Image` as keyof GenerationState] ? (
                      <div className="w-full h-full relative">
                        <img src={state[`${u.id}Image` as keyof GenerationState] as string} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      </div>
                    ) : (
                      <div className="text-center opacity-40 group-hover:opacity-100 transition-all p-3 transform group-hover:-translate-y-1">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 border border-white/5 group-hover:border-cyan-500/50 group-hover:bg-cyan-500/10 transition-all">
                          <i className="fa-solid fa-plus text-lg text-zinc-400 group-hover:text-cyan-400 transition-colors"></i>
                        </div>
                        <p className="text-xs font-bold text-zinc-500 group-hover:text-white lowercase">{u.label}</p>
                      </div>
                    )}
                    {state[`${u.id}Image` as keyof GenerationState] && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="bg-white/10 rounded-full px-4 py-2 text-xs font-bold text-white border border-white/20">change</span>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="w-full bg-[#111118] rounded-3xl border border-white/5 p-6 shadow-xl mb-8">
              <label className="text-xs font-bold text-zinc-500 block mb-4 flex items-center gap-2 lowercase">
                <i className="fa-solid fa-wand-sparkles text-cyan-400"></i> prompt category
              </label>
              <div className="flex flex-col gap-4 mb-4">
                {Object.entries(CATEGORIZED_PROMPTS).map(([cat, items]) => (
                  <div key={cat} className="space-y-2">
                    <p className="text-xs font-bold text-zinc-600 ml-1 lowercase">{cat}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((rec, i) => (
                        <button key={i} onClick={() => setState(prev => ({ ...prev, promptInstruction: rec.text }))}
                          className="bg-white/5 hover:bg-cyan-600/20 border border-white/10 hover:border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 hover:text-cyan-400 transition-all text-left lowercase">
                          {rec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <textarea value={state.promptInstruction} onChange={(e) => setState(prev => ({ ...prev, promptInstruction: e.target.value }))}
                placeholder="describe how the model should interact with the product..."
                className="w-full bg-[#0a0a0f] border border-white/10 rounded-2xl py-4 px-4 text-sm outline-none focus:border-cyan-500/50 transition-colors resize-none h-24 placeholder:text-zinc-700" />
              <div className="mt-4 space-y-2">
                <label className="text-xs font-bold text-zinc-500 flex items-center gap-2 lowercase"><i className="fa-solid fa-wand-magic-sparkles text-cyan-400"></i> image model</label>
                <select value={state.selectedImageModel} onChange={(e) => setState(prev => ({ ...prev, selectedImageModel: e.target.value as any }))}
                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:border-cyan-500/50 transition-colors">
                  <option value="nano-banana-pro">Nano Banana Pro (best consistency)</option>
                  <option value="seedream-4.5">Seedream 4.5 (high quality)</option>
                </select>
              </div>
            </div>

            <button disabled={!state.modelImage || !state.productImage} onClick={onRefineClick}
              className="w-full md:w-auto btn-primary disabled:opacity-20 disabled:cursor-not-allowed px-12 md:px-24 py-4 md:py-5 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 border border-white/5 lowercase">
              let's gooo
            </button>
          </div>
        )}

        {/* ========== REFINE STEP ========== */}
        {step === AppStep.REFINE && (
          <div className="animate-in flex flex-col items-center w-full">
            <h3 className="text-sm font-bold text-zinc-400 mb-8 text-center lowercase">pick your fave</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full max-w-6xl mb-8 px-4 md:px-0">
              {(state.combinedCandidates || [state.combinedImage]).filter(Boolean).map((img, idx) => (
                <div key={idx} onClick={() => setState(prev => ({ ...prev, combinedImage: img }))}
                  className={`group relative rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 aspect-[9/16]
                  ${state.combinedImage === img ? 'scale-[1.02] md:scale-105 z-10 shadow-2xl' : 'scale-95 opacity-80 hover:opacity-100 hover:scale-100'}`}>
                  <div className={`absolute inset-0 ${state.combinedImage === img ? 'animated-gradient-border' : ''}`}>
                    <div className="bg-inner-card w-full h-full relative z-10"><img src={img as string} className="w-full h-full object-cover" /></div>
                  </div>
                  {state.combinedImage === img && (
                    <div className="absolute top-4 right-4 z-20 bg-gradient-to-r from-cyan-500 to-lime-400 w-8 h-8 rounded-full flex items-center justify-center shadow-lg">
                      <i className="fa-solid fa-check text-white text-xs"></i>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-center mb-8 w-full max-w-lg mx-auto">
              <button onClick={onRefineClick} className="flex items-center gap-3 px-6 py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 rounded-2xl transition-all group w-full justify-center">
                <i className="fa-solid fa-rotate-right text-red-500 group-hover:rotate-180 transition-transform duration-500"></i>
                <span className="text-xs font-bold text-red-400 lowercase">regenerate (fix glitches)</span>
              </button>
            </div>

            <div className="w-full max-w-4xl bg-[#111118] border border-white/5 rounded-3xl p-6 md:p-8 mb-8 shadow-2xl">
              <h3 className="text-sm font-bold text-zinc-400 mb-6 text-center lowercase">make it yours</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-600 ml-2 lowercase">brand text</label>
                  <input type="text" value={state.brandingText} onChange={(e) => setState(prev => ({ ...prev, brandingText: e.target.value }))} placeholder="e.g. ALANA"
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-600 ml-2 lowercase">background / atmosphere</label>
                  <input type="text" value={state.stylePrompt} onChange={(e) => setState(prev => ({ ...prev, stylePrompt: e.target.value }))} placeholder="e.g. Cyberpunk City"
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {BACKGROUND_PRESETS.map((bg, i) => (
                      <button key={i} onClick={() => setState(prev => ({ ...prev, stylePrompt: bg }))}
                        className="bg-white/5 hover:bg-cyan-900/20 border border-white/5 hover:border-cyan-500/30 rounded-xl px-2.5 py-1 text-xs text-zinc-400 hover:text-cyan-400 transition-colors lowercase">{bg}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-600 ml-2 lowercase">font style</label>
                  <select value={state.fontStyle} onChange={(e) => setState(prev => ({ ...prev, fontStyle: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-cyan-500/50">
                    {FONT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-600 ml-2 lowercase">text placement</label>
                  <select value={state.textPlacement} onChange={(e) => setState(prev => ({ ...prev, textPlacement: e.target.value }))}
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-cyan-500/50">
                    {PLACEMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-center">
                <button onClick={onApplyBrandingClick} className="bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-400 px-8 py-3 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 lowercase">
                  <i className="fa-solid fa-wand-magic-sparkles"></i> apply the vibes
                </button>
              </div>
            </div>

            <div className="w-full max-w-4xl bg-[#111118] border border-white/5 rounded-3xl p-6 md:p-8 mb-8 shadow-xl">
              <h3 className="text-sm font-bold text-zinc-400 mb-6 text-center lowercase">storyboard layout</h3>
              <div className="flex flex-col md:flex-row gap-4 justify-center">
                {[1, 2, 3].map((rows) => (
                  <button key={rows} onClick={() => setGridRows(rows)}
                    className={`flex flex-col items-center gap-2 w-full md:w-1/3 py-5 px-4 rounded-2xl border transition-all
                    ${gridRows === rows ? 'bg-cyan-600/10 border-cyan-500/50 text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'}`}>
                    <div className="flex flex-col gap-1 mb-1">
                      {Array.from({ length: rows }).map((_, i) => (<div key={i} className={`w-8 h-3 rounded-sm ${gridRows === rows ? 'bg-cyan-500' : 'bg-zinc-700'}`}></div>))}
                    </div>
                    <span className="text-sm font-bold">{rows}x3 grid</span>
                    <span className={`text-xs font-mono font-bold ${gridRows === rows ? 'text-cyan-400' : 'text-zinc-600'}`}>~${(rows * 0.015).toFixed(3)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto px-4 md:px-0">
              <button onClick={() => setStep(AppStep.UPLOAD)} className="w-full md:w-auto px-8 py-4 border border-white/10 rounded-2xl font-bold text-xs text-zinc-400 hover:bg-white/5 lowercase">back</button>
              <button onClick={onGridClick} className="w-full md:w-auto btn-primary px-12 py-4 rounded-2xl font-bold text-xs shadow-xl lowercase">generate {gridRows}x3 grid</button>
            </div>
          </div>
        )}

        {/* ========== STORYBOARD STEP ========== */}
        {step === AppStep.STORYBOARD && (
          <div className="animate-in flex flex-col items-center px-4">
            <div className={`bg-[#111118] p-4 md:p-6 rounded-3xl border border-white/5 mb-8 shadow-2xl ${gridRows === 1 ? 'w-full max-w-4xl' : gridRows === 2 ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
              <img src={state.storyboardGrid!} className={`rounded-2xl w-full object-contain ${gridRows === 1 ? 'aspect-[16/9]' : gridRows === 2 ? 'aspect-[4/5]' : 'aspect-[9/16]'}`} />
            </div>
            <div className="flex flex-col md:flex-row gap-4">
              <button onClick={onGridClick} className="bg-white/5 hover:bg-white/10 border border-white/10 px-8 py-4 rounded-2xl font-bold text-xs lowercase flex items-center gap-2 text-zinc-400 hover:text-white">
                <i className="fa-solid fa-rotate-right"></i> regenerate grid
              </button>
              <button onClick={onFinalRenderClick} className="btn-primary px-12 py-4 rounded-2xl font-bold text-xs shadow-2xl lowercase">proceed to render</button>
            </div>
          </div>
        )}

        {/* ========== RESULTS STEP ========== */}
        {step === AppStep.RESULTS && (
          <div className="animate-in grid grid-cols-12 gap-6 md:gap-8">
            <aside className="col-span-12 lg:col-span-3 space-y-6 order-2 lg:order-1">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-cyan-400 lowercase">master reference</h3>
                <p className="text-xs text-zinc-500 lowercase">slicing scenes from grid</p>
              </div>
              <div className={`bg-[#111118] p-3 rounded-3xl border border-white/5 overflow-hidden mx-auto lg:max-w-none ${gridRows === 1 ? 'max-w-full' : 'max-w-xs'}`}>
                {state.storyboardGrid && <img src={state.storyboardGrid} className={`rounded-2xl w-full object-cover opacity-80 ${gridRows === 1 ? 'aspect-[16/9]' : gridRows === 2 ? 'aspect-[4/5]' : 'aspect-[9/16]'}`} />}
              </div>
            </aside>
            <section className="col-span-12 lg:col-span-9 space-y-8 order-1 lg:order-2">
              <div className="flex flex-col xl:flex-row justify-between items-end gap-6">
                <div>
                  <h2 className="text-3xl md:text-4xl font-extrabold"><span className="gradient-text">final render</span></h2>
                  <p className="text-xs text-zinc-500 lowercase">shot selection & motion export</p>
                </div>
                <div className="w-full xl:w-2/5"><ProgressBar progress={state.extractionProgress} /></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {state.scenes.slice(0, gridRows * 3).map((scene, idx) => (
                  <div key={scene.id} className="bg-[#111118] border border-white/5 rounded-3xl p-4 md:p-5 flex flex-col gap-4 relative group overflow-hidden">
                    <div className={`aspect-[9/16] rounded-2xl overflow-hidden relative shadow-2xl ${(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo || scene.isEditing) ? 'animated-gradient-border' : 'border border-white/5'}`}>
                      <div className="bg-inner-card w-full h-full relative z-10">
                        {scene.image ? (
                          scene.videoUrl ? <video src={scene.videoUrl} autoPlay loop muted={scene.isVideoMuted} onLoadedMetadata={(e) => updateSceneField(idx, 'videoDuration', formatDuration(e.currentTarget.duration))} className="w-full h-full object-cover" />
                          : <img src={scene.image} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-900/10">
                            {scene.isExtracting ? (<><div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div><span className="text-xs font-bold text-zinc-600 lowercase">slicing...</span></>) : (<i className="fa-solid fa-image text-zinc-800 text-2xl"></i>)}
                          </div>
                        )}
                      </div>
                      {(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo || scene.isEditing) && (
                        <div className="absolute inset-0 bg-[#0a0a0f]/90 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in">
                          {scene.isGeneratingVideo ? (
                            <div className="flex flex-col items-center text-center px-6">
                              <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
                              <h4 className="text-xs font-bold text-white mb-2 lowercase">generating motion</h4>
                              <span className="text-xs text-cyan-400 font-mono">~4-5 min</span>
                            </div>
                          ) : (<div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin"></div>)}
                        </div>
                      )}
                      {scene.image && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-40 opacity-0 group-hover:opacity-100 transition-all">
                          <div className="flex bg-black/80 backdrop-blur-xl rounded-2xl p-1 border border-white/10 shadow-2xl items-center gap-1">
                            <button onClick={() => downloadMedia(scene.image!, `shot-${idx+1}.png`)} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white" title="Download"><i className="fa-solid fa-download text-xs"></i></button>
                            {scene.videoUrl && <button onClick={() => downloadMedia(scene.videoUrl!, `shot-${idx+1}.mp4`)} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-cyan-600/30 text-cyan-400" title="Download Video"><i className="fa-solid fa-film text-xs"></i></button>}
                            <button onClick={() => onUpscale(idx, '2K')} className="px-1.5 py-1 text-[9px] font-bold rounded-lg hover:bg-cyan-600 text-zinc-400 hover:text-white">2K</button>
                            <button onClick={() => onUpscale(idx, '4K')} className="px-1.5 py-1 text-[9px] font-bold rounded-lg hover:bg-cyan-600 text-zinc-400 hover:text-white">4K</button>
                            <label className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-cyan-600 text-zinc-400 hover:text-white cursor-pointer" title="Upload Reference">
                              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleSceneReferenceUpload(e, idx)} /><i className="fa-solid fa-upload text-xs"></i>
                            </label>
                            <button onClick={() => onRepair(idx)} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-cyan-600 text-zinc-400 hover:text-white" title="Repair"><i className="fa-solid fa-wand-magic-sparkles text-xs"></i></button>
                          </div>
                        </div>
                      )}
                      {scene.videoUrl && (
                        <div className="absolute bottom-3 right-3 z-50 flex items-center gap-1.5">
                          <span className="text-xs font-mono bg-black/60 px-2 py-1 rounded-lg border border-white/10 text-white">{scene.videoDuration || "00:00"}</span>
                          <button onClick={() => updateSceneField(idx, 'isVideoMuted', !scene.isVideoMuted)} className="w-6 h-6 flex items-center justify-center bg-black/60 rounded-full border border-white/10">
                            <i className={`fa-solid ${scene.isVideoMuted ? 'fa-volume-xmark' : 'fa-volume-high'} text-[9px] text-white`}></i>
                          </button>
                        </div>
                      )}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 text-xs font-bold z-40 lowercase">shot {String(idx+1).padStart(2,'0')}</div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input type="text" value={state.editPrompts?.[idx] || ""} onChange={(e) => { const p = [...state.editPrompts]; p[idx] = e.target.value; setState(prev => ({ ...prev, editPrompts: p })); }}
                          placeholder="edit pose, angle..." className="flex-1 bg-[#0d0d14] border border-white/5 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                        <button onClick={() => onEditImage(idx)} disabled={!scene.image || scene.isEditing || !state.editPrompts[idx]}
                          className="bg-[#1e1e24] hover:bg-cyan-600 border border-white/5 rounded-xl w-9 flex items-center justify-center disabled:opacity-30"><i className="fa-solid fa-check text-xs text-white"></i></button>
                      </div>

                      <div className="bg-[#0d0d14] rounded-2xl p-3 border border-white/5">
                        <label className="text-xs font-bold text-zinc-500 block mb-2 lowercase">video provider</label>
                        <select value={scene.selectedVideoProvider || 'VEO_3.1'} onChange={(e) => updateSceneField(idx, 'selectedVideoProvider', e.target.value)}
                          className="w-full bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-cyan-500/50">
                          <optgroup label="Google"><option value="VEO_3.1">Veo 3.1</option></optgroup>
                          <optgroup label="Kling"><option value="KLING_2.5">Kling 2.5</option><option value="KLING_2.6">Kling 2.6</option></optgroup>
                          <optgroup label="Wan"><option value="WAN_2.5">Wan 2.5</option><option value="WAN_2.6">Wan 2.6</option></optgroup>
                          <optgroup label="Seedance"><option value="SEEDANCE_PRO">Seedance Pro</option><option value="SEEDANCE_1.5_PRO">Seedance 1.5 Pro</option></optgroup>
                          <optgroup label="Minimax"><option value="MINIMAX">Minimax</option></optgroup>
                        </select>
                        {['VEO_3.1','KLING_2.6','WAN_2.6','SEEDANCE_1.5_PRO'].includes(scene.selectedVideoProvider || '') && (
                          <label className="flex items-center gap-2 mt-2 cursor-pointer">
                            <input type="checkbox" checked={scene.enableAudio || false} onChange={(e) => updateSceneField(idx, 'enableAudio', e.target.checked)} className="w-4 h-4 rounded" />
                            <span className="text-xs font-bold text-zinc-400 lowercase">enable audio</span>
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {['720p','1080p'].map(r => (
                            <button key={r} onClick={() => updateSceneField(idx, 'videoResolution', r)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${(scene.videoResolution || '720p') === r ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-[#111118] border-white/10 text-zinc-400'}`}>
                              {r} {r === '1080p' && <span className="text-yellow-400 ml-1">+50%</span>}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-zinc-400 lowercase">duration</span>
                          <span className="text-sm font-mono font-bold text-cyan-400">{scene.duration}s</span>
                        </div>
                        <input type="range" min={getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').min} max={getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').max}
                          value={scene.duration} onChange={(e) => updateSceneField(idx, 'duration', parseInt(e.target.value))} className="w-full" />
                        <div className="mt-2 p-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                          <div className="flex justify-between text-xs"><span className="text-zinc-500">this'll cost</span><span className="font-bold text-lime-400">{formatCost(calculateVideoCost(scene.selectedVideoProvider || 'VEO_3.1', scene.duration, scene.videoResolution || '720p', scene.enableAudio))}</span></div>
                          <div className="flex justify-between text-xs mt-1"><span className="text-zinc-600">est. time</span><span className="font-bold text-cyan-400">{getGenerationTime(scene.selectedVideoProvider || 'VEO_3.1')}</span></div>
                        </div>
                      </div>

                      <div className="bg-[#0d0d14] rounded-2xl p-3 border border-white/5">
                        <span className="text-xs font-bold text-zinc-400 block mb-2 lowercase">motion control</span>
                        <textarea value={scenePrompts[idx]} onChange={(e) => { const p = [...scenePrompts]; p[idx] = e.target.value; setScenePrompts(p); }}
                          className="w-full bg-transparent text-xs text-zinc-400 h-14 resize-none outline-none placeholder:text-zinc-700 border-b border-white/5 pb-2" placeholder="motion prompt..." />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <input type="text" value={scene.bgMusicPrompt || ""} onChange={(e) => updateSceneField(idx, 'bgMusicPrompt', e.target.value)} placeholder="bg music"
                            className="bg-transparent border border-white/10 rounded-xl px-2 py-1.5 text-xs outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                          <input type="text" value={scene.dialoguePrompt || ""} onChange={(e) => updateSceneField(idx, 'dialoguePrompt', e.target.value)} placeholder="dialogue"
                            className="bg-transparent border border-white/10 rounded-xl px-2 py-1.5 text-xs outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                        </div>
                      </div>

                      <button onClick={() => onVideo(idx)} disabled={!scene.image || scene.isGeneratingVideo}
                        className="w-full bg-[#111118] hover:bg-gradient-to-r hover:from-cyan-600 hover:to-lime-500 border border-white/5 py-3.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-10 active:scale-95 lowercase">
                        {scene.isGeneratingVideo ? 'processing...' : 'bring it to life'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ========== POSTER STEP ========== */}
        {step === AppStep.POSTER && (
          <div className="animate-in max-w-6xl mx-auto">
            {/* Sub-navigation */}
            <div className="flex justify-center gap-2 mb-8">
              {(['upload','style','settings','results'] as const).map(sub => (
                <button key={sub} onClick={() => setPosterSubStep(sub)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold lowercase border transition-all
                  ${posterSubStep === sub ? 'bg-gradient-to-r from-cyan-600/20 to-lime-500/20 border-cyan-500/50 text-white' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                  {sub}
                </button>
              ))}
            </div>

            {posterSubStep === 'upload' && (
              <div className="flex flex-col items-center gap-6">
                <label className="w-full max-w-md aspect-square bg-[#111118] rounded-3xl border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500/40 transition-all overflow-hidden group">
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const r = new FileReader(); r.onload = (ev) => setPosterState(prev => ({ ...prev, productImage: ev.target?.result as string })); r.readAsDataURL(f);
                  }} />
                  {posterState.productImage ? (
                    <img src={posterState.productImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="text-center opacity-50 group-hover:opacity-100 transition-all">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-cyan-500/10 border border-white/5 group-hover:border-cyan-500/50">
                        <i className="fa-solid fa-plus text-xl text-zinc-400 group-hover:text-cyan-400"></i>
                      </div>
                      <p className="text-sm font-bold text-zinc-500 lowercase">add product image</p>
                    </div>
                  )}
                </label>
                {posterState.productImage && (
                  <button onClick={() => setPosterSubStep('style')} className="btn-primary px-12 py-4 rounded-2xl font-bold text-sm lowercase">choose style</button>
                )}
              </div>
            )}

            {posterSubStep === 'style' && (
              <div>
                <h3 className="text-sm font-bold text-zinc-400 mb-6 text-center lowercase">pick a style</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {POSTER_STYLES.map(style => (
                    <button key={style.id} onClick={() => {
                      setPosterState(prev => ({ ...prev, config: { ...prev.config, styleId: style.id, mainPrompt: style.promptTemplate } }));
                    }}
                      className={`p-4 rounded-2xl border text-left transition-all
                      ${posterState.config.styleId === style.id ? 'bg-cyan-600/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'bg-[#111118] border-white/5 hover:border-white/20'}`}>
                      <div className="text-2xl mb-2">{style.emoji}</div>
                      <div className="text-sm font-bold text-white mb-1">{style.name}</div>
                      <div className="text-xs text-zinc-500 mb-2">{style.vibe}</div>
                      <div className="flex gap-1">
                        {style.colors.map((c, i) => <div key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: c }}></div>)}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-center mt-8 gap-4">
                  <button onClick={() => setPosterSubStep('upload')} className="px-6 py-3 border border-white/10 rounded-2xl text-xs font-bold text-zinc-400 lowercase">back</button>
                  <button onClick={() => setPosterSubStep('settings')} className="btn-primary px-8 py-3 rounded-2xl font-bold text-xs lowercase">customize</button>
                </div>
              </div>
            )}

            {posterSubStep === 'settings' && (
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Provider */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-5">
                  <label className="text-xs font-bold text-zinc-500 mb-3 block lowercase">image provider</label>
                  <div className="flex flex-wrap gap-2">
                    {(['POLLINATIONS','PUTER','HUGGINGFACE','PRODIA','TOGETHER'] as AiProvider[]).map(p => (
                      <button key={p} onClick={() => setPosterProvider(p)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all lowercase
                        ${posterProvider === p ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                        {p === 'POLLINATIONS' ? 'pollinations (free)' : p === 'PUTER' ? 'puter (free)' : p.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format & Layout */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-5">
                  <label className="text-xs font-bold text-zinc-500 mb-3 block lowercase">format</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {POSTER_FORMATS.map(f => (
                      <button key={f.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, format: f.id } }))}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${posterState.config.format === f.id ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                        {f.label} <span className="text-zinc-600 ml-1">{f.aspect}</span>
                      </button>
                    ))}
                  </div>
                  <label className="text-xs font-bold text-zinc-500 mb-3 block lowercase">layout</label>
                  <div className="flex flex-wrap gap-2">
                    {POSTER_LAYOUTS.map(l => (
                      <button key={l.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, layout: l.id } }))}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${posterState.config.layout === l.id ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product & Mood */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-5">
                  <label className="text-xs font-bold text-zinc-500 mb-3 block lowercase">product placement</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {PRODUCT_PLACEMENTS.map(p => (
                      <button key={p.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, placement: p.id } }))}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${posterState.config.placement === p.id ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <label className="text-xs font-bold text-zinc-500 mb-3 block lowercase">mood</label>
                  <div className="flex flex-wrap gap-2">
                    {POSTER_MOODS.map(m => (
                      <button key={m.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, mood: m.id } }))}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${posterState.config.mood === m.id ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                        {m.emoji} {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text inputs */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="text-xs font-bold text-zinc-500 block mb-2 lowercase">brand name</label>
                      <input type="text" value={posterState.config.brandName} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, brandName: e.target.value } }))}
                        placeholder="e.g. LUXE" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" /></div>
                    <div><label className="text-xs font-bold text-zinc-500 block mb-2 lowercase">tagline</label>
                      <input type="text" value={posterState.config.tagline} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, tagline: e.target.value } }))}
                        placeholder="e.g. Elevate Your Style" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" /></div>
                    <div><label className="text-xs font-bold text-zinc-500 block mb-2 lowercase">CTA text</label>
                      <input type="text" value={posterState.config.ctaText} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, ctaText: e.target.value } }))}
                        placeholder="e.g. Shop Now" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" /></div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 block mb-2 lowercase">boldness: {posterState.config.boldness}/10</label>
                    <input type="range" min={1} max={10} value={posterState.config.boldness} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, boldness: parseInt(e.target.value) } }))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 block mb-2 lowercase">variations: {posterState.config.variationCount}</label>
                    <input type="range" min={1} max={4} value={posterState.config.variationCount} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, variationCount: parseInt(e.target.value) } }))} className="w-full" />
                  </div>
                </div>

                {/* Prompt */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-5 space-y-3">
                  <label className="text-xs font-bold text-zinc-500 block lowercase">main prompt</label>
                  <textarea value={posterState.config.mainPrompt} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, mainPrompt: e.target.value } }))}
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-cyan-500/50 resize-none h-20 placeholder:text-zinc-700" placeholder="describe your poster..." />
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPT_CHIPS.map(chip => (
                      <button key={chip} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, additionalInstructions: prev.config.additionalInstructions + ' ' + chip } }))}
                        className="bg-white/5 hover:bg-cyan-600/20 border border-white/10 hover:border-cyan-500/30 rounded-xl px-2.5 py-1 text-xs text-zinc-400 hover:text-cyan-400 transition-colors lowercase">{chip}</button>
                    ))}
                  </div>
                  <textarea value={posterState.config.additionalInstructions} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, additionalInstructions: e.target.value } }))}
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-cyan-500/50 resize-none h-16 placeholder:text-zinc-700" placeholder="additional instructions..." />
                </div>

                <div className="flex justify-center gap-4">
                  <button onClick={() => setPosterSubStep('style')} className="px-6 py-3 border border-white/10 rounded-2xl text-xs font-bold text-zinc-400 lowercase">back</button>
                  <button onClick={onGeneratePoster} disabled={posterState.isGenerating}
                    className="btn-primary px-10 py-3 rounded-2xl font-bold text-sm lowercase disabled:opacity-50 flex items-center gap-2">
                    {posterState.isGenerating ? <><i className="fa-solid fa-spinner fa-spin"></i> generating...</> : 'generate poster'}
                  </button>
                </div>
              </div>
            )}

            {posterSubStep === 'results' && (
              <div>
                <h3 className="text-sm font-bold text-zinc-400 mb-6 text-center lowercase">your posters</h3>
                {posterState.results.length === 0 ? (
                  <p className="text-center text-zinc-600 text-sm">no posters yet. go back and generate some!</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posterState.results.map((result, idx) => (
                      <div key={result.id} className="bg-[#111118] border border-white/5 rounded-3xl p-4 group">
                        <div className="aspect-[9/16] rounded-2xl overflow-hidden mb-4 border border-white/5">
                          <img src={result.imageUrl} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => downloadMedia(result.imageUrl, `poster-${idx+1}.png`)}
                            className="flex-1 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-400 py-2.5 rounded-xl text-xs font-bold lowercase flex items-center justify-center gap-2">
                            <i className="fa-solid fa-download"></i> download
                          </button>
                          <button onClick={() => { setPosterState(prev => ({ ...prev, config: { ...prev.config, mainPrompt: result.prompt } })); setPosterSubStep('settings'); }}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-400 lowercase">edit</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-center mt-8">
                  <button onClick={() => setPosterSubStep('settings')} className="px-6 py-3 border border-white/10 rounded-2xl text-xs font-bold text-zinc-400 lowercase">generate more</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== CLIP EDITOR STEP ========== */}
        {step === AppStep.CLIP_EDITOR && (
          <div className="animate-in max-w-5xl mx-auto space-y-6">
            <h2 className="text-2xl font-extrabold text-center"><span className="gradient-text">clip editor</span></h2>
            <p className="text-xs text-zinc-500 text-center lowercase">cut, trim & export videos — 100% browser-based</p>

            {/* Upload */}
            <div className="bg-[#111118] rounded-3xl border border-white/5 p-6">
              <label className="text-xs font-bold text-zinc-500 block mb-3 lowercase">upload or select video</label>
              <label className="block w-full bg-[#0a0a0f] border border-dashed border-white/10 rounded-2xl p-8 text-center cursor-pointer hover:border-cyan-500/40 transition-all">
                <input type="file" accept="video/*" className="hidden" onChange={onClipVideoUpload} />
                {clipState.videoFile ? (
                  <video ref={clipVideoRef} src={clipState.videoFile} className="w-full max-h-64 rounded-xl mx-auto" controls onLoadedMetadata={onClipVideoLoaded} />
                ) : (
                  <div className="opacity-50"><i className="fa-solid fa-film text-3xl text-zinc-600 mb-3"></i><p className="text-sm font-bold text-zinc-500 lowercase">drop a video file here</p></div>
                )}
              </label>
              {clipState.videoDuration > 0 && <p className="text-xs text-zinc-500 mt-2 text-center">duration: {formatTimestamp(clipState.videoDuration)}</p>}
            </div>

            {clipState.videoFile && (
              <>
                {/* Quick Actions */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-6 space-y-4">
                  <label className="text-xs font-bold text-zinc-500 block lowercase">quick actions</label>
                  <div className="flex flex-wrap gap-2">
                    {([['random','Random Cut'],['beat','Beat Cut'],['equal','Equal Split'],['manual','Manual']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setClipQuickAction(id as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all lowercase
                        ${clipQuickAction === id ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>{label}</button>
                    ))}
                  </div>

                  {clipQuickAction === 'random' && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-500 lowercase">cuts:</label>
                      <input type="range" min={2} max={20} value={clipRandomCount} onChange={(e) => setClipRandomCount(parseInt(e.target.value))} className="flex-1" />
                      <span className="text-sm font-bold text-cyan-400">{clipRandomCount}</span>
                    </div>
                  )}
                  {clipQuickAction === 'beat' && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-500 lowercase">interval:</label>
                      <div className="flex gap-2">
                        {[0.5,1,1.5,2,3,5].map(v => (
                          <button key={v} onClick={() => setClipBeatInterval(v)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${clipBeatInterval === v ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>{v}s</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {clipQuickAction === 'equal' && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-500 lowercase">parts:</label>
                      <input type="range" min={2} max={10} value={clipEqualParts} onChange={(e) => setClipEqualParts(parseInt(e.target.value))} className="flex-1" />
                      <span className="text-sm font-bold text-cyan-400">{clipEqualParts}</span>
                    </div>
                  )}
                  {clipQuickAction === 'manual' && (
                    <input type="text" value={clipManualInput} onChange={(e) => setClipManualInput(e.target.value)} placeholder="0:02, 0:05.5, 0:08, 0:12"
                      className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  )}

                  {clipQuickAction && (
                    <button onClick={applyClipAction} className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold lowercase">apply cuts</button>
                  )}
                </div>

                {/* Segments list */}
                {clipState.clips.length > 0 && (
                  <div className="bg-[#111118] rounded-3xl border border-white/5 p-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-500 lowercase">segments ({clipState.clips.length})</label>
                      <span className="text-xs font-mono text-cyan-400">total: {formatTimestamp(calculateTotalDuration(clipState.clips))}</span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {clipState.clips.map((seg, i) => (
                        <div key={seg.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${seg.enabled ? 'bg-lime-950/10 border-lime-500/20' : 'bg-red-950/10 border-red-500/20 opacity-50'}`}>
                          <button onClick={() => setClipState(prev => ({ ...prev, clips: prev.clips.map(s => s.id === seg.id ? { ...s, enabled: !s.enabled } : s) }))}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${seg.enabled ? 'bg-lime-500/20 text-lime-400' : 'bg-red-500/20 text-red-400'}`}>
                            {seg.enabled ? <i className="fa-solid fa-check"></i> : <i className="fa-solid fa-xmark"></i>}
                          </button>
                          <span className="text-xs font-bold text-zinc-400">{seg.label}</span>
                          <span className="text-xs font-mono text-zinc-500 ml-auto">{formatTimestamp(seg.start)} - {formatTimestamp(seg.end)}</span>
                          <span className="text-xs font-mono text-cyan-400">{(seg.end - seg.start).toFixed(1)}s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings */}
                <div className="bg-[#111118] rounded-3xl border border-white/5 p-6 space-y-4">
                  <label className="text-xs font-bold text-zinc-500 block lowercase">settings</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1 lowercase">speed: {clipState.config.speed}x</label>
                      <input type="range" min={0.25} max={4} step={0.25} value={clipState.config.speed} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, speed: parseFloat(e.target.value) } }))} className="w-full" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1 lowercase">format</label>
                      <div className="flex gap-2">
                        {['mp4','webm'].map(f => (
                          <button key={f} onClick={() => setClipState(prev => ({ ...prev, config: { ...prev.config, outputFormat: f as any } }))}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border ${clipState.config.outputFormat === f ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>{f}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={clipState.config.addFadeIn} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, addFadeIn: e.target.checked } }))} className="w-4 h-4 rounded" />
                        <span className="text-xs font-bold text-zinc-400 lowercase">fade in</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={clipState.config.addFadeOut} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, addFadeOut: e.target.checked } }))} className="w-4 h-4 rounded" />
                        <span className="text-xs font-bold text-zinc-400 lowercase">fade out</span>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={clipState.config.enableReverse} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, enableReverse: e.target.checked } }))} className="w-4 h-4 rounded" />
                      <span className="text-xs font-bold text-zinc-400 lowercase">reverse playback</span>
                    </label>
                  </div>
                </div>

                {/* Export */}
                <div className="flex justify-center">
                  <button onClick={onExportClip} disabled={clipState.clips.length === 0 || clipState.isProcessing}
                    className="btn-primary px-10 py-4 rounded-2xl font-bold text-sm lowercase disabled:opacity-30 flex items-center gap-2">
                    {clipState.isProcessing ? <><i className="fa-solid fa-spinner fa-spin"></i> processing...</> : <><i className="fa-solid fa-download"></i> export clip</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* ========== API KEY MODAL ========== */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4">
          <div className="bg-[#111118] p-6 md:p-8 rounded-3xl w-full max-w-lg border border-cyan-600/20 space-y-5 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-lime-400"></div>
            <div className="w-14 h-14 bg-gradient-to-br from-cyan-500/20 to-lime-400/20 rounded-full flex items-center justify-center mx-auto border border-cyan-500/20">
              <i className="fa-solid fa-plug text-cyan-400 text-xl"></i>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1 lowercase">let's get connected</h2>
              <p className="text-zinc-500 text-xs lowercase">pick a provider — free options available!</p>
            </div>

            {/* Provider tabs */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {(['POLLINATIONS','PUTER','HUGGINGFACE','PRODIA','TOGETHER','FAL','GEMINI'] as ModalProviderTab[]).map(p => {
                const status = getProviderStatus(p);
                return (
                  <button key={p} onClick={() => setModalProviderTab(p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all lowercase
                    ${modalProviderTab === p ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
                    {p.toLowerCase()}
                    <span className={`ml-1.5 w-1.5 h-1.5 rounded-full inline-block ${status === 'connected' || status === 'free' ? 'bg-lime-400' : 'bg-zinc-600'}`}></span>
                  </button>
                );
              })}
            </div>

            {/* Provider content */}
            <div className="space-y-3">
              {modalProviderTab === 'POLLINATIONS' && (
                <div className="bg-lime-950/20 border border-lime-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2"><span className="text-lime-400 text-lg">🌸</span><h3 className="text-sm font-bold text-lime-400">Pollinations.ai</h3><span className="bg-lime-500/20 text-lime-400 text-[10px] font-bold px-2 py-0.5 rounded-full">FREE</span></div>
                  <p className="text-xs text-zinc-400">no API key needed. unlimited, free forever.</p>
                  <p className="text-xs text-zinc-500">just click connect below!</p>
                </div>
              )}
              {modalProviderTab === 'PUTER' && (
                <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2"><span className="text-cyan-400 text-lg">☁️</span><h3 className="text-sm font-bold text-cyan-400">Puter.js</h3><span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-bold px-2 py-0.5 rounded-full">FREE</span></div>
                  <p className="text-xs text-zinc-400">40+ AI models (DALL-E 3, FLUX, SD3, GPT Image). No API key — login via Puter account (free).</p>
                  <a href="https://puter.com" target="_blank" className="text-xs text-cyan-400 underline">sign up at puter.com</a>
                </div>
              )}
              {modalProviderTab === 'HUGGINGFACE' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-yellow-400 text-lg">🤗</span><h3 className="text-sm font-bold text-yellow-400">HuggingFace</h3><span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full">FREE TIER</span></div>
                  <p className="text-xs text-zinc-400">FLUX, SDXL, video models. Free with rate limits.</p>
                  <input type="password" value={tempHfKey} onChange={(e) => setTempHfKey(e.target.value)} placeholder="hf_..." className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-2.5 px-3 text-sm font-mono outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-xs text-yellow-400 underline">get token at huggingface.co</a>
                </div>
              )}
              {modalProviderTab === 'PRODIA' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-purple-400 text-lg">🟣</span><h3 className="text-sm font-bold text-purple-400">Prodia</h3><span className="bg-purple-500/20 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded-full">100/DAY FREE</span></div>
                  <p className="text-xs text-zinc-400">SDXL, SD3. 100 free generations per day.</p>
                  <input type="password" value={tempProdiaKey} onChange={(e) => setTempProdiaKey(e.target.value)} placeholder="prodia key..." className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-2.5 px-3 text-sm font-mono outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  <a href="https://prodia.com" target="_blank" className="text-xs text-purple-400 underline">get key at prodia.com</a>
                </div>
              )}
              {modalProviderTab === 'TOGETHER' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-blue-400 text-lg">🔵</span><h3 className="text-sm font-bold text-blue-400">Together AI</h3><span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">$5 FREE</span></div>
                  <p className="text-xs text-zinc-400">FLUX, SDXL. $5 free credits on signup.</p>
                  <input type="password" value={tempTogetherKey} onChange={(e) => setTempTogetherKey(e.target.value)} placeholder="together key..." className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-2.5 px-3 text-sm font-mono outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  <a href="https://api.together.xyz" target="_blank" className="text-xs text-blue-400 underline">get key at together.xyz</a>
                </div>
              )}
              {modalProviderTab === 'FAL' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-pink-400 text-lg">⚡</span><h3 className="text-sm font-bold text-pink-400">FAL AI</h3><span className="bg-pink-500/20 text-pink-400 text-[10px] font-bold px-2 py-0.5 rounded-full">PAID</span></div>
                  <p className="text-xs text-zinc-400">video gen (Kling, Wan, Minimax, Seedance), premium images.</p>
                  <input type="password" value={tempFalKey} onChange={(e) => setTempFalKey(e.target.value)} placeholder="fal_..." className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-2.5 px-3 text-sm font-mono outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  <a href="https://fal.ai/dashboard" target="_blank" className="text-xs text-pink-400 underline">get key at fal.ai</a>
                </div>
              )}
              {modalProviderTab === 'GEMINI' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-blue-400 text-lg">🔷</span><h3 className="text-sm font-bold text-blue-400">Google Gemini</h3><span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">FREE TIER</span></div>
                  <p className="text-xs text-zinc-400">image gen, Veo 3.1 video. 15 RPM free tier.</p>
                  <input type="password" value={tempGeminiKey} onChange={(e) => setTempGeminiKey(e.target.value)} placeholder="AIza..." className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-2.5 px-3 text-sm font-mono outline-none focus:border-cyan-500/50 placeholder:text-zinc-700" />
                  <a href="https://aistudio.google.com/apikey" target="_blank" className="text-xs text-blue-400 underline">get key at aistudio.google.com</a>
                </div>
              )}
            </div>

            <button onClick={handleSaveCustomKey} disabled={isValidatingKey}
              className="w-full btn-primary disabled:opacity-50 py-3.5 rounded-2xl font-bold text-sm lowercase">
              {isValidatingKey ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>validating...</> : 'connect & start creating'}
            </button>

            {keyError && (
              <div className="bg-red-900/20 border border-red-700/50 text-red-300 text-xs rounded-xl px-4 py-3">
                <i className="fa-solid fa-triangle-exclamation mr-2"></i>{keyError}
              </div>
            )}

            {useCustomKey && (
              <button onClick={() => setShowKeyModal(false)} className="w-full text-center text-xs text-zinc-500 hover:text-white transition-colors lowercase py-2">close</button>
            )}
          </div>
        </div>
      )}

      {/* ========== GUIDE MODAL ========== */}
      {showGuide && (
        <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4">
          <div className="bg-[#111118] p-6 md:p-8 rounded-3xl w-full max-w-2xl border border-cyan-600/20 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-lime-400"></div>
            <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>

            <h2 className="text-xl font-extrabold mb-6 lowercase"><span className="gradient-text">api setup guide</span></h2>

            <div className="space-y-6">
              <div className="bg-lime-950/20 border border-lime-500/20 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-lime-400 mb-3">FREE — No API Key Needed</h3>
                <div className="space-y-3 text-xs text-zinc-400">
                  <div><strong className="text-white">1. Puter.js</strong> (recommended)<br/>40+ models (FLUX, DALL-E 3, GPT Image, SD3). Sign up free at <a href="https://puter.com" target="_blank" className="text-cyan-400 underline">puter.com</a></div>
                  <div><strong className="text-white">2. Pollinations.ai</strong><br/>No account needed. Unlimited, free forever. Works right away.</div>
                </div>
              </div>

              <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-yellow-400 mb-3">FREE — Need Free Token</h3>
                <div className="space-y-3 text-xs text-zinc-400">
                  <div><strong className="text-white">3. HuggingFace</strong><br/>Sign up at <a href="https://huggingface.co/join" target="_blank" className="text-cyan-400 underline">huggingface.co</a> &rarr; Settings &rarr; Access Tokens &rarr; New Token</div>
                  <div><strong className="text-white">4. Prodia</strong><br/>Sign up at <a href="https://prodia.com" target="_blank" className="text-cyan-400 underline">prodia.com</a> &rarr; Dashboard &rarr; API Key. 100 free gen/day.</div>
                  <div><strong className="text-white">5. Together AI</strong><br/>Sign up at <a href="https://api.together.xyz" target="_blank" className="text-cyan-400 underline">together.xyz</a>. Get $5 free credits instantly.</div>
                </div>
              </div>

              <div className="bg-pink-950/20 border border-pink-500/20 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-pink-400 mb-3">PAID — Premium Quality</h3>
                <div className="space-y-3 text-xs text-zinc-400">
                  <div><strong className="text-white">6. FAL AI</strong><br/>Sign up at <a href="https://fal.ai" target="_blank" className="text-cyan-400 underline">fal.ai</a>. Pay-as-you-go, ~$0.01/image. Required for video generation.</div>
                  <div><strong className="text-white">7. Google Gemini</strong><br/>Get key at <a href="https://aistudio.google.com/apikey" target="_blank" className="text-cyan-400 underline">aistudio.google.com</a>. Free tier: 15 RPM.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
