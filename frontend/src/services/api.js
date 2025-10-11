// src/services/api.js (updated)
import axios from 'axios';
import toast from 'react-hot-toast';

/**
 * API Configuration
 */
const API_CONFIG = {
  baseURL: process.env.NODE_ENV === 'production' 
  ? process.env.REACT_APP_API_URL 
  : 'http://localhost:8000',
  timeout: 200000,
  retryAttempts: 2,
  retryDelay: 1000,
};

/**
 * Authentication Manager
 * Handles token storage and retrieval
 */
class AuthManager {
  static TOKEN_KEY = 'access_token';
  static USER_KEY = 'user_data';

  static getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (error) {
      console.warn('Failed to get token from localStorage:', error);
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
      console.warn('Failed to set token in localStorage:', error);
    }
  }

  static getUser() {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.warn('Failed to get user data from localStorage:', error);
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
      console.warn('Failed to set user data in localStorage:', error);
    }
  }

  static clearAuth() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (error) {
      console.warn('Failed to clear auth data:', error);
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
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor - Add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = AuthManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
      );

    // Response interceptor - Handle auth errors
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.config.url} (${response.status})`);
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
          console.error('❌ Response Error:', error);
          const message = this.extractErrorMessage(error);
          toast.error(message);
        } else {
          console.log(`📝 Expected 404 response for: ${error.config?.url}`);
        }
        
        return Promise.reject(error);
      }
      );
  }

  handleAuthError() {
    console.warn('🔒 Authentication error - clearing auth data');
    AuthManager.clearAuth();
    
    // Only redirect if not already on login page
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  extractErrorMessage(error) {
    return error.response?.data?.detail || 
    error.response?.data?.message || 
    error.message || 
    'An unexpected error occurred';
  }

  shouldSuppressError(error) {
    const is404 = error.response?.status === 404;
    
    if (!is404) return false;
    
    const url = error.config?.url || '';
    
    // Suppress 404 errors for these endpoints (expected for new papers)
    const suppressible404Endpoints = [
      '/scripts/',
      '/media/',
      '/slides/'
    ];
    
    const shouldSuppress = suppressible404Endpoints.some(endpoint => url.includes(endpoint));
    
    if (shouldSuppress) {
      console.log(`📝 Suppressing expected 404 for: ${url}`);
    }
    
    return shouldSuppress;
  }

  async withRetry(requestFn, retries = API_CONFIG.retryAttempts) {
    try {
      return await requestFn();
    } catch (error) {
      const shouldRetry = retries > 0 && 
      error.response?.status >= 500 && 
      error.response?.status < 600;
      
      if (shouldRetry) {
        console.warn(`🔄 Retrying request... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
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
    const response = await this.http.post('/auth/google/login', { 
      token: googleToken 
    });
    
    const { access_token, user } = response.data;
    
    AuthManager.setToken(access_token);
    AuthManager.setUser(user);
    
    return response.data;
  }

  async logout() {
    try {
      await this.http.post('/auth/logout');
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      AuthManager.clearAuth();
    }
  }

  async getCurrentUser() {
    return this.http.get('/auth/me');
  }

  async verifyToken() {
    return this.http.get('/auth/verify');
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
    return this.http.post('/keys/setup', keys);
  }

  async getStatus() {
    return this.http.get('/keys/status');
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
    formData.append('file', file);
    
    return this.http.post('/papers/upload-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  async uploadPdf(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post('/papers/upload-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  async uploadPdfToVideo(file) {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post('/papertovideo/upload_pdf_to_video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5 * 60 * 1000 
    });
  }

  async uploadZipToVideo(file) {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post('/papertovideo/upload_latex_to_video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5 * 60 * 1000 
    });
  }

  async scrapeArxiv(url) {
    return this.http.post('/papers/scrape-arxiv', { arxiv_url: url });
  }

  async scrapeArxivToVideo(url) {
    const formData = new FormData();
    formData.append("arxiv_url", url);
    return this.http.post('/papertovideo/upload_arxiv_to_video', formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  }
  
  async getMetadata(paperId) {
    return this.http.get(`/papers/${paperId}/metadata`);
  }

  async updateMetadata(paperId, metadata) {
    return this.http.put(`/papers/${paperId}/metadata`, metadata);
  }

  async downloadPdf(paperId) {
    return this.http.get(`/papers/${paperId}/download-pdf`, {
      responseType: 'blob'
    });
  }

  async downloadSource(paperId) {
    return this.http.get(`/papers/${paperId}/download-source`, {
      responseType: 'blob'
    });
  }
}

