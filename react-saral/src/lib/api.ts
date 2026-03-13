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
export const slidesApi = {
  // Kept for potential backend video pipeline use
  generate: (paperId: string) => api.post(`/slides/${paperId}/generate`),
}

// Media
export interface MediaResponse {
  paper_id: string
  language: string
  audio_files: string[]
  video_path?: string
  status: string
}

export interface VoicesResponse {
  male: string[]
  female: string[]
}

export const mediaApi = {
  generateAudio: (paperId: string, language: string, voice: string = "shubh") =>
    api.post<MediaResponse>(`/media/${paperId}/generate-audio`, {
      language,
      voice,
    }),
  languages: () => api.get<Record<string, string>>("/media/languages"),
  voices: () => api.get<VoicesResponse>("/media/voices"),
  audioUrl: (paperId: string, filename: string, token: string) =>
    `${API_BASE}/api/media/${paperId}/audio/${filename}?token=${encodeURIComponent(token)}`,
}
