// services/api.js
import axios from "axios";
import toast from "react-hot-toast";

/**
 * API Configuration
 */
const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8000",
  timeout: 120000,
  retryAttempts: 2,
  retryDelay: 1000,
};

/**
 * Authentication Manager
 * Handles token storage and retrieval
 */
class AuthManager {
  static TOKEN_KEY = "access_token";
  static USER_KEY = "user_data";

  static getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (error) {
      console.warn("Failed to get token from localStorage:", error);
      return null;
    }
  }

  static setToken(token) {
    try {
      if (token) {
        localStorage.setItem(this.TOKEN_KEY, token);
      } else {
        localStorage.removeItem(this.TOKEN_KEY);
      }
    } catch (error) {
      console.warn("Failed to set token in localStorage:", error);
    }
  }

  static getUser() {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.warn("Failed to get user data from localStorage:", error);
      return null;
    }
  }

  static setUser(user) {
    try {
      if (user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.USER_KEY);
      }
    } catch (error) {
      console.warn("Failed to set user data in localStorage:", error);
    }
  }

  static clearAuth() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (error) {
      console.warn("Failed to clear auth data:", error);
    }
  }
}

/**
 * HTTP Client with Authentication
 */
class HttpClient {
  constructor() {
    this.client = axios.create({
      baseURL: `${API_CONFIG.baseURL}/api`,
      timeout: API_CONFIG.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Simple in-memory cache
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes

    this.setupInterceptors();
  }

  getCacheKey(config) {
    return `${config.method}:${config.url}:${JSON.stringify(config.params || {})}`;
  }

  getFromCache(key) {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() < expiry) {
      return this.cache.get(key);
    }
    // Expired, clean up
    this.cache.delete(key);
    this.cacheExpiry.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, data);
    this.cacheExpiry.set(key, Date.now() + this.cacheDuration);
  }

