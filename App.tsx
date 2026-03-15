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

// ============ SMALL COMPONENTS ============

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="w-full select-none">
    <div className="flex justify-between items-end mb-2">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-violet-400 rounded-full animate-ping"></div>
        <span className="text-[10px] font-bold text-violet-300 lowercase tracking-wide">processing</span>
      </div>
      <span className="text-[10px] font-mono font-bold text-zinc-500">{progress}%</span>
    </div>
    <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
      <div className="absolute inset-y-0 left-0 loading-bar rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
    </div>
  </div>
);

const LoadingOverlay: React.FC<{ message: string }> = ({ message }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let c = 0;
    const iv = setInterval(() => { c += Math.random() * 1.5 + 0.5; if (c > 95) c = 95; setProgress(Math.round(c)); }, 400);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center p-4 text-center animate-in">
      <div className="w-full max-w-md p-8 glass-static rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 loading-bar" />
        <div className="relative z-10 space-y-6">
          <div className="w-16 h-16 mx-auto relative">
            <div className="absolute inset-0 border-2 border-violet-500/20 rounded-full animate-ping" />
            <div className="absolute inset-1 border-2 border-transparent border-t-violet-400 border-r-cyan-400 rounded-full animate-spin" />
            <div className="absolute inset-3 border-2 border-transparent border-b-pink-400 border-l-lime-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-1 lowercase">cooking something fire...</h3>
            <p className="text-xs font-bold text-violet-300 lowercase animate-pulse">{message}</p>
          </div>
          <div className="px-4"><ProgressBar progress={progress} /></div>
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
  "Cyberpunk Neon", "Abstract Gradient", "Beige / Warm Tones", "Nature / Outdoor Garden",
  "Retro 90s Diner", "Vaporwave Sunset", "Japanese Street", "Marble Luxury",
  "Tropical Beach", "Dark Moody Factory", "Pastel Dreamscape", "Golden Hour Field"
];
const FONT_OPTIONS = ["Modern Sans","Elegant Serif","Bold Graffiti","Neon Script","Futuristic Mono","Vintage Typewriter","Handwritten Signature","3D Chrome","Gothic Bold","Minimalist Thin","Bubble Pop","Retro Pixel","Art Deco","Brush Stroke"];
const PLACEMENT_OPTIONS = ["Behind Subject","Floating Above","Integrated Neon Sign","Overlay Bottom","Vertical Side","Floor Reflection","Halo Effect","Wrapped Around Subject","Magazine Header","Scattered Particles","Double Exposure","Holographic Overlay"];
const COLOR_THEMES = ["Default", "Monochrome", "Warm Sunset", "Cool Ocean", "Neon Pink", "Earth Tones", "Pastel Dream", "Dark Luxury", "Tropical", "Vintage Film"];

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
  const [colorTheme, setColorTheme] = useState('Default');
  const [sidebarHover, setSidebarHover] = useState(false);

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

  const [posterState, setPosterState] = useState<PosterState>({
    productImage: null, config: getDefaultPosterConfig(), results: [], isGenerating: false, generationProgress: 0
  });
  const [posterSubStep, setPosterSubStep] = useState<'upload' | 'style' | 'settings' | 'results'>('upload');
  const [posterProvider, setPosterProvider] = useState<AiProvider>('POLLINATIONS');

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
    const geminiKey = secureGetItem('USER_GEMINI_API_KEY');
    const falKey = secureGetItem('USER_FAL_API_KEY');
    const hfKey = secureGetItem('USER_HF_API_KEY');
    if (falKey && falKey.length > 5) { setUseCustomKey(true); setActiveProvider('FAL'); setShowKeyModal(false); return; }
    if (geminiKey && geminiKey.length > 5) { setUseCustomKey(true); setActiveProvider('GEMINI'); setShowKeyModal(false); return; }
    if (hfKey && hfKey.length > 5) { setUseCustomKey(true); setActiveProvider('HUGGINGFACE'); setShowKeyModal(false); return; }
    setActiveProvider('POLLINATIONS'); setUseCustomKey(true); setShowKeyModal(false);
  };
  useEffect(() => { checkKeys(); }, []);

  const handleSaveCustomKey = async () => {
    setKeyError(''); setIsValidatingKey(true);
    let anyValid = false;
    try {
      if (modalProviderTab === 'POLLINATIONS') { setActiveProvider('POLLINATIONS'); anyValid = true; }
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
      const count = pc.variationCount;
      for (let i = 0; i < count; i++) {
        setPosterState(prev => ({ ...prev, generationProgress: Math.round(((i) / count) * 100) }));
        let imageUrl = '';
        const varPrompt = `${prompt} Variation ${i + 1} of ${count}, unique composition.`;
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

  // --- Clip Editor ---
  const onClipVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    setClipState(prev => ({ ...prev, videoFile: url, config: { ...prev.config, sourceVideoUrl: url } }));
  };
  const onClipVideoLoaded = () => { if (clipVideoRef.current) setClipState(prev => ({ ...prev, videoDuration: clipVideoRef.current!.duration })); };
  const applyClipAction = () => {
    const dur = clipState.videoDuration; if (!dur) return;
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
      const blob = await createClipFromSegments(clipVideoRef.current, clipState.clips, clipState.config, () => {});
      exportClip(blob, 'creatorkit-clip');
    } catch (e: any) { alert('Export failed: ' + e.message); }
    setClipState(prev => ({ ...prev, isProcessing: false }));
  };

  const getProviderStatus = (provider: ModalProviderTab): 'connected' | 'free' | 'not-set' => {
    if (provider === 'POLLINATIONS' || provider === 'PUTER') return 'free';
    if (provider === 'FAL') return secureGetItem('USER_FAL_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'GEMINI') return secureGetItem('USER_GEMINI_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'HUGGINGFACE') return secureGetItem('USER_HF_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'PRODIA') return secureGetItem('USER_PRODIA_API_KEY') ? 'connected' : 'not-set';
    if (provider === 'TOGETHER') return secureGetItem('USER_TOGETHER_API_KEY') ? 'connected' : 'not-set';
    return 'not-set';
  };

  const NAV_ITEMS = [
    { step: AppStep.UPLOAD, label: 'upload', icon: 'fa-cloud-arrow-up', color: 'text-violet-400' },
    { step: AppStep.REFINE, label: 'refine', icon: 'fa-wand-magic-sparkles', color: 'text-cyan-400' },
    { step: AppStep.STORYBOARD, label: 'storyboard', icon: 'fa-film', color: 'text-pink-400' },
    { step: AppStep.RESULTS, label: 'results', icon: 'fa-clapperboard', color: 'text-lime-400' },
    { step: AppStep.POSTER, label: 'poster', icon: 'fa-palette', color: 'text-orange-400' },
    { step: AppStep.CLIP_EDITOR, label: 'clip edit', icon: 'fa-scissors', color: 'text-emerald-400' },
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
    <div className="min-h-screen text-white selection:bg-violet-500/30 font-sans relative" style={{ background: '#050508' }}>
      {loadingMsg && <LoadingOverlay message={loadingMsg} />}

      {/* ========== SIDEBAR (Desktop) ========== */}
      <aside className="sidebar" onMouseEnter={() => setSidebarHover(true)} onMouseLeave={() => setSidebarHover(false)}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/5 min-h-[72px]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20">
            <i className="fa-solid fa-bolt text-white text-sm"></i>
          </div>
          <div className="sidebar-header-text overflow-hidden">
            <h1 className="text-sm font-extrabold gradient-text whitespace-nowrap">CreatorKit AI</h1>
            <p className="text-[9px] text-zinc-500 font-medium">beta v2.0</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = step === item.step;
            const can = canNavigate(item.step);
            return (
              <button key={item.step} onClick={() => can && setStep(item.step)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative
                ${isActive ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5'}
                ${can ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'}`}>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-violet-400 to-cyan-400 rounded-r-full" />}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all
                  ${isActive ? 'bg-gradient-to-br from-violet-500/30 to-cyan-500/30 shadow-inner' : 'bg-white/5 group-hover:bg-white/10'}`}>
                  <i className={`fa-solid ${item.icon} text-xs ${isActive ? item.color : 'text-zinc-500 group-hover:text-zinc-300'}`}></i>
                </div>
                <span className={`nav-label text-xs font-bold ${isActive ? 'text-white' : 'text-zinc-500'}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="px-2 pb-4 space-y-1 border-t border-white/5 pt-3">
          <button onClick={() => setShowGuide(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all group">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10">
              <i className="fa-solid fa-book text-xs text-zinc-500 group-hover:text-zinc-300"></i>
            </div>
            <span className="nav-label text-xs font-bold text-zinc-500">guide</span>
          </button>
          <button onClick={() => setShowKeyModal(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all group">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10">
              <i className="fa-solid fa-plug text-xs text-zinc-500 group-hover:text-zinc-300"></i>
            </div>
            <span className="nav-label text-xs font-bold text-zinc-500">api keys</span>
          </button>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className={`neon-dot ${activeProvider === 'POLLINATIONS' || activeProvider === 'PUTER' ? 'neon-dot-green' : 'neon-dot-violet'}`}></div>
            <span className="nav-label text-[10px] font-bold text-zinc-500 lowercase">{activeProvider}</span>
          </div>
          {sessionCost > 0 && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className={`neon-dot ${sessionCost > 2 ? 'neon-dot-pink' : 'neon-dot-cyan'}`}></div>
              <span className="nav-label text-[10px] font-mono font-bold text-zinc-400">${sessionCost.toFixed(3)}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ========== MOBILE BOTTOM NAV ========== */}
      <nav className="mobile-nav">
        <div className="flex justify-around items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = step === item.step;
            const can = canNavigate(item.step);
            return (
              <button key={item.step} onClick={() => can && setStep(item.step)}
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all min-w-[52px]
                ${isActive ? 'bg-white/10' : ''}
                ${can ? '' : 'opacity-30'}`}>
                <i className={`fa-solid ${item.icon} text-sm ${isActive ? item.color : 'text-zinc-600'}`}></i>
                <span className={`text-[9px] font-bold ${isActive ? 'text-white' : 'text-zinc-600'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ========== MAIN CONTENT ========== */}
      <main className="relative z-10 md:ml-[72px] pb-24 md:pb-8 min-h-screen">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6">
          <div>
            <h2 className="text-lg md:text-2xl font-extrabold">
              <span className="gradient-text">
                {step === AppStep.UPLOAD ? 'Upload' : step === AppStep.REFINE ? 'Refine' : step === AppStep.STORYBOARD ? 'Storyboard' : step === AppStep.RESULTS ? 'Results' : step === AppStep.POSTER ? 'Poster Maker' : 'Clip Editor'}
              </span>
            </h2>
            <p className="text-[10px] md:text-xs text-zinc-500 font-medium mt-0.5 lowercase">
              {step === AppStep.UPLOAD ? 'upload model & product images' : step === AppStep.REFINE ? 'pick your favorite & customize' : step === AppStep.STORYBOARD ? 'review your grid layout' : step === AppStep.RESULTS ? 'final scenes & motion export' : step === AppStep.POSTER ? 'create stunning posters' : 'cut, trim & export clips'}
            </p>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <button onClick={() => setShowKeyModal(true)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
              <i className="fa-solid fa-plug text-xs text-zinc-500"></i>
            </button>
          </div>
        </div>

        {quotaError && (
          <div className="mx-4 md:mx-8 mb-6 p-4 glass-static rounded-2xl border-red-500/30 animate-in flex items-center gap-4" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
            <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
            </div>
            <div>
              <h4 className="text-xs font-bold text-red-400 mb-0.5">quota warning</h4>
              <p className="text-xs text-zinc-400">{quotaError}</p>
            </div>
          </div>
        )}

        <div className="px-4 md:px-8">

        {/* ========== UPLOAD STEP ========== */}
        {step === AppStep.UPLOAD && (
          <div className="animate-in max-w-5xl mx-auto space-y-6">
            {/* Upload Cards */}
            <div className="grid grid-cols-2 gap-3 md:gap-6">
              {[{ id: 'model', label: 'model photo', desc: 'your base model image' }, { id: 'product', label: 'product', desc: 'item to integrate' }].map(u => (
                <label key={u.id} className="card-3d group cursor-pointer">
                  <div className="card-3d-inner glass rounded-2xl md:rounded-3xl overflow-hidden">
                    <div className="aspect-[3/4] relative">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.id as any)} />
                      {state[`${u.id}Image` as keyof GenerationState] ? (
                        <div className="w-full h-full img-zoom">
                          <img src={state[`${u.id}Image` as keyof GenerationState] as string} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                            <span className="btn-ghost rounded-full px-4 py-2 text-xs font-bold text-white">change</span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 transition-all group-hover:scale-105">
                          <div className="w-14 h-14 md:w-20 md:h-20 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-all duration-500">
                            <i className="fa-solid fa-plus text-lg md:text-2xl text-zinc-600 group-hover:text-violet-400 transition-colors"></i>
                          </div>
                          <div className="text-center">
                            <p className="text-xs md:text-sm font-bold text-zinc-400 group-hover:text-white transition-colors lowercase">{u.label}</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5 lowercase">{u.desc}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Prompt Section */}
            <div className="glass rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <i className="fa-solid fa-wand-sparkles text-violet-400 text-sm"></i>
                <span className="text-xs font-bold text-zinc-400 lowercase">prompt category</span>
              </div>
              {Object.entries(CATEGORIZED_PROMPTS).map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{cat}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((rec, i) => (
                      <button key={i} onClick={() => setState(prev => ({ ...prev, promptInstruction: rec.text }))}
                        className={`chip rounded-xl px-3 py-2 text-xs font-bold lowercase ${state.promptInstruction === rec.text ? 'chip-active' : 'text-zinc-500'}`}>
                        {rec.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <textarea value={state.promptInstruction} onChange={(e) => setState(prev => ({ ...prev, promptInstruction: e.target.value }))}
                placeholder="describe how the model should interact with the product..."
                className="w-full input-wild rounded-2xl py-3 px-4 text-sm resize-none h-20" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fa-solid fa-microchip text-violet-400"></i> image model
                  </label>
                  <select value={state.selectedImageModel} onChange={(e) => setState(prev => ({ ...prev, selectedImageModel: e.target.value as any }))}
                    className="w-full input-wild rounded-xl py-2.5 px-3 text-sm font-bold">
                    <option value="nano-banana-pro">Nano Banana Pro (best consistency)</option>
                    <option value="seedream-4.5">Seedream 4.5 (high quality)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fa-solid fa-droplet text-pink-400"></i> color theme
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_THEMES.slice(0, 6).map(t => (
                      <button key={t} onClick={() => setColorTheme(t)}
                        className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-bold lowercase ${colorTheme === t ? 'chip-active' : 'text-zinc-500'}`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button disabled={!state.modelImage || !state.productImage} onClick={onRefineClick}
              className="w-full btn-wild disabled:opacity-20 disabled:cursor-not-allowed py-4 md:py-5 rounded-2xl font-bold text-sm shadow-2xl lowercase">
              let's gooo
            </button>
          </div>
        )}

        {/* ========== REFINE STEP ========== */}
        {step === AppStep.REFINE && (
          <div className="animate-in max-w-6xl mx-auto space-y-6">
            <div className="text-center mb-2">
              <h3 className="text-sm font-bold text-zinc-400 lowercase">pick your fave variation</h3>
            </div>

            {/* ALL variations shown prominently */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {(state.combinedCandidates || [state.combinedImage]).filter(Boolean).map((img, idx) => (
                <div key={idx} onClick={() => setState(prev => ({ ...prev, combinedImage: img }))}
                  className={`card-3d cursor-pointer transition-all duration-500 ${state.combinedImage === img ? 'scale-[1.02] z-10' : 'opacity-70 hover:opacity-100'}`}>
                  <div className={`card-3d-inner rounded-2xl md:rounded-3xl overflow-hidden relative ${state.combinedImage === img ? 'animated-border' : ''}`}>
                    <div className="aspect-[9/16] bg-[#0e0e16] relative img-zoom">
                      <img src={img as string} className="w-full h-full object-cover" />
                      {state.combinedImage === img && (
                        <div className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-violet-500/30">
                          <i className="fa-solid fa-check text-white text-xs"></i>
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <span className="text-xs font-bold text-white/80">Version {idx + 1}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <button onClick={onRefineClick} className="btn-ghost rounded-2xl px-6 py-3 text-xs font-bold text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-2">
                <i className="fa-solid fa-rotate-right"></i> regenerate all
              </button>
            </div>

            {/* Customization Panel */}
            <div className="glass rounded-3xl p-5 md:p-8 space-y-6">
              <h3 className="text-sm font-bold gradient-text lowercase">make it yours</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">brand text</label>
                  <input type="text" value={state.brandingText} onChange={(e) => setState(prev => ({ ...prev, brandingText: e.target.value }))}
                    placeholder="e.g. ALANA" className="w-full input-wild rounded-xl px-4 py-3 text-sm font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">background / atmosphere</label>
                  <input type="text" value={state.stylePrompt} onChange={(e) => setState(prev => ({ ...prev, stylePrompt: e.target.value }))}
                    placeholder="e.g. Cyberpunk City" className="w-full input-wild rounded-xl px-4 py-3 text-sm font-bold" />
                  <div className="flex flex-wrap gap-1.5">
                    {BACKGROUND_PRESETS.map((bg, i) => (
                      <button key={i} onClick={() => setState(prev => ({ ...prev, stylePrompt: bg }))}
                        className={`chip rounded-lg px-2 py-1 text-[10px] font-bold lowercase ${state.stylePrompt === bg ? 'chip-active' : 'text-zinc-500'}`}>{bg}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">font style</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FONT_OPTIONS.map(o => (
                      <button key={o} onClick={() => setState(prev => ({ ...prev, fontStyle: o }))}
                        className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${state.fontStyle === o ? 'chip-active' : 'text-zinc-500'}`}>{o}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">text placement</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLACEMENT_OPTIONS.map(o => (
                      <button key={o} onClick={() => setState(prev => ({ ...prev, textPlacement: o }))}
                        className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${state.textPlacement === o ? 'chip-active' : 'text-zinc-500'}`}>{o}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <button onClick={onApplyBrandingClick} className="btn-neon px-8 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 lowercase">
                  <i className="fa-solid fa-wand-magic-sparkles"></i> apply the vibes
                </button>
              </div>
            </div>

            {/* Grid Layout Selection */}
            <div className="glass rounded-3xl p-5 md:p-8 space-y-5">
              <h3 className="text-sm font-bold gradient-text lowercase">storyboard layout</h3>
              <div className="grid grid-cols-3 gap-3 md:gap-4">
                {[1, 2, 3].map((rows) => (
                  <button key={rows} onClick={() => setGridRows(rows)}
                    className={`glass-card rounded-2xl p-4 md:p-5 flex flex-col items-center gap-3 transition-all ${gridRows === rows ? 'chip-active pulse-glow' : ''}`}>
                    <div className="flex flex-col gap-1">
                      {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className={`w-10 h-3 rounded-sm ${gridRows === rows ? 'bg-violet-500' : 'bg-zinc-700'}`}></div>
                      ))}
                    </div>
                    <span className="text-sm font-bold">{rows}x3</span>
                    <span className={`text-xs font-mono ${gridRows === rows ? 'text-violet-300' : 'text-zinc-600'}`}>~${(rows * 0.015).toFixed(3)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 justify-center">
              <button onClick={() => setStep(AppStep.UPLOAD)} className="btn-ghost px-8 py-4 rounded-2xl font-bold text-xs text-zinc-400 lowercase">back</button>
              <button onClick={onGridClick} className="btn-wild px-12 py-4 rounded-2xl font-bold text-sm shadow-2xl lowercase">generate {gridRows}x3 grid</button>
            </div>
          </div>
        )}

        {/* ========== STORYBOARD STEP ========== */}
        {step === AppStep.STORYBOARD && (
          <div className="animate-in flex flex-col items-center max-w-4xl mx-auto space-y-6">
            <div className={`glass rounded-3xl p-4 md:p-6 shadow-2xl w-full ${gridRows === 1 ? 'max-w-4xl' : gridRows === 2 ? 'max-w-2xl' : 'max-w-md'} mx-auto`}>
              <div className="img-zoom rounded-2xl overflow-hidden">
                <img src={state.storyboardGrid!} className={`w-full object-contain ${gridRows === 1 ? 'aspect-[16/9]' : gridRows === 2 ? 'aspect-[4/5]' : 'aspect-[9/16]'}`} />
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={onGridClick} className="btn-ghost px-8 py-4 rounded-2xl font-bold text-xs text-zinc-400 lowercase flex items-center gap-2">
                <i className="fa-solid fa-rotate-right"></i> regenerate
              </button>
              <button onClick={onFinalRenderClick} className="btn-wild px-12 py-4 rounded-2xl font-bold text-sm shadow-2xl lowercase">proceed to render</button>
            </div>
          </div>
        )}

        {/* ========== RESULTS STEP ========== */}
        {step === AppStep.RESULTS && (
          <div className="animate-in">
            <div className="grid grid-cols-12 gap-4 md:gap-6">
              {/* Sidebar Reference */}
              <aside className="col-span-12 lg:col-span-3 space-y-4 order-2 lg:order-1">
                <div className="glass-static rounded-2xl p-3">
                  <h3 className="text-[10px] font-bold text-violet-400 mb-2 uppercase tracking-wider">master reference</h3>
                  {state.storyboardGrid && (
                    <div className="img-zoom rounded-xl overflow-hidden">
                      <img src={state.storyboardGrid} className={`w-full object-cover opacity-80 ${gridRows === 1 ? 'aspect-[16/9]' : gridRows === 2 ? 'aspect-[4/5]' : 'aspect-[9/16]'}`} />
                    </div>
                  )}
                </div>
                <div className="glass-static rounded-2xl p-3">
                  <ProgressBar progress={state.extractionProgress} />
                </div>
              </aside>

              {/* Scene Grid - ALL VERSIONS SHOWN */}
              <section className="col-span-12 lg:col-span-9 order-1 lg:order-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                  {state.scenes.slice(0, gridRows * 3).map((scene, idx) => (
                    <div key={scene.id} className="glass-card rounded-2xl md:rounded-3xl p-3 md:p-4 flex flex-col gap-3 group card-3d">
                      <div className="card-3d-inner">
                        <div className={`aspect-[9/16] rounded-xl md:rounded-2xl overflow-hidden relative shadow-xl ${(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo || scene.isEditing) ? 'animated-border' : ''}`}>
                          <div className="bg-[#0e0e16] w-full h-full relative z-10 img-zoom">
                            {scene.image ? (
                              scene.videoUrl ? <video src={scene.videoUrl} autoPlay loop muted={scene.isVideoMuted} onLoadedMetadata={(e) => updateSceneField(idx, 'videoDuration', formatDuration(e.currentTarget.duration))} className="w-full h-full object-cover" />
                              : <img src={scene.image} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                {scene.isExtracting ? (<><div className="w-8 h-8 border-2 border-violet-500/20 border-t-violet-400 rounded-full animate-spin"></div><span className="text-[10px] font-bold text-zinc-600">slicing...</span></>) : (<i className="fa-solid fa-image text-zinc-800 text-xl"></i>)}
                              </div>
                            )}
                          </div>

                          {/* Overlay States */}
                          {(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo || scene.isEditing) && (
                            <div className="absolute inset-0 bg-[#050508]/90 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in">
                              {scene.isGeneratingVideo ? (
                                <div className="text-center px-4">
                                  <div className="w-12 h-12 border-2 border-violet-500/20 border-t-violet-400 rounded-full animate-spin mb-3"></div>
                                  <h4 className="text-[10px] font-bold text-white mb-1 lowercase">generating motion</h4>
                                  <span className="text-[10px] text-violet-300 font-mono">~4-5 min</span>
                                </div>
                              ) : (<div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin"></div>)}
                            </div>
                          )}

                          {/* Hover Action Bar */}
                          {scene.image && (
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1 z-40 opacity-0 group-hover:opacity-100 transition-all">
                              <div className="flex glass-static rounded-xl p-1 items-center gap-0.5 shadow-2xl">
                                <button onClick={() => downloadMedia(scene.image!, `shot-${idx+1}.png`)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white" title="Download"><i className="fa-solid fa-download text-[10px]"></i></button>
                                {scene.videoUrl && <button onClick={() => downloadMedia(scene.videoUrl!, `shot-${idx+1}.mp4`)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-600/30 text-violet-400" title="Video"><i className="fa-solid fa-film text-[10px]"></i></button>}
                                <button onClick={() => onUpscale(idx, '2K')} className="px-1.5 py-1 text-[9px] font-bold rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white">2K</button>
                                <button onClick={() => onUpscale(idx, '4K')} className="px-1.5 py-1 text-[9px] font-bold rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white">4K</button>
                                <label className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer" title="Upload Ref">
                                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handleSceneReferenceUpload(e, idx)} /><i className="fa-solid fa-upload text-[10px]"></i>
                                </label>
                                <button onClick={() => onRepair(idx)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white" title="Repair"><i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i></button>
                              </div>
                            </div>
                          )}

                          {scene.videoUrl && (
                            <div className="absolute bottom-2 right-2 z-50 flex items-center gap-1">
                              <span className="text-[10px] font-mono glass-static px-2 py-0.5 rounded-lg text-white">{scene.videoDuration || "00:00"}</span>
                              <button onClick={() => updateSceneField(idx, 'isVideoMuted', !scene.isVideoMuted)} className="w-6 h-6 flex items-center justify-center glass-static rounded-full">
                                <i className={`fa-solid ${scene.isVideoMuted ? 'fa-volume-xmark' : 'fa-volume-high'} text-[8px] text-white`}></i>
                              </button>
                            </div>
                          )}
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 glass-static px-3 py-1 rounded-full text-[10px] font-bold z-40 lowercase">shot {String(idx+1).padStart(2,'0')}</div>
                        </div>

                        {/* Scene Controls */}
                        <div className="space-y-2 mt-3">
                          <div className="flex gap-1.5">
                            <input type="text" value={state.editPrompts?.[idx] || ""} onChange={(e) => { const p = [...state.editPrompts]; p[idx] = e.target.value; setState(prev => ({ ...prev, editPrompts: p })); }}
                              placeholder="edit prompt..." className="flex-1 input-wild rounded-xl py-2 px-3 text-[11px]" />
                            <button onClick={() => onEditImage(idx)} disabled={!scene.image || scene.isEditing || !state.editPrompts[idx]}
                              className="btn-ghost rounded-xl w-8 flex items-center justify-center disabled:opacity-20"><i className="fa-solid fa-check text-[10px] text-white"></i></button>
                          </div>

                          <div className="glass-static rounded-xl p-2.5 space-y-2">
                            <select value={scene.selectedVideoProvider || 'VEO_3.1'} onChange={(e) => updateSceneField(idx, 'selectedVideoProvider', e.target.value)}
                              className="w-full input-wild rounded-lg px-2 py-2 text-[10px] font-bold">
                              <optgroup label="Google"><option value="VEO_3.1">Veo 3.1</option></optgroup>
                              <optgroup label="Kling"><option value="KLING_2.5">Kling 2.5</option><option value="KLING_2.6">Kling 2.6</option></optgroup>
                              <optgroup label="Wan"><option value="WAN_2.5">Wan 2.5</option><option value="WAN_2.6">Wan 2.6</option></optgroup>
                              <optgroup label="Seedance"><option value="SEEDANCE_PRO">Seedance Pro</option><option value="SEEDANCE_1.5_PRO">Seedance 1.5 Pro</option></optgroup>
                              <optgroup label="Minimax"><option value="MINIMAX">Minimax</option></optgroup>
                            </select>
                            {['VEO_3.1','KLING_2.6','WAN_2.6','SEEDANCE_1.5_PRO'].includes(scene.selectedVideoProvider || '') && (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={scene.enableAudio || false} onChange={(e) => updateSceneField(idx, 'enableAudio', e.target.checked)} className="w-3 h-3 rounded" />
                                <span className="text-[10px] font-bold text-zinc-400">audio</span>
                              </label>
                            )}
                            <div className="flex gap-1.5">
                              {['720p','1080p'].map(r => (
                                <button key={r} onClick={() => updateSceneField(idx, 'videoResolution', r)}
                                  className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${(scene.videoResolution || '720p') === r ? 'chip-active' : 'chip text-zinc-500'}`}>
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-zinc-500">duration</span>
                              <span className="text-xs font-mono font-bold text-violet-400">{scene.duration}s</span>
                            </div>
                            <input type="range" min={getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').min} max={getDurationLimits(scene.selectedVideoProvider || 'VEO_3.1').max}
                              value={scene.duration} onChange={(e) => updateSceneField(idx, 'duration', parseInt(e.target.value))} className="w-full" />
                            <div className="flex justify-between text-[10px] mt-1">
                              <span className="text-zinc-600">cost: <span className="text-lime-400 font-bold">{formatCost(calculateVideoCost(scene.selectedVideoProvider || 'VEO_3.1', scene.duration, scene.videoResolution || '720p', scene.enableAudio))}</span></span>
                              <span className="text-zinc-600">est: <span className="text-cyan-400 font-bold">{getGenerationTime(scene.selectedVideoProvider || 'VEO_3.1')}</span></span>
                            </div>
                          </div>

                          <div className="glass-static rounded-xl p-2.5 space-y-1.5">
                            <textarea value={scenePrompts[idx]} onChange={(e) => { const p = [...scenePrompts]; p[idx] = e.target.value; setScenePrompts(p); }}
                              className="w-full bg-transparent text-[10px] text-zinc-400 h-12 resize-none outline-none placeholder:text-zinc-700" placeholder="motion prompt..." />
                            <div className="grid grid-cols-2 gap-1.5">
                              <input type="text" value={scene.bgMusicPrompt || ""} onChange={(e) => updateSceneField(idx, 'bgMusicPrompt', e.target.value)} placeholder="bg music"
                                className="input-wild rounded-lg px-2 py-1.5 text-[10px]" />
                              <input type="text" value={scene.dialoguePrompt || ""} onChange={(e) => updateSceneField(idx, 'dialoguePrompt', e.target.value)} placeholder="dialogue"
                                className="input-wild rounded-lg px-2 py-1.5 text-[10px]" />
                            </div>
                          </div>

                          <button onClick={() => onVideo(idx)} disabled={!scene.image || scene.isGeneratingVideo}
                            className="w-full btn-wild disabled:opacity-10 py-3 rounded-xl text-[11px] font-bold lowercase">
                            {scene.isGeneratingVideo ? 'processing...' : 'bring it to life'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ========== POSTER STEP ========== */}
        {step === AppStep.POSTER && (
          <div className="animate-in max-w-6xl mx-auto space-y-6">
            {/* Sub-nav */}
            <div className="flex justify-center gap-2">
              {(['upload','style','settings','results'] as const).map(sub => (
                <button key={sub} onClick={() => setPosterSubStep(sub)}
                  className={`chip px-4 py-2.5 rounded-xl text-xs font-bold lowercase ${posterSubStep === sub ? 'chip-active' : 'text-zinc-500'}`}>
                  {sub === 'upload' ? '1. upload' : sub === 'style' ? '2. style' : sub === 'settings' ? '3. customize' : '4. results'}
                </button>
              ))}
            </div>

            {posterSubStep === 'upload' && (
              <div className="flex flex-col items-center gap-6">
                <label className="card-3d w-full max-w-md cursor-pointer group">
                  <div className="card-3d-inner glass rounded-3xl overflow-hidden">
                    <div className="aspect-square relative">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const f = e.target.files?.[0]; if (!f) return;
                        const r = new FileReader(); r.onload = (ev) => setPosterState(prev => ({ ...prev, productImage: ev.target?.result as string })); r.readAsDataURL(f);
                      }} />
                      {posterState.productImage ? (
                        <div className="w-full h-full img-zoom">
                          <img src={posterState.productImage} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                            <span className="btn-ghost rounded-full px-4 py-2 text-xs font-bold text-white">change</span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 group-hover:scale-105 transition-transform">
                          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-all">
                            <i className="fa-solid fa-plus text-2xl text-zinc-600 group-hover:text-violet-400 transition-colors"></i>
                          </div>
                          <p className="text-sm font-bold text-zinc-400 group-hover:text-white lowercase">add product image</p>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
                {posterState.productImage && (
                  <button onClick={() => setPosterSubStep('style')} className="btn-wild px-12 py-4 rounded-2xl font-bold text-sm lowercase">choose style</button>
                )}
              </div>
            )}

            {posterSubStep === 'style' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
                  {POSTER_STYLES.map(style => (
                    <button key={style.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, styleId: style.id, mainPrompt: style.promptTemplate } }))}
                      className={`glass-card rounded-2xl p-3 md:p-4 text-left transition-all ${posterState.config.styleId === style.id ? 'chip-active pulse-glow' : ''}`}>
                      <div className="text-2xl mb-2">{style.emoji}</div>
                      <div className="text-xs md:text-sm font-bold text-white mb-1">{style.name}</div>
                      <div className="text-[10px] text-zinc-500 mb-2 line-clamp-2">{style.vibe}</div>
                      <div className="flex gap-1">
                        {style.colors.map((c, i) => <div key={i} className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: c }}></div>)}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-center gap-3">
                  <button onClick={() => setPosterSubStep('upload')} className="btn-ghost px-6 py-3 rounded-2xl text-xs font-bold text-zinc-400 lowercase">back</button>
                  <button onClick={() => setPosterSubStep('settings')} className="btn-wild px-8 py-3 rounded-2xl font-bold text-xs lowercase">customize</button>
                </div>
              </div>
            )}

            {posterSubStep === 'settings' && (
              <div className="max-w-3xl mx-auto space-y-4">
                {/* Provider */}
                <div className="glass rounded-2xl p-4 space-y-3">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">image provider</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['POLLINATIONS','PUTER','HUGGINGFACE','PRODIA','TOGETHER'] as AiProvider[]).map(p => (
                      <button key={p} onClick={() => setPosterProvider(p)}
                        className={`chip px-3 py-2 rounded-xl text-[10px] font-bold lowercase ${posterProvider === p ? 'chip-active' : 'text-zinc-500'}`}>
                        {p === 'POLLINATIONS' ? 'pollinations (free)' : p === 'PUTER' ? 'puter (free)' : p.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format & Layout */}
                <div className="glass rounded-2xl p-4 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 block">format</label>
                    <div className="flex flex-wrap gap-1.5">
                      {POSTER_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, format: f.id } }))}
                          className={`chip px-3 py-2 rounded-xl text-[10px] font-bold ${posterState.config.format === f.id ? 'chip-active' : 'text-zinc-500'}`}>
                          {f.label} <span className="text-zinc-600 ml-1">{f.aspect}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 block">layout</label>
                    <div className="flex flex-wrap gap-1.5">
                      {POSTER_LAYOUTS.map(l => (
                        <button key={l.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, layout: l.id } }))}
                          className={`chip px-3 py-2 rounded-xl text-[10px] font-bold ${posterState.config.layout === l.id ? 'chip-active' : 'text-zinc-500'}`}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Product, Mood, Background */}
                <div className="glass rounded-2xl p-4 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 block">product placement</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRODUCT_PLACEMENTS.map(p => (
                        <button key={p.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, placement: p.id } }))}
                          className={`chip px-3 py-2 rounded-xl text-[10px] font-bold ${posterState.config.placement === p.id ? 'chip-active' : 'text-zinc-500'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 block">mood</label>
                    <div className="flex flex-wrap gap-1.5">
                      {POSTER_MOODS.map(m => (
                        <button key={m.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, mood: m.id } }))}
                          className={`chip px-3 py-2 rounded-xl text-[10px] font-bold ${posterState.config.mood === m.id ? 'chip-active' : 'text-zinc-500'}`}>
                          {m.emoji} {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 block">background type</label>
                    <div className="flex flex-wrap gap-1.5">
                      {BACKGROUND_TYPES.map(b => (
                        <button key={b.id} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, backgroundType: b.id } }))}
                          className={`chip px-3 py-2 rounded-xl text-[10px] font-bold ${posterState.config.backgroundType === b.id ? 'chip-active' : 'text-zinc-500'}`}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Text & Sliders */}
                <div className="glass rounded-2xl p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5 block">brand name</label>
                      <input type="text" value={posterState.config.brandName} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, brandName: e.target.value } }))}
                        placeholder="e.g. LUXE" className="w-full input-wild rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5 block">tagline</label>
                      <input type="text" value={posterState.config.tagline} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, tagline: e.target.value } }))}
                        placeholder="e.g. Elevate Your Style" className="w-full input-wild rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5 block">CTA text</label>
                      <input type="text" value={posterState.config.ctaText} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, ctaText: e.target.value } }))}
                        placeholder="e.g. Shop Now" className="w-full input-wild rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5 block">boldness: <span className="text-violet-400">{posterState.config.boldness}/10</span></label>
                      <input type="range" min={1} max={10} value={posterState.config.boldness} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, boldness: parseInt(e.target.value) } }))} className="w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5 block">variations: <span className="text-violet-400">{posterState.config.variationCount}</span></label>
                      <input type="range" min={1} max={6} value={posterState.config.variationCount} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, variationCount: parseInt(e.target.value) } }))} className="w-full" />
                    </div>
                  </div>
                </div>

                {/* Prompt */}
                <div className="glass rounded-2xl p-4 space-y-3">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">main prompt</label>
                  <textarea value={posterState.config.mainPrompt} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, mainPrompt: e.target.value } }))}
                    className="w-full input-wild rounded-xl px-3 py-3 text-sm resize-none h-20" placeholder="describe your poster..." />
                  <div className="flex flex-wrap gap-1">
                    {QUICK_PROMPT_CHIPS.map(chip => (
                      <button key={chip} onClick={() => setPosterState(prev => ({ ...prev, config: { ...prev.config, additionalInstructions: prev.config.additionalInstructions + ' ' + chip } }))}
                        className="chip rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-500 lowercase">{chip}</button>
                    ))}
                  </div>
                  <textarea value={posterState.config.additionalInstructions} onChange={(e) => setPosterState(prev => ({ ...prev, config: { ...prev.config, additionalInstructions: e.target.value } }))}
                    className="w-full input-wild rounded-xl px-3 py-3 text-sm resize-none h-16" placeholder="additional instructions..." />
                </div>

                <div className="flex justify-center gap-3">
                  <button onClick={() => setPosterSubStep('style')} className="btn-ghost px-6 py-3 rounded-2xl text-xs font-bold text-zinc-400 lowercase">back</button>
                  <button onClick={onGeneratePoster} disabled={posterState.isGenerating}
                    className="btn-wild px-10 py-3 rounded-2xl font-bold text-sm lowercase disabled:opacity-50 flex items-center gap-2">
                    {posterState.isGenerating ? <><i className="fa-solid fa-spinner fa-spin"></i> generating...</> : `generate ${posterState.config.variationCount} poster${posterState.config.variationCount > 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}

            {/* Poster Results - MULTIPLE VERSIONS SHOWN */}
            {posterSubStep === 'results' && (
              <div className="space-y-6">
                {posterState.results.length === 0 ? (
                  <div className="text-center py-16">
                    <i className="fa-solid fa-palette text-4xl text-zinc-800 mb-4"></i>
                    <p className="text-sm text-zinc-600 lowercase">no posters yet. go back and generate some!</p>
                  </div>
                ) : (
                  <div className={`grid gap-4 ${posterState.results.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : posterState.results.length === 2 ? 'grid-cols-2 max-w-3xl mx-auto' : posterState.results.length <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
                    {posterState.results.map((result, idx) => (
                      <div key={result.id} className="glass-card rounded-2xl md:rounded-3xl p-3 group card-3d scale-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                        <div className="card-3d-inner">
                          <div className="aspect-[9/16] rounded-xl md:rounded-2xl overflow-hidden mb-3 img-zoom">
                            <img src={result.imageUrl} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => downloadMedia(result.imageUrl, `poster-${idx+1}.png`)}
                              className="flex-1 btn-neon py-2.5 rounded-xl text-[10px] font-bold lowercase flex items-center justify-center gap-1.5">
                              <i className="fa-solid fa-download"></i> download
                            </button>
                            <button onClick={() => { setPosterState(prev => ({ ...prev, config: { ...prev.config, mainPrompt: result.prompt } })); setPosterSubStep('settings'); }}
                              className="btn-ghost px-3 py-2.5 rounded-xl text-[10px] font-bold text-zinc-400 lowercase">edit</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-center gap-3">
                  <button onClick={() => setPosterSubStep('settings')} className="btn-ghost px-6 py-3 rounded-2xl text-xs font-bold text-zinc-400 lowercase">generate more</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== CLIP EDITOR STEP ========== */}
        {step === AppStep.CLIP_EDITOR && (
          <div className="animate-in max-w-5xl mx-auto space-y-4">
            {/* Upload */}
            <div className="glass rounded-2xl md:rounded-3xl p-4 md:p-6">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-3 block">upload or select video</label>
              <label className="block w-full glass-static rounded-2xl p-6 md:p-8 text-center cursor-pointer hover:border-violet-500/30 transition-all border border-dashed border-white/10">
                <input type="file" accept="video/*" className="hidden" onChange={onClipVideoUpload} />
                {clipState.videoFile ? (
                  <video ref={clipVideoRef} src={clipState.videoFile} className="w-full max-h-64 rounded-xl mx-auto" controls onLoadedMetadata={onClipVideoLoaded} />
                ) : (
                  <div className="opacity-50"><i className="fa-solid fa-film text-3xl text-zinc-600 mb-3"></i><p className="text-sm font-bold text-zinc-500 lowercase">drop a video file here</p></div>
                )}
              </label>
              {clipState.videoDuration > 0 && <p className="text-[10px] text-zinc-500 mt-2 text-center font-mono">duration: {formatTimestamp(clipState.videoDuration)}</p>}
            </div>

            {clipState.videoFile && (
              <>
                <div className="glass rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-4">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">quick actions</label>
                  <div className="flex flex-wrap gap-2">
                    {([['random','Random Cut'],['beat','Beat Cut'],['equal','Equal Split'],['manual','Manual']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setClipQuickAction(id as any)}
                        className={`chip px-4 py-2.5 rounded-xl text-xs font-bold lowercase ${clipQuickAction === id ? 'chip-active' : 'text-zinc-500'}`}>{label}</button>
                    ))}
                  </div>
                  {clipQuickAction === 'random' && (
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] text-zinc-500">cuts:</label>
                      <input type="range" min={2} max={20} value={clipRandomCount} onChange={(e) => setClipRandomCount(parseInt(e.target.value))} className="flex-1" />
                      <span className="text-sm font-bold text-violet-400">{clipRandomCount}</span>
                    </div>
                  )}
                  {clipQuickAction === 'beat' && (
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] text-zinc-500">interval:</label>
                      <div className="flex gap-1.5">
                        {[0.5,1,1.5,2,3,5].map(v => (
                          <button key={v} onClick={() => setClipBeatInterval(v)}
                            className={`chip px-3 py-1.5 rounded-lg text-xs font-bold ${clipBeatInterval === v ? 'chip-active' : 'text-zinc-500'}`}>{v}s</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {clipQuickAction === 'equal' && (
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] text-zinc-500">parts:</label>
                      <input type="range" min={2} max={10} value={clipEqualParts} onChange={(e) => setClipEqualParts(parseInt(e.target.value))} className="flex-1" />
                      <span className="text-sm font-bold text-violet-400">{clipEqualParts}</span>
                    </div>
                  )}
                  {clipQuickAction === 'manual' && (
                    <input type="text" value={clipManualInput} onChange={(e) => setClipManualInput(e.target.value)} placeholder="0:02, 0:05.5, 0:08, 0:12"
                      className="w-full input-wild rounded-xl px-3 py-2.5 text-sm" />
                  )}
                  {clipQuickAction && (
                    <button onClick={applyClipAction} className="btn-wild px-6 py-2.5 rounded-xl text-xs font-bold lowercase">apply cuts</button>
                  )}
                </div>

                {clipState.clips.length > 0 && (
                  <div className="glass rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">segments ({clipState.clips.length})</label>
                      <span className="text-[10px] font-mono text-violet-400">total: {formatTimestamp(calculateTotalDuration(clipState.clips))}</span>
                    </div>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {clipState.clips.map((seg) => (
                        <div key={seg.id} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${seg.enabled ? 'glass-static border-lime-500/10' : 'bg-red-950/10 border border-red-500/10 opacity-40'}`} style={seg.enabled ? { borderColor: 'rgba(132,204,22,0.1)' } : {}}>
                          <button onClick={() => setClipState(prev => ({ ...prev, clips: prev.clips.map(s => s.id === seg.id ? { ...s, enabled: !s.enabled } : s) }))}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${seg.enabled ? 'bg-lime-500/20 text-lime-400' : 'bg-red-500/20 text-red-400'}`}>
                            {seg.enabled ? <i className="fa-solid fa-check"></i> : <i className="fa-solid fa-xmark"></i>}
                          </button>
                          <span className="text-[10px] font-bold text-zinc-400">{seg.label}</span>
                          <span className="text-[10px] font-mono text-zinc-500 ml-auto">{formatTimestamp(seg.start)} - {formatTimestamp(seg.end)}</span>
                          <span className="text-[10px] font-mono text-violet-400">{(seg.end - seg.start).toFixed(1)}s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="glass rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-4">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">settings</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1.5 block">speed: <span className="text-violet-400 font-bold">{clipState.config.speed}x</span></label>
                      <input type="range" min={0.25} max={4} step={0.25} value={clipState.config.speed} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, speed: parseFloat(e.target.value) } }))} className="w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1.5 block">format</label>
                      <div className="flex gap-2">
                        {['mp4','webm'].map(f => (
                          <button key={f} onClick={() => setClipState(prev => ({ ...prev, config: { ...prev.config, outputFormat: f as any } }))}
                            className={`chip flex-1 px-3 py-2 rounded-xl text-xs font-bold ${clipState.config.outputFormat === f ? 'chip-active' : 'text-zinc-500'}`}>{f}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={clipState.config.addFadeIn} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, addFadeIn: e.target.checked } }))} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[10px] font-bold text-zinc-400">fade in</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={clipState.config.addFadeOut} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, addFadeOut: e.target.checked } }))} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[10px] font-bold text-zinc-400">fade out</span>
                      </label>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={clipState.config.enableReverse} onChange={(e) => setClipState(prev => ({ ...prev, config: { ...prev.config, enableReverse: e.target.checked } }))} className="w-3.5 h-3.5 rounded" />
                      <span className="text-[10px] font-bold text-zinc-400">reverse playback</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button onClick={onExportClip} disabled={clipState.clips.length === 0 || clipState.isProcessing}
                    className="btn-wild px-10 py-4 rounded-2xl font-bold text-sm lowercase disabled:opacity-30 flex items-center gap-2">
                    {clipState.isProcessing ? <><i className="fa-solid fa-spinner fa-spin"></i> processing...</> : <><i className="fa-solid fa-download"></i> export clip</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        </div>
      </main>

      {/* ========== API KEY MODAL ========== */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-4 animate-in">
          <div className="glass-static p-5 md:p-8 rounded-3xl w-full max-w-lg space-y-5 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
            <div className="absolute top-0 left-0 w-full h-1 loading-bar" />
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500/20 to-pink-400/20 rounded-2xl flex items-center justify-center mx-auto border border-violet-500/20">
              <i className="fa-solid fa-plug text-violet-400 text-xl"></i>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1 lowercase gradient-text">let's get connected</h2>
              <p className="text-zinc-500 text-xs lowercase">pick a provider — free options available!</p>
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center">
              {(['POLLINATIONS','PUTER','HUGGINGFACE','PRODIA','TOGETHER','FAL','GEMINI'] as ModalProviderTab[]).map(p => {
                const status = getProviderStatus(p);
                return (
                  <button key={p} onClick={() => setModalProviderTab(p)}
                    className={`chip px-3 py-1.5 rounded-xl text-[10px] font-bold lowercase ${modalProviderTab === p ? 'chip-active' : 'text-zinc-500'}`}>
                    {p.toLowerCase()}
                    <span className={`ml-1.5 neon-dot ${status === 'connected' || status === 'free' ? 'neon-dot-green' : 'neon-dot-gray'}`}></span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {modalProviderTab === 'POLLINATIONS' && (
                <div className="glass-static rounded-2xl p-4 space-y-2" style={{ borderColor: 'rgba(132,204,22,0.15)' }}>
                  <div className="flex items-center gap-2"><span className="text-lg">🌸</span><h3 className="text-sm font-bold text-lime-400">Pollinations.ai</h3><span className="bg-lime-500/20 text-lime-400 text-[9px] font-bold px-2 py-0.5 rounded-full">FREE</span></div>
                  <p className="text-[11px] text-zinc-400">no API key needed. unlimited, free forever.</p>
                </div>
              )}
              {modalProviderTab === 'PUTER' && (
                <div className="glass-static rounded-2xl p-4 space-y-2" style={{ borderColor: 'rgba(6,182,212,0.15)' }}>
                  <div className="flex items-center gap-2"><span className="text-lg">☁️</span><h3 className="text-sm font-bold text-cyan-400">Puter.js</h3><span className="bg-cyan-500/20 text-cyan-400 text-[9px] font-bold px-2 py-0.5 rounded-full">FREE</span></div>
                  <p className="text-[11px] text-zinc-400">40+ AI models. No API key — login via Puter account (free).</p>
                  <a href="https://puter.com" target="_blank" className="text-[10px] text-cyan-400 underline">sign up at puter.com</a>
                </div>
              )}
              {modalProviderTab === 'HUGGINGFACE' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-lg">🤗</span><h3 className="text-sm font-bold text-yellow-400">HuggingFace</h3><span className="bg-yellow-500/20 text-yellow-400 text-[9px] font-bold px-2 py-0.5 rounded-full">FREE TIER</span></div>
                  <input type="password" value={tempHfKey} onChange={(e) => setTempHfKey(e.target.value)} placeholder="hf_..." className="w-full input-wild rounded-xl py-2.5 px-3 text-sm font-mono" />
                  <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-[10px] text-yellow-400 underline">get token at huggingface.co</a>
                </div>
              )}
              {modalProviderTab === 'PRODIA' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-lg">🟣</span><h3 className="text-sm font-bold text-purple-400">Prodia</h3><span className="bg-purple-500/20 text-purple-400 text-[9px] font-bold px-2 py-0.5 rounded-full">100/DAY</span></div>
                  <input type="password" value={tempProdiaKey} onChange={(e) => setTempProdiaKey(e.target.value)} placeholder="prodia key..." className="w-full input-wild rounded-xl py-2.5 px-3 text-sm font-mono" />
                  <a href="https://prodia.com" target="_blank" className="text-[10px] text-purple-400 underline">get key at prodia.com</a>
                </div>
              )}
              {modalProviderTab === 'TOGETHER' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-lg">🔵</span><h3 className="text-sm font-bold text-blue-400">Together AI</h3><span className="bg-blue-500/20 text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded-full">$5 FREE</span></div>
                  <input type="password" value={tempTogetherKey} onChange={(e) => setTempTogetherKey(e.target.value)} placeholder="together key..." className="w-full input-wild rounded-xl py-2.5 px-3 text-sm font-mono" />
                  <a href="https://api.together.xyz" target="_blank" className="text-[10px] text-blue-400 underline">get key at together.xyz</a>
                </div>
              )}
              {modalProviderTab === 'FAL' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-lg">⚡</span><h3 className="text-sm font-bold text-pink-400">FAL AI</h3><span className="bg-pink-500/20 text-pink-400 text-[9px] font-bold px-2 py-0.5 rounded-full">PAID</span></div>
                  <input type="password" value={tempFalKey} onChange={(e) => setTempFalKey(e.target.value)} placeholder="fal_..." className="w-full input-wild rounded-xl py-2.5 px-3 text-sm font-mono" />
                  <a href="https://fal.ai/dashboard" target="_blank" className="text-[10px] text-pink-400 underline">get key at fal.ai</a>
                </div>
              )}
              {modalProviderTab === 'GEMINI' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="text-lg">🔷</span><h3 className="text-sm font-bold text-blue-400">Google Gemini</h3><span className="bg-blue-500/20 text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded-full">FREE TIER</span></div>
                  <input type="password" value={tempGeminiKey} onChange={(e) => setTempGeminiKey(e.target.value)} placeholder="AIza..." className="w-full input-wild rounded-xl py-2.5 px-3 text-sm font-mono" />
                  <a href="https://aistudio.google.com/apikey" target="_blank" className="text-[10px] text-blue-400 underline">get key at aistudio.google.com</a>
                </div>
              )}
            </div>

            <button onClick={handleSaveCustomKey} disabled={isValidatingKey}
              className="w-full btn-wild disabled:opacity-50 py-3.5 rounded-2xl font-bold text-sm lowercase">
              {isValidatingKey ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>validating...</> : 'connect & start creating'}
            </button>

            {keyError && (
              <div className="glass-static rounded-xl px-4 py-3 text-red-300 text-xs" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
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
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-4 animate-in">
          <div className="glass-static p-5 md:p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
            <div className="absolute top-0 left-0 w-full h-1 loading-bar" />
            <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 w-8 h-8 glass-static rounded-full flex items-center justify-center text-zinc-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
            <h2 className="text-xl font-extrabold mb-6 lowercase gradient-text">api setup guide</h2>
            <div className="space-y-5">
              <div className="glass-static rounded-2xl p-5" style={{ borderColor: 'rgba(132,204,22,0.15)' }}>
                <h3 className="text-sm font-bold text-lime-400 mb-3 uppercase tracking-wider">FREE — No API Key</h3>
                <div className="space-y-3 text-[11px] text-zinc-400">
                  <div><strong className="text-white">1. Puter.js</strong> (recommended) — 40+ models. Sign up free at <a href="https://puter.com" target="_blank" className="text-cyan-400 underline">puter.com</a></div>
                  <div><strong className="text-white">2. Pollinations.ai</strong> — No account needed. Works right away.</div>
                </div>
              </div>
              <div className="glass-static rounded-2xl p-5" style={{ borderColor: 'rgba(234,179,8,0.15)' }}>
                <h3 className="text-sm font-bold text-yellow-400 mb-3 uppercase tracking-wider">FREE — Need Free Token</h3>
                <div className="space-y-3 text-[11px] text-zinc-400">
                  <div><strong className="text-white">3. HuggingFace</strong> — <a href="https://huggingface.co/join" target="_blank" className="text-cyan-400 underline">huggingface.co</a> &rarr; Settings &rarr; Access Tokens</div>
                  <div><strong className="text-white">4. Prodia</strong> — <a href="https://prodia.com" target="_blank" className="text-cyan-400 underline">prodia.com</a> &rarr; Dashboard &rarr; API Key. 100 free/day.</div>
                  <div><strong className="text-white">5. Together AI</strong> — <a href="https://api.together.xyz" target="_blank" className="text-cyan-400 underline">together.xyz</a>. $5 free credits.</div>
                </div>
              </div>
              <div className="glass-static rounded-2xl p-5" style={{ borderColor: 'rgba(236,72,153,0.15)' }}>
                <h3 className="text-sm font-bold text-pink-400 mb-3 uppercase tracking-wider">PAID — Premium</h3>
                <div className="space-y-3 text-[11px] text-zinc-400">
                  <div><strong className="text-white">6. FAL AI</strong> — <a href="https://fal.ai" target="_blank" className="text-cyan-400 underline">fal.ai</a>. Pay-as-you-go, ~$0.01/image. Required for video.</div>
                  <div><strong className="text-white">7. Google Gemini</strong> — <a href="https://aistudio.google.com/apikey" target="_blank" className="text-cyan-400 underline">aistudio.google.com</a>. Free tier: 15 RPM.</div>
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
