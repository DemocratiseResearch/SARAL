import axios, {
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios"
import { getIdToken } from "./firebase"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { "Content-Type": "application/json" },
})

// ── Request interceptor: attach Firebase ID token ────────────────────────────
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getIdToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: normalise errors ───────────────────────────────────
api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"))
    }
    return Promise.reject(error)
  }
)

export default api

// ─── Typed helpers ───────────────────────────────────────────────────────────

// Auth
export const authApi = {
  googleLogin: (idToken: string) =>
    api.post("/auth/google-login", { id_token: idToken }),
  getMe: () => api.get("/auth/me"),
}

// API keys
export const apiKeysApi = {
  save: (keys: { llm_key?: string; sarvam_key?: string }) =>
    api.post("/api-keys", keys),
  status: () =>
    api.get<{ llm_configured: boolean; sarvam_configured: boolean }>(
      "/api-keys/status"
    ),
}

// Papers
export interface PaperMetadata {
  title: string
  authors: string
  date: string
  arxiv_id?: string
}
export interface PaperResponse {
  paper_id: string
  metadata: PaperMetadata
  image_files: string[]
  status: string
}

export const papersApi = {
  scrapeArxiv: (arxiv_url: string) =>
    api.post<PaperResponse>("/papers/scrape-arxiv", { arxiv_url }),
  uploadZip: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post<PaperResponse>("/papers/upload-zip", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
  uploadPdf: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post<PaperResponse>("/papers/upload-pdf", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
  list: () => api.get<PaperResponse[]>("/papers"),
  get: (id: string) => api.get<PaperResponse>(`/papers/${id}`),
}

// Scripts
export interface SectionScript {
  id: number
  section_name: string
  content: string
  bullet_points: string[]
  assigned_image?: string
}
export interface ScriptResponse {
  paper_id: string
  sections: SectionScript[]
}

export const scriptsApi = {
  generate: (paperId: string) =>
    api.post<ScriptResponse>(`/scripts/${paperId}/generate`),
  get: (paperId: string) => api.get<ScriptResponse>(`/scripts/${paperId}`),
  update: (
    scriptId: number,
    data: {
      content?: string
      bullet_points?: string[]
      assigned_image?: string
    }
  ) => api.put<SectionScript>(`/scripts/${scriptId}`, data),
  assignImages: (paperId: string, assignments: Record<string, string>) =>
    api.post(`/scripts/${paperId}/assign-images`, assignments),
}

// Slides
export interface SlideResponse {
  paper_id: string
  pptx_path?: string
  image_paths: string[]
}

export const slidesApi = {
  generate: (paperId: string) =>
    api.post<SlideResponse>(`/slides/${paperId}/generate`),
  get: (paperId: string) => api.get<SlideResponse>(`/slides/${paperId}`),
}

// Media
export interface MediaResponse {
  paper_id: string
  language: string
  audio_files: string[]
  video_path?: string
  status: string
}

export const mediaApi = {
  generateAudio: (paperId: string, language: string, voice: string = "vidya") =>
    api.post<MediaResponse>(`/media/${paperId}/generate-audio`, {
      language,
      voice,
    }),
  generateVideo: (paperId: string, language: string) =>
    api.post<MediaResponse>(`/media/${paperId}/generate-video`, { language }),
  languages: () => api.get<Record<string, string>>("/media/languages"),
  audioUrl: (paperId: string, filename: string) =>
    `${API_BASE}/api/media/${paperId}/audio/${filename}`,
  videoUrl: (paperId: string) => `${API_BASE}/api/media/${paperId}/video`,
  downloadVideoUrl: (paperId: string) =>
    `${API_BASE}/api/media/${paperId}/download-video`,
}