  setupInterceptors() {
    // Request interceptor - Add auth token and check cache
    this.client.interceptors.request.use(
      (config) => {
        const token = AuthManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Check cache for GET requests
        if (config.method === 'get' && config.useCache !== false) {
          const cacheKey = this.getCacheKey(config);
          const cachedData = this.getFromCache(cacheKey);
          if (cachedData) {
            console.log('💾 Cache hit:', config.url);
            config.adapter = () => Promise.resolve({
              data: cachedData,
              status: 200,
              statusText: 'OK (cached)',
              headers: {},
              config,
            });
          }
        }

        console.log(
          `🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      },
      (error) => {
        console.error("❌ Request Error:", error);
        return Promise.reject(error);
      },
    );

    // Response interceptor - Handle auth errors and cache responses
    this.client.interceptors.response.use(
      (response) => {
        console.log(
          `✅ API Response: ${response.config.url} (${response.status})`,
        );

        // Cache GET responses
        if (response.config.method === 'get' && response.config.useCache !== false) {
          const cacheKey = this.getCacheKey(response.config);
          this.setCache(cacheKey, response.data);
        }

        return response;
      },
      (error) => {
        // Handle authentication errors
        if (error.response?.status === 401) {
          this.handleAuthError();
          return Promise.reject(error);
        }

        // Handle other errors - but suppress expected 404s
        if (!this.shouldSuppressError(error)) {
          console.error("❌ Response Error:", error);
          const message = this.extractErrorMessage(error);
          toast.error(message);
        } else {
          console.log(`📝 Expected 404 response for: ${error.config?.url}`);
        }

        return Promise.reject(error);
      },
    );
  }

  handleAuthError() {
    console.warn("🔒 Authentication error - clearing auth data");
    AuthManager.clearAuth();

    // Only redirect if not already on login page
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  extractErrorMessage(error) {
    return (
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "An unexpected error occurred"
    );
  }

  shouldSuppressError(error) {
    const is404 = error.response?.status === 404;

    if (!is404) return false;

    const url = error.config?.url || "";

    // Suppress 404 errors for these endpoints (expected for new papers)
    const suppressible404Endpoints = ["/scripts/", "/media/", "/slides/"];

    const shouldSuppress = suppressible404Endpoints.some((endpoint) =>
      url.includes(endpoint),
    );

    if (shouldSuppress) {
      console.log(`📝 Suppressing expected 404 for: ${url}`);
    }

    return shouldSuppress;
  }

  async withRetry(requestFn, retries = API_CONFIG.retryAttempts) {
    try {
      return await requestFn();
    } catch (error) {
      const shouldRetry =
        retries > 0 &&
        error.response?.status >= 500 &&
        error.response?.status < 600;

      if (shouldRetry) {
        console.warn(`🔄 Retrying request... (${retries} attempts left)`);
        await new Promise((resolve) =>
          setTimeout(resolve, API_CONFIG.retryDelay),
        );
        return this.withRetry(requestFn, retries - 1);
      }

      throw error;
    }
  }

  // HTTP methods
  get(url, config = {}) {
    return this.client.get(url, config);
  }

  post(url, data = {}, config = {}) {
    return this.client.post(url, data, config);
  }

  put(url, data = {}, config = {}) {
    return this.client.put(url, data, config);
  }

  delete(url, config = {}) {
    return this.client.delete(url, config);
  }
}

/**
 * Authentication Service
 */
class AuthService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async googleLogin(googleToken) {
    const response = await this.http.post("/auth/google/login", {
      token: googleToken,
    });

    const { access_token, user } = response.data;

    AuthManager.setToken(access_token);
    AuthManager.setUser(user);

    return response.data;
  }

  async logout() {
    try {
      await this.http.post("/auth/logout");
    } catch (error) {
      console.warn("Logout request failed:", error);
    } finally {
      AuthManager.clearAuth();
    }
  }

  async getCurrentUser() {
    return this.http.get("/auth/me");
  }

  async verifyToken() {
    return this.http.get("/auth/verify");
  }

  isAuthenticated() {
    return !!AuthManager.getToken();
  }

  getStoredUser() {
    return AuthManager.getUser();
  }
}

/**
 * API Service Classes
 */
class ApiKeysService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async setup(keys) {
    return this.http.post("/keys/setup", keys);
  }

  async getStatus() {
    return this.http.get("/keys/status");
  }
}

class PapersService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async checkExists(paperId) {
    try {
      await this.http.get(`/papers/${paperId}/metadata`);
      return true;
    } catch {
      return false;
    }
  }

  async uploadZip(file) {
    const formData = new FormData();
    formData.append("file", file);

    return this.http.post("/papers/upload-zip", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async uploadPdf(file) {
    const formData = new FormData();
    formData.append("file", file);

    return this.http.post("/papers/upload-pdf", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async scrapeArxiv(url) {
    return this.http.post("/papers/scrape-arxiv", { arxiv_url: url });
  }

  async getMetadata(paperId) {
    return this.http.get(`/papers/${paperId}/metadata`);
  }

  async updateMetadata(paperId, metadata) {
    return this.http.put(`/papers/${paperId}/metadata`, metadata);
  }

  async downloadPdf(paperId) {
    return this.http.get(`/papers/${paperId}/download-pdf`, {
      responseType: "blob",
    });
  }

  async downloadSource(paperId) {
    return this.http.get(`/papers/${paperId}/download-source`, {
      responseType: "blob",
    });
  }
}

class ScriptsService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(paperId) {
    return this.http.withRetry(() =>
      this.http.post(`/scripts/${paperId}/generate`),
    );
  }

  async getSections(paperId) {
    try {
      return await this.http.get(`/scripts/${paperId}/sections`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log("📝 Scripts not found, returning empty sections");
        return { data: { sections: {}, paper_id: paperId } };
      }
      throw error;
    }
  }

  async updateSections(paperId, data) {
    console.log("📤 Sending update request:", { paperId, data });

    const response = await this.http.withRetry(() =>
      this.http.put(`/scripts/${paperId}/sections`, data),
    );

    console.log("📥 Update response received:", response.data);
    return response;
  }

  async refreshSections(paperId) {
    try {
      return await this.http.get(`/scripts/${paperId}/sections/refresh`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log("🔄 Refresh: Scripts not found, returning empty sections");
        return { data: { sections: {}, paper_id: paperId } };
      }
      throw error;
    }
  }

  async assignImageToSection(paperId, sectionName, imageName) {
    const params = imageName
      ? `?image_name=${encodeURIComponent(imageName)}`
      : "";

    return this.http.withRetry(() =>
      this.http.put(
        `/scripts/${paperId}/sections/${sectionName}/image${params}`,
      ),
    );
  }
}

class ImagesService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async getAvailable(paperId) {
    return this.http.get(`/images/${paperId}/available`);
  }

  getImageUrl(paperId, imageName) {
    return `${API_CONFIG.baseURL}/api/images/${paperId}/${imageName}`;
  }

  async getImage(paperId, imageName) {
    return this.http.get(`/images/${paperId}/${imageName}`, {
      responseType: "blob",
    });
  }
}

class SlidesService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(paperId) {
    return this.http.post(`/slides/${paperId}/generate`);
  }

  async getPreview(paperId) {
    return this.http.get(`/slides/${paperId}/preview`);
  }

  getSlideImageUrl(paperId, imageName) {
    return `${API_CONFIG.baseURL}/api/slides/${paperId}/${imageName}`;
  }

  async download(paperId) {
    return this.http.get(`/slides/${paperId}/download`, {
      responseType: "blob",
    });
  }

  async downloadLatexSource(paperId) {
    return this.http.get(`/slides/${paperId}/download-latex`, {
      responseType: "blob",
    });
  }
}

class MediaService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generateAudio(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-audio`, config);
  }

  async generateVideo(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-video`, config);
  }

  async downloadVideo(paperId) {
    return this.http.get(`/media/${paperId}/download-video`, {
      responseType: "blob",
    });
  }

  async downloadAudio(paperId, filename) {
    return this.http.get(`/media/${paperId}/download-audio/${filename}`, {
      responseType: "blob",
    });
  }

  async getStatus(paperId) {
    try {
      return await this.http.get(`/media/${paperId}/status`);
    } catch (error) {
      if (error.response?.status === 404) {
        // Return a default structure for media that doesn't exist yet
        return {
          data: {
            audio_files: [],
            video_path: null,
            paper_id: paperId,
          },
        };
      }
      throw error;
    }
  }

  getAudioStreamUrl(paperId, filename) {
    return `${API_CONFIG.baseURL}/api/media/${paperId}/stream-audio/${filename}`;
  }

  getVideoStreamUrl(paperId) {
    return `${API_CONFIG.baseURL}/api/media/${paperId}/stream-video`;
  }
  async generateManimAnimation(paperId, config = {}) {
    return this.http.post(
      `/manim/generate/${paperId}`,
      {
        paper_id: paperId,
        audio_file: config.audioFile || null,
        tts_provider: config.ttsProvider || "kokoro",
        tts_gender: config.ttsGender || "female",
        tts_language: config.ttsLanguage || "english",
      },
      {
        timeout: 600000, // 10 minutes timeout for Manim generation
      },
    );
  }

  async downloadManimVideo(paperId) {
    return this.http.get(`/manim/download/${paperId}`, {
      responseType: "blob",
    });
  }

  async getManimCode(paperId) {
    return this.http.get(`/manim/code/${paperId}`);
  }

  async getManimNarration(paperId) {
    return this.http.get(`/manim/narration/${paperId}`);
  }

  getManimVideoStreamUrl(paperId) {
    return `${API_CONFIG.baseURL}/api/manim/download/${paperId}`;
  }

  // Whiteboard Animation APIs
  async previewWhiteboardScript(paperId, targetDuration = null, ttsProvider = "kokoro", ttsGender = "female", ttsLanguage = "english") {
    return this.http.post(`/whiteboard/preview/${paperId}`, {
      paper_id: paperId,
      target_duration: targetDuration,
      tts_provider: ttsProvider,
      tts_gender: ttsGender,
      tts_language: ttsLanguage,
    });
  }

  async generateWhiteboardVideo(paperId, imageModel = "pollinations", scenesCount = null, ttsProvider = "kokoro", ttsGender = "female", ttsLanguage = "english") {
    return this.http.post(
      `/whiteboard/generate/${paperId}`,
      {
        image_model: imageModel,
        scenes_count: scenesCount,
        tts_provider: ttsProvider,
        tts_gender: ttsGender,
        tts_language: ttsLanguage,
      },
      {
        timeout: 600000, // 10 minutes timeout for whiteboard generation
      },
    );
  }

  async getWhiteboardStatus(paperId) {
    return this.http.get(`/whiteboard/status/${paperId}`);
  }

  async downloadWhiteboardVideo(paperId) {
    return this.http.get(`/whiteboard/download/${paperId}`, {
      responseType: "blob",
    });
  }

  getWhiteboardVideoStreamUrl(paperId) {
    return `${API_CONFIG.baseURL}/api/whiteboard/download/${paperId}`;
  }

  async deleteWhiteboardVideo(paperId) {
    return this.http.delete(`/whiteboard/${paperId}`);
  }

  // SARAS Chat APIs
  async chatWithSaras(paperId, question, context = null, history = []) {
    return this.http.post(`/saras/chat`, {
      paper_id: paperId,
      question: question,
      context: context,
      history: history,
    });
  }

  async getPaperSummary(paperId) {
    return this.http.get(`/saras/summary/${paperId}`);
  }

  async analyzePaper(paperId) {
    return this.http.get(`/saras/analyze/${paperId}`);
  }

  async getAnnotatedPdfInfo(paperId) {
    return this.http.get(`/saras/annotated-pdf/${paperId}`);
  }

  async downloadAnnotatedPdf(paperId) {
    return this.http.get(`/saras/download-annotated/${paperId}`, {
      responseType: "blob",
    });
  }

  async searchInPaper(paperId, searchQuery) {
    return this.http.post(`/saras/search`, {
      paper_id: paperId,
      search_query: searchQuery,
    });
  }
}

/**
 * Main API Service Factory
 */
class ApiService {
  constructor() {
    this.httpClient = new HttpClient();

    // Initialize service modules
    this.auth = new AuthService(this.httpClient);
    this.apiKeys = new ApiKeysService(this.httpClient);
    this.papers = new PapersService(this.httpClient);
    this.scripts = new ScriptsService(this.httpClient);
    this.images = new ImagesService(this.httpClient);
    this.slides = new SlidesService(this.httpClient);
    this.media = new MediaService(this.httpClient);
  }

  get interceptors() {
    return this.httpClient.client.interceptors;
  }

  get(url, config) {
    return this.httpClient.client.get(url, config);
  }

  post(url, data, config) {
    return this.httpClient.client.post(url, data, config);
  }

  put(url, data, config) {
    return this.httpClient.client.put(url, data, config);
  }

  delete(url, config) {
    return this.httpClient.client.delete(url, config);
  }

  patch(url, data, config) {
    return this.httpClient.client.patch(url, data, config);
  }

  // Utility method to get base URL
  getBaseURL() {
    return API_CONFIG.baseURL;
  }

  // Legacy compatibility methods
  setupApiKeys = (keys) => this.apiKeys.setup(keys);
  getApiKeysStatus = () => this.apiKeys.getStatus();

  checkPaperExists = (paperId) => this.papers.checkExists(paperId);
  uploadZip = (file) => this.papers.uploadZip(file);
  uploadPdf = (file) => this.papers.uploadPdf(file);
  scrapeArxiv = (url) => this.papers.scrapeArxiv(url);
  getPaperMetadata = (paperId) => this.papers.getMetadata(paperId);
  updatePaperMetadata = (paperId, metadata) =>
    this.papers.updateMetadata(paperId, metadata);
  downloadPaperPdf = (paperId) => this.papers.downloadPdf(paperId);
  downloadPaperSource = (paperId) => this.papers.downloadSource(paperId);

  generateScript = (paperId) => this.scripts.generate(paperId);
  getScriptsWithBullets = (paperId) => this.scripts.getSections(paperId);
  updateScriptsWithBullets = (paperId, data) =>
    this.scripts.updateSections(paperId, data);
  refreshScriptsData = (paperId) => this.scripts.refreshSections(paperId);
  assignImageToSection = (paperId, sectionName, imageName) =>
    this.scripts.assignImageToSection(paperId, sectionName, imageName);

  getAvailableImages = (paperId) => this.images.getAvailable(paperId);
  getImageUrl = (paperId, imageName) =>
    this.images.getImageUrl(paperId, imageName);
  getImage = (paperId, imageName) => this.images.getImage(paperId, imageName);

  generateSlides = (paperId) => this.slides.generate(paperId);
  getSlidePreview = (paperId) => this.slides.getPreview(paperId);
  getSlideImageUrl = (paperId, imageName) =>
    this.slides.getSlideImageUrl(paperId, imageName);
  downloadSlides = (paperId) => this.slides.download(paperId);
  downloadLatexSource = (paperId) => this.slides.downloadLatexSource(paperId);

  generateAudio = (paperId, config) =>
    this.media.generateAudio(paperId, config);
  generateVideo = (paperId, config) =>
    this.media.generateVideo(paperId, config);
  downloadVideo = (paperId) => this.media.downloadVideo(paperId);
  downloadAudio = (paperId, filename) =>
    this.media.downloadAudio(paperId, filename);
  getMediaStatus = (paperId) => this.media.getStatus(paperId);
  getAudioStreamUrl = (paperId, filename) =>
    this.media.getAudioStreamUrl(paperId, filename);
  getVideoStreamUrl = (paperId) => this.media.getVideoStreamUrl(paperId);

  generateManimAnimation = (paperId, config) =>
    this.media.generateManimAnimation(paperId, config);
  downloadManimVideo = (paperId) => this.media.downloadManimVideo(paperId);
  getManimCode = (paperId) => this.media.getManimCode(paperId);
  getManimNarration = (paperId) => this.media.getManimNarration(paperId);
  getManimVideoStreamUrl = (paperId) =>
    this.media.getManimVideoStreamUrl(paperId);

  // Whiteboard Animation APIs
  previewWhiteboardScript = (paperId, targetDuration, ttsProvider, ttsGender, ttsLanguage) =>
    this.media.previewWhiteboardScript(paperId, targetDuration, ttsProvider, ttsGender, ttsLanguage);
  generateWhiteboardVideo = (paperId, imageModel, scenesCount, ttsProvider, ttsGender, ttsLanguage) =>
    this.media.generateWhiteboardVideo(paperId, imageModel, scenesCount, ttsProvider, ttsGender, ttsLanguage);
  getWhiteboardStatus = (paperId) => this.media.getWhiteboardStatus(paperId);
  downloadWhiteboardVideo = (paperId) => this.media.downloadWhiteboardVideo(paperId);
  getWhiteboardVideoStreamUrl = (paperId) =>
    this.media.getWhiteboardVideoStreamUrl(paperId);
  deleteWhiteboardVideo = (paperId) => this.media.deleteWhiteboardVideo(paperId);

  // SARAS Chat APIs
  chatWithSaras = (paperId, question, context, history) =>
    this.media.chatWithSaras(paperId, question, context, history);
  getPaperSummary = (paperId) => this.media.getPaperSummary(paperId);
  analyzePaper = (paperId) => this.media.analyzePaper(paperId);
  getAnnotatedPdfInfo = (paperId) => this.media.getAnnotatedPdfInfo(paperId);
  downloadAnnotatedPdf = (paperId) => this.media.downloadAnnotatedPdf(paperId);
  searchInPaper = (paperId, searchQuery) =>
    this.media.searchInPaper(paperId, searchQuery);

  // Poster Generation APIs
  uploadAndGeneratePoster = (formData) =>
    this.post('/posters/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  generatePosterFromPaper = (data) => this.post('/posters/generate-from-paper', data);
  getPosterStatus = (posterId) => this.get(`/posters/status/${posterId}`);
  downloadPosterHTML = (posterId) =>
    this.get(`/posters/download/${posterId}/html`, { responseType: 'text' });
  listUserPosters = () => this.get('/posters/list');
  deletePoster = (posterId) => this.delete(`/posters/${posterId}`);
}

// Create and export singleton instance
export const apiService = new ApiService();

// Export individual services for direct access
export const { apiKeys, papers, scripts, images, slides, media } = apiService;

// Export HTTP client for custom requests
export const httpClient = apiService.httpClient;
export { AuthManager };
// Default export for backward compatibility
export default apiService;