class ScriptsService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(paperId) {
    return this.http.withRetry(() => 
      this.http.post(`/scripts/${paperId}/generate`)
      );
  }

  async getSections(paperId) {
    try {
      return await this.http.get(`/scripts/${paperId}/sections`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('📝 Scripts not found, returning empty sections');
        return { data: { sections: {}, paper_id: paperId } };
      }
      throw error;
    }
  }

  async updateSections(paperId, data) {
    console.log('📤 Sending update request:', { paperId, data });
    
    const response = await this.http.withRetry(() => 
      this.http.put(`/scripts/${paperId}/sections`, data)
      );
    
    console.log('📥 Update response received:', response.data);
    return response;
  }

  async refreshSections(paperId) {
    try {
      return await this.http.get(`/scripts/${paperId}/sections/refresh`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('🔄 Refresh: Scripts not found, returning empty sections');
        return { data: { sections: {}, paper_id: paperId } };
      }
      throw error;
    }
  }

  async assignImageToSection(paperId, sectionName, imageName) {
    const params = imageName ? `?image_name=${encodeURIComponent(imageName)}` : '';
    
    return this.http.withRetry(() => 
      this.http.put(`/scripts/${paperId}/sections/${sectionName}/image${params}`)
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
      responseType: 'blob'
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
      responseType: 'blob'
    });
  }

  async downloadLatexSource(paperId) {
    return this.http.get(`/slides/${paperId}/download-latex`, {
      responseType: 'blob'
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

  async generateBhashiniAudio(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-audio-bhashini`, config);
  }

  async generateVideo(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-video`, config);
  }

  async downloadVideo(paperId) {
    return this.http.get(`/media/${paperId}/download-video`, {
      responseType: 'blob'
    });
  }

  async downloadPresentationVideo(paperId) {
    return this.http.get(`/papertovideo/${paperId}/download-video`, {
      responseType: 'blob'
    });
  }

  async downloadPresentationSlides(paperId) {
    return this.http.get(`/papertovideo/${paperId}/download-slides`, {
      responseType: 'blob'
    });
  }

  async getPresentationMetaInfo(paperId){
    return this.http.get(`/papertovideo/${paperId}/metadata`, {
      responseType: 'json'
    });
  }

  async downloadAudio(paperId, filename) {
    return this.http.get(`/media/${paperId}/download-audio/${filename}`, {
      responseType: 'blob'
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
            paper_id: paperId 
          } 
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

  getPresentationVideoStreamUrl(paperId) {
    return `${API_CONFIG.baseURL}/api/papertovideo/${paperId}/stream-video`;
  }
}

class YoutubeService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async googleUpload(payload) {
    return this.http.post(`/youtube_upload/google_upload`, payload);
  }
}

class ChatService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  uploadPdfForChat(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post('/chat/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  askQuestion(paperId, question, chatHistory) {
    return this.http.post(`/chat/${paperId}/ask`, {
      question: question,
      chat_history: chatHistory,
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
    this.youtube = new YoutubeService(this.httpClient);
    this.chat = new ChatService(this.httpClient);
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

  // Legacy compatibility methods
  setupApiKeys = (keys) => this.apiKeys.setup(keys);
  getApiKeysStatus = () => this.apiKeys.getStatus();
  
  checkPaperExists = (paperId) => this.papers.checkExists(paperId);
  uploadZip = (file) => this.papers.uploadZip(file);
  uploadPdf = (file) => this.papers.uploadPdf(file);
  uploadPdfToVideo = (file) => this.papers.uploadPdfToVideo(file);
  uploadZipToVideo = (file) => this.papers.uploadZipToVideo(file);
  scrapeArxiv = (url) => this.papers.scrapeArxiv(url);
  scrapeArxivToVideo = (url) => this.papers.scrapeArxivToVideo(url);
  getPaperMetadata = (paperId) => this.papers.getMetadata(paperId);
  updatePaperMetadata = (paperId, metadata) => this.papers.updateMetadata(paperId, metadata);
  downloadPaperPdf = (paperId) => this.papers.downloadPdf(paperId);
  downloadPaperSource = (paperId) => this.papers.downloadSource(paperId);
  
  generateScript = (paperId) => this.scripts.generate(paperId);
  getScriptsWithBullets = (paperId) => this.scripts.getSections(paperId);
  updateScriptsWithBullets = (paperId, data) => this.scripts.updateSections(paperId, data);
  refreshScriptsData = (paperId) => this.scripts.refreshSections(paperId);
  assignImageToSection = (paperId, sectionName, imageName) => 
  this.scripts.assignImageToSection(paperId, sectionName, imageName);
  
  getAvailableImages = (paperId) => this.images.getAvailable(paperId);
  getImageUrl = (paperId, imageName) => this.images.getImageUrl(paperId, imageName);
  getImage = (paperId, imageName) => this.images.getImage(paperId, imageName);
  
  generateSlides = (paperId) => this.slides.generate(paperId);
  getSlidePreview = (paperId) => this.slides.getPreview(paperId);
  getSlideImageUrl = (paperId, imageName) => this.slides.getSlideImageUrl(paperId, imageName);
  downloadSlides = (paperId) => this.slides.download(paperId);
  downloadLatexSource = (paperId) => this.slides.downloadLatexSource(paperId);
  
  generateAudio = (paperId, config) => this.media.generateAudio(paperId, config);
  generateBhashiniAudio = (paperId, config) => this.media.generateBhashiniAudio(paperId, config);
  generateVideo = (paperId, config) => this.media.generateVideo(paperId, config);
  downloadVideo = (paperId) => this.media.downloadVideo(paperId);
  downloadPresentationVideo = (paperId) => this.media.downloadPresentationVideo(paperId);
  downloadPresentationSlides = (paperId) => this.media.downloadPresentationSlides(paperId);
  getPresentationMetaInfo = paperId => this.media.getPresentationMetaInfo(paperId)
  downloadAudio = (paperId, filename) => this.media.downloadAudio(paperId, filename);
  getMediaStatus = (paperId) => this.media.getStatus(paperId);
  getAudioStreamUrl = (paperId, filename) => this.media.getAudioStreamUrl(paperId, filename);
  getVideoStreamUrl = (paperId) => this.media.getVideoStreamUrl(paperId);
  getPresentationVideoStreamUrl = (paperId) => this.media.getPresentationVideoStreamUrl(paperId);
  googleUpload = (code, paper_id) => this.youtube.googleUpload(code, paper_id)
  uploadPdfForChat = (file) => this.chat.uploadPdfForChat(file);
  askQuestion = (paperId, question, chatHistory) => this.chat.askQuestion(paperId, question, chatHistory);
}

// Create and export singleton instance
export const apiService = new ApiService();

// Export individual services for direct access
export const {
  apiKeys,
  papers,
  scripts,
  images,
  slides,
  media,
  youtube,
  chat
} = apiService;

// Export HTTP client for custom requests
export const httpClient = apiService.httpClient;
export { AuthManager };
// Default export for backward compatibility
export default apiService;
