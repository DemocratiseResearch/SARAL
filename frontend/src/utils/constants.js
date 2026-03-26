export const API_ENDPOINTS = {
  AUTH: '/auth',
  PAPERS: '/papers',
  SCRIPTS: '/scripts',
  SLIDES: '/slides',
  MEDIA: '/media',
  IMAGES: '/images',
  API_KEYS: '/api-keys'
};

export const WORKFLOW_STEPS = {
  API_SETUP: 1,
  PAPER_PROCESSING: 2,
  SCRIPT_GENERATION: 3,
  SLIDE_CREATION: 4,
  MEDIA_GENERATION: 5,
  RESULTS: 6
};

export const STEP_ROUTES = {
  [WORKFLOW_STEPS.API_SETUP]: '/api-setup',
  [WORKFLOW_STEPS.PAPER_PROCESSING]: '/paper-processing',
  [WORKFLOW_STEPS.SCRIPT_GENERATION]: '/script-generation',
  [WORKFLOW_STEPS.SLIDE_CREATION]: '/slide-creation',
  [WORKFLOW_STEPS.MEDIA_GENERATION]: '/media-generation',
  [WORKFLOW_STEPS.RESULTS]: '/results'
};

export const FILE_TYPES = {
  PDF: 'pdf',
  ZIP: 'zip',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio'
};

export const SUPPORTED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
export const SUPPORTED_VIDEO_TYPES = ['mp4', 'webm', 'ogg', 'avi', 'mov'];
export const SUPPORTED_AUDIO_TYPES = ['mp3', 'wav', 'ogg', 'aac', 'm4a'];

export const VOICE_SETTINGS = {
  LANGUAGES: [
    { value: 'english', label: 'English' },
    { value: 'hindi', label: 'Hindi' }
  ],
  VOICES: [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' }
  ],
  SPEED_RANGE: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 }
};

export const THEME_CONFIG = {
  STORAGE_KEY: 'saral-theme',
  DEFAULT_THEME: 'system'
};

export const LOCAL_STORAGE_KEYS = {
  THEME: 'saral-theme',
  API_KEYS: 'saral-api-keys',
  WORKFLOW_STATE: 'saral-workflow',
  USER_PREFERENCES: 'saral-preferences'
};

export const STATUS_TYPES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error'
};

export const PROJECT_STATUS = {
  DRAFT: 'draft',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

export const ANIMATION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 }
  },
  slideUp: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.15 }
  },
  slideIn: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.15 }
  }
};
export const TTS_VOICES = {
  ENGLISH: {
    vidya: 'Female',
    karun: 'Male'
  },
  HINDI: {
    vidya: 'Female',
    karun: 'Male'
  },
  BENGALI: {
    vidya: 'Female',
    karun: 'Male'
  },
  GUJARATI: {
    vidya: 'Female',
    karun: 'Male'
  },
  KANNADA: {
    vidya: 'Female',
    karun: 'Male'
  },
  MALAYALAM: {
    vidya: 'Female',
    karun: 'Male'
  },
  MARATHI: {
    vidya: 'Female',
    karun: 'Male'
  },
  ODIA: {
    vidya: 'Female',
    karun: 'Male'
  },
  PUNJABI: {
    vidya: 'Female',
    karun: 'Male'
  },
  TAMIL: {
    vidya: 'Female',
    karun: 'Male'
  },
  TELUGU: {
    vidya: 'Female',
    karun: 'Male'
  },
  URDU: {
    vidya: 'Female',
  },
  SANSKRIT: {
    vidya: 'Female',
  },
  SANTALI: {
    vidya: 'Female',
  },
  MANIPURI: {
    vidya: 'Female',
  },
  ASSAMESE: {
    vidya: 'Female',
  },
  BODO: {
    vidya: 'Female',
  },
  DOGRI:{
    vidya: 'Female',
  },
  MAITHILI:{
    vidya: 'Female',
  }
};

