// Types matching the Go backend JSON responses exactly

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// --- Auth ---

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  name: string;
  picture: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// --- Papers ---

export interface Paper {
  id: string;
  title: string;
  authors: string;
  year?: string;
  created_at: string;
  updated_at: string;
}

export interface PapersListResponse {
  papers: Paper[];
  count: number;
}

// --- Upload ---

export interface UploadResponse {
  run_id: string;
  paper_id: string;
  user_id: string;
  stream_url: string;
  status_url: string;
}

// --- Pipeline Run ---

export interface StepStatus {
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface Run {
  id: string;
  paper_id: string;
  user_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  current_step: string;
  error_message: string;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  steps?: StepStatus[];
}

// --- SSE ---

export interface SSEEvent {
  /** step_id UUID from the server's SSE `id:` wire field — used for Last-Event-ID replay */
  id?: string;
  step: string;
  status: "processing" | "completed" | "failed";
  message: string;
  /**
   * Optional structured payload on completed events. Values may be of any
   * primitive JSON type depending on the step (metadata_extract carries
   * string title/authors; beamer_compile carries a numeric compile_version).
   * Consumers should narrow per-step.
   */
  data?: Record<string, unknown>;
}

// --- Extracted Document ---

export interface ExtractedDocument {
  text: string;
  num_pages: number;
  image_paths: string[];
  text_gcs_path: string;
  metadata: {
    title: string;
    authors: string[];
    page_count: number;
  };
}

export interface ExtractedImage {
  index: number;
  url: string;
  gcs_path: string;
}

export interface ExtractedImagesResponse {
  images: ExtractedImage[];
  expires_in: number;
}

export interface ScriptConfirmBody {
  output_format?: string;
  ppt_template?: string;
  voice_gender?: string;
  language?: string;
  slide_language?: string;
}

// --- Script ---

export interface Section {
  id: string;
  title: string;
  summary: string;
  narration: string;
  bullets: string[];
}

export type AudienceLevel = "novice" | "intermediate" | "expert";
export type Tone = "formal" | "conversational";

export interface VideoConfig {
  audience_level: AudienceLevel;
  tone: Tone;
  language?: string; // narration/audio language (default "english")
  slideLanguage?: string; // slide text language (only set when != language)
  pptTemplate?: string; // Beamer theme key; "" = backend default
}

export interface Script {
  run_id: string;
  audience_level?: AudienceLevel;
  tone?: Tone;
  title_intro?: string;
  title?: string;
  authors?: string; // API returns a plain string, e.g. "Author One, Author Two et al."
  date?: string;
  language?: string;
  voice_gender?: string;
  image_assignments?: Record<string, string>;
  sections: Section[];
}

// --- Slides ---

export interface SlidesResponse {
  slides_pdf_url: string;
  expires_in: number;
}

// --- Audio ---

export interface AudioSlide {
  frame_index: number;
  text?: string;
  audio_paths: string[];
}

export interface AudioManifest {
  run_id: string;
  slides: AudioSlide[];
}

// --- Download ---
// /api/papertovideo/:run_id/download streams the MP4 directly (no JSON).
// /api/papertovideo/:run_id/video  serves the MP4 with Range support (no JSON).
// Use triggerVideoDownload() and getVideoStreamBlobUrl() in api.ts.
export interface DownloadResponse {
  /** Ephemeral blob: URL created by the FE for playback/download */
  url: string;
}

// --- Paper → Slides (PPT/PDF-only, papertoslides pipeline) ---

export interface PaperToSlidesStartResponse {
  run_id: string;
  paper_id?: string;
  stream_url: string;
  status_url: string;
}

export interface PaperToSlidesConfirmBody {
  output_format?: "beamer_pdf" | "ppt";
  ppt_template?: string;
  language?: string;
}

export interface PaperToSlidesDeckResponse {
  slides_pdf_url?: string;
  slides_pptx_url?: string;
  expires_in?: number;
  // Echoed back when the caller passed ?compile_version=. Helps the frontend
  // confirm it received the version it asked for.
  compile_version?: string;
}

// --- Pipeline Retry ---

export interface RetryRunResponse {
  ok: boolean;
  resumed: boolean;
  message: string;
}

// --- Poster Pipeline ---

export interface PosterStartResponse {
  run_id: string;
  paper_id: string;
  stream_url: string;
  status_url: string;
}

// /api/papertoposter/:run_id/download now streams a ZIP directly — no JSON body.
// Use triggerPosterDownload() in api.ts instead.
export interface PosterDownloadResponse {
  /** Ephemeral blob: URL created by the FE for download */
  download_url: string;
}

// --- Audio Slide Presigned ---

export interface AudioSlidePresigned {
  slides: Array<{
    frame_index: number;
    audio_paths: string[];
  }>;
  expires_in?: number;
}

// --- Languages ---

export interface BackendLanguage {
  code: string;
  name: string;
  tts: string;
}

// --- Podcast Pipeline ---

export interface PodcastStartBody {
  paper_id: string;
  language: string;
  host_a_gender: "female" | "male";
  host_b_gender: "female" | "male";
  render_video: boolean;
}

export interface PodcastStartResponse {
  run_id: string;
  paper_id: string;
  stream_url: string;
  status_url: string;
}

export interface PodcastRunStatus {
  run_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  current_step: string;
  error_message?: string;
}

export interface PodcastDialogueTurn {
  speaker: "host_a" | "host_b";
  text: string;
}

export interface PodcastDialogueResponse {
  dialogue: PodcastDialogueTurn[];
}

export interface PodcastAudioResponse {
  url: string;
  expires_in: number;
}

export interface PodcastVideoResponse {
  url: string;
  expires_in: number;
}

export interface PodcastDownloadUrls {
  audio: { url: string; expires_in: number };
  video?: { url: string; expires_in: number };
}

export interface PodcastSpeakers {
  host_a: { gender: "female" | "male"; voice?: string };
  host_b: { gender: "female" | "male"; voice?: string };
}

export interface PodcastAnalysis {
  total_turns: number;
  word_count?: number;
  estimated_duration_seconds?: number;
}

export interface PodcastScript {
  run_id: string;
  title: string;
  language: string;
  render_video: boolean;
  speakers: PodcastSpeakers;
  analysis: PodcastAnalysis;
  turns: PodcastDialogueTurn[];
}

export interface PodcastStatusResponse {
  status: string;
  current_step: string;
  error?: string;
  metadata?: {
    paper_title?: string;
    paper_authors?: string;
    dialogue_turn_count?: number;
    total_duration_seconds?: number;
  };
}

// --- Social Sharing ---

export interface SocialStatus {
  youtube: boolean;
  linkedin: boolean;
  twitter: boolean;
}

export interface ShareResponse {
  platform: string;
  url: string;
  id: string;
}

export interface YouTubeAuthResponse {
  auth_url: string;
}

export interface LinkedInAuthResponse {
  auth_url: string;
}

// --- Reel Pipeline ---

export type ReelSpeaker = "Person1" | "Person2";

export interface ReelTurn {
  speaker: ReelSpeaker;
  text: string;
}

export interface ReelAnalysis {
  turn_count: number;
  total_words: number;
  average_words_per_turn: number;
  estimated_duration_seconds: number;
  speaker_turn_counts: Record<string, number>;
  speaker_word_counts: Record<string, number>;
}

export interface ReelAvatarSelection {
  pair: string;
  person1?: string;
  person2?: string;
  person1_url?: string;
  person2_url?: string;
}

export interface ReelScript {
  run_id: string;
  title?: string;
  language?: string;
  avatars?: ReelAvatarSelection | null;
  analysis?: ReelAnalysis;
  turns: ReelTurn[];
}

export interface ReelStartBody {
  paper_id: string;
  language?: string;
}

export interface ReelStartResponse {
  run_id: string;
  paper_id: string;
  user_id: string;
  stream_url: string;
  status_url: string;
}

export interface ReelAvatarPair {
  id: string;
  name: string;
  description?: string;
  person1: string;
  person2: string;
  person1_url: string;
  person2_url: string;
}

export interface ReelAvatarCatalog {
  pairs: ReelAvatarPair[];
  expires_in: number;
}

export interface ReelAvatarSelectResponse {
  pair: string;
  person1: string;
  person2: string;
  person1_url: string;
  person2_url: string;
}

export interface ReelFinalizeResponse {
  run_id: string;
  next_step: string;
  stream_url: string;
}

export interface ReelDownloadResponse {
  url: string;
  expires_in: number;
}

// --- Business Brief ---

export interface BusinessBrief {
  id: string;
  paper_id: string;
  user_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  sections: Record<string, string>; // 8 fixed keys from the backend
  model_version: "v1" | "v2";
  json_gcs_path?: string;
  pdf_gcs_path?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessBriefTriggerResponse {
  id: string;
  paper_id: string;
  status: string;
  message: string;
}

export interface BusinessBriefPDFResponse {
  url: string;
}

// --- Social Drafts (LinkedIn / X/Twitter) ---

export interface LinkedInDraft {
  title: string;
  caption: string;
}

export interface TwitterImage {
  index: number;
  url: string;
  gcs_path: string;
}

export interface TwitterThread {
  title: string;
  tweets: string[];
  tweet_count: number;
}

export interface TwitterDraft {
  thread: TwitterThread;
  images: TwitterImage[];
  expires_in: number;
}
