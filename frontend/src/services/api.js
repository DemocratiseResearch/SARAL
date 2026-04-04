import axios from "axios";
import Analytics from "../lib/analytics";

const API_CONFIG = {
  baseURL: import.meta.env.VITE_APP_API_URL || "http://localhost:8000",
  timeout: 30*60*1000,
  retryAttempts: 2,
  retryDelay: 1000,
};

const PODCAST_HOST =
  import.meta.env.VITE_APP_API_URL || "http://localhost:8000";
const REEL_HOST = import.meta.env.VITE_APP_API_URL || "http://localhost:8000";
// const POSTER_API_BASE =
//   "https://summarizesaral.democratiseresearch.in/api/api/";

const POSTER_API_BASE = "http://localhost:8000/api"

class AuthManager {
  static TOKEN_KEY = "access_token";
  static USER_KEY = "user_data";

  static getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (error) {
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
      console.warn("Failed to set token:", error);
    }
  }

  static getUser() {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
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
      console.warn("Failed to set user:", error);
    }
  }

  static clearAuth() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (error) {
      console.warn("Failed to clear auth:", error);
    }
  }
}

class HttpClient {
  constructor() {
    this.client = axios.create({
      baseURL: `${API_CONFIG.baseURL}/api`,
      timeout: API_CONFIG.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  // ------------ ERROR TRACKER ------------
  logApiError(error) {
    try {
      const config = error.config || {};
      const url = config.baseURL
        ? `${config.baseURL}${config.url || ""}`
        : config.url;

      const status = error.response?.status || null;
      const method = (config.method || "get").toUpperCase();
      const data = error.response?.data;

      let backendMessage = null;
      if (typeof data === "string") {
        backendMessage = data.slice(0, 500);
      } else if (data) {
        backendMessage = JSON.stringify(data).slice(0, 500);
      }

      Analytics.track("api_error", {
        url,
        method,
        status,
        message: error.message,
        backend_message: backendMessage,
        isNetworkError: !error.response,
        isTimeout: error.code === "ECONNABORTED",
        path: window.location.pathname,
      });
    } catch (e) {
      console.warn("Failed to track API error", e);
    }
  }

  // ------------ SUCCESS TRACKER ------------
  logApiSuccess(response) {
    try {
      const config = response.config;

      Analytics.track("api_success", {
        url: config.baseURL + config.url,
        method: config.method?.toUpperCase(),
        status: response.status,
        path: window.location.pathname,
      });
    } catch (e) {
      console.warn("Failed to log api_success", e);
    }
  }

  // ------------ REQUEST TRACKER (optional) ------------
  logApiRequest(config) {
    try {
      Analytics.track("api_request", {
        url: config.baseURL + config.url,
        method: config.method?.toUpperCase(),
        path: window.location.pathname,
      });
    } catch (e) {
      console.warn("Failed to log api_request", e);
    }
  }

  // ------------ INTERCEPTORS ------------
  setupInterceptors() {
    // Request
    this.client.interceptors.request.use(
      (config) => {
        const token = AuthManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Track request
        this.logApiRequest(config);

        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response
    this.client.interceptors.response.use(
      (response) => {
        // Track success
        this.logApiSuccess(response);
        return response;
      },
      (error) => {
        // Track failure
        this.logApiError(error);

        if (error.response?.status === 401) {
          this.handleAuthError();
        }

        return Promise.reject(error);
      },
    );
  }

  // Authentication handler
  handleAuthError() {
    AuthManager.clearAuth();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  // Retry handler
  async withRetry(requestFn, retries = API_CONFIG.retryAttempts) {
    try {
      return await requestFn();
    } catch (error) {
      this.logApiError(error);

      const shouldRetry =
        retries > 0 &&
        error.response?.status >= 500 &&
        error.response?.status < 600;

      if (shouldRetry) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_CONFIG.retryDelay),
        );
        return this.withRetry(requestFn, retries - 1);
      }

      throw error;
    }
  }

  // HTTP verbs
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
  patch(url, data = {}, config = {}) {
    return this.client.patch(url, data, config);
  }
}

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

  async checkExists(paperId, documentType = "paper") {
    try {
      const endpoint =
        documentType === "patent"
          ? `/patents/${paperId}/metadata`
          : `/papers/${paperId}/metadata`;
      await this.http.get(endpoint);
      return true;
    } catch (err) {
      if (err.response?.status === 404) return false;
      throw err;
    }
  }

  async uploadZip(file, language) {
    const formData = new FormData();
    formData.append("file", file);
    if (language) formData.append("language", language);

    console.log("[uploadZip] Sending request to /papers/upload-zip");
    console.log(
      "[uploadZip] File:",
      file.name,
      "Size:",
      file.size,
      "Type:",
      file.type,
    );
    console.log("[uploadZip] Language:", language);
    console.log(
      "[uploadZip] FormData entries:",
      Array.from(formData.entries()),
    );

    return this.http.post("/papers/upload-zip", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async uploadPdf(file, language) {
    const formData = new FormData();
    formData.append("file", file);
    if (language) formData.append("language", language);

    console.log("[uploadPdf] Sending request to /papers/upload-pdf");
    console.log(
      "[uploadPdf] File:",
      file.name,
      "Size:",
      file.size,
      "Type:",
      file.type,
    );
    console.log("[uploadPdf] Language:", language);
    console.log(
      "[uploadPdf] FormData entries:",
      Array.from(formData.entries()),
    );

    return this.http.post("/papers/upload-pdf", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  // async getPdfUploadStatus(jobId) {
  //   return this.http.get(
  //     `/papers/upload_pdf_to_metadata/${jobId}/status`
  //   );
  // }
  async uploadPatentPdf(file) {
    const formData = new FormData();
    formData.append("file", file);
    return this.http.post("/patents/upload-pdf", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async uploadPdfToVideo(file, ttsSource) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tts_source", ttsSource);
    return this.http.post(
      "/papertovideo/upload_pdf_to_video_ttsOptional",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 10 * 60 * 1000, // 10 minutes timeout
      },
    );
  }

  async uploadZipToVideo(file, ttsSource) {
    const formData = new FormData();
    formData.append("file", file);
    if (ttsSource) formData.append("tts_source", ttsSource);
    return this.http.post("/papertovideo/upload_latex_to_video", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async scrapeArxiv(url) {
    return this.http.post("/papers/scrape-arxiv", { arxiv_url: url });
  }

  async scrapeArxivToVideo(url, ttsSource) {
    const formData = new FormData();
    formData.append("arxiv_url", url);
    if (ttsSource) formData.append("tts_source", ttsSource);
    return this.http.post("/papertovideo/upload_arxiv_to_video", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async getMetadata(paperId) {
    return this.http.get(`/papers/${paperId}/metadata`);
  }

  async getPatentMetadata(paperId, documentType = "patent") {
    const endpoint =
      documentType === "patent"
        ? `/patents/${paperId}/metadata`
        : `/papers/${paperId}/metadata`;
    return this.http.get(endpoint);
  }

  async updateMetadata(paperId, metadata) {
    return this.http.put(`/papers/${paperId}/metadata`, metadata);
  }

  async updatePatentMetadata(paperId, metadata, documentType = "patent") {
    const endpoint =
      documentType === "patent"
        ? `/patents/${paperId}/metadata`
        : `/papers/${paperId}/metadata`;
    return this.http.put(endpoint, metadata);
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

  async generate(paperId, audienceLevel) {
    const params = audienceLevel ? `?audience_level=${audienceLevel}` : "";
    return this.http.withRetry(() =>
      this.http.post(`/scripts/${paperId}/generate${params}`),
    );
  }

  async getSections(paperId) {
    try {
      return await this.http.get(`/scripts/${paperId}/sections`);
    } catch (error) {
      if (error.response?.status === 404) {
        return { data: { sections: {}, paper_id: paperId } };
      }
      throw error;
    }
  }

  async updateSections(paperId, data) {
    return this.http.withRetry(() =>
      this.http.put(`/scripts/${paperId}/sections`, data),
    );
  }

  async refreshSections(paperId) {
    try {
      return await this.http.get(`/scripts/${paperId}/sections/refresh`);
    } catch (error) {
      if (error.response?.status === 404) {
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

  async uploadImageToSection(paperId, sectionName, file) {
    const formData = new FormData();
    formData.append("paper_id", paperId);
    formData.append("section_name", sectionName);
    formData.append("image", file);

    return this.http.withRetry(() =>
      this.http.put("/scripts/sections/new_image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 2 * 60 * 1000,
      }),
    );
  }
}

class SlidesService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async getAvailableLanguages(paperId) {
    return this.http.get(`/slides/${paperId}/get_language`);
  }

  async generate(paperId, format, templateType, language) {
    // If user didn't provide a template and we're generating beamer (PDF),
    // default to "template1" because there's no UI selector for PDF.
    const effectiveTemplate =
      templateType || (format === "beamer" ? "template1" : undefined);

    const payload = format ? { format } : {};
    if (language) {
      payload.language = language;
      console.log("Generating slides with language:", language);
    }
    let url = `/slides/${paperId}/generate`;

    if (effectiveTemplate) {
      url += `?template_type=${encodeURIComponent(effectiveTemplate)}`;
    }

    console.log("Generating slides with URL:", url, "payload:", payload);
    return this.http.post(url, payload);
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

  async downloadPowerpoint(paperId) {
    return this.http.get(`/slides/${paperId}/download-pptx`, {
      responseType: "blob",
    });
  }

  getViewPdfUrl(paperId) {
    return `${API_CONFIG.baseURL}/api/slides/${paperId}/view-pdf`;
  }
}

class MediaService {
  constructor(httpClient) {
    this.http = httpClient;
  }
  // ================= Twitter Thread =================

  async generateTwitterThread(paperId) {
    return this.http.post(`/media/${paperId}/generate-twitter-thread`);
  }

  listThreadImages(paperId) {
    return this.http.get(`/media/${paperId}/list-thread-images`);
  }

  async downloadThreadImagesZip(paperId) {
    return this.http.get(`/media/${paperId}/download-thread-images`, {
      responseType: "blob",
    });
  }

  // async downloadThreadImage(paperId, filename) {
  //   return this.http.get(
  //   `/media/${paperId}/download-thread-image/${encodeURIComponent(filename)}`,
  //     { responseType: "blob" }
  //   );
  // }
  async downloadThreadImage(paperId, filename) {
    return this.http.get(
    `/media/${paperId}/download-thread-image/${encodeURIComponent(filename)}`,
      { responseType: "blob" }
    );
  }
  

  async generateAudio(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-audio`, config, {
      timeout: 10 * 60 * 1000, // 10 minutes timeout
    });
  }

  async generateBhashiniAudio(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-audio-bhashini`, config, {
      timeout: 10 * 60 * 1000, // 10 minutes timeout
    });
  }

  async generateVideo(paperId, config) {
    return this.http.post(`/media/${paperId}/generate-video`, config);
  }

  async downloadVideo(paperId) {
    return this.http.get(`/media/${paperId}/download-video`, {
      responseType: "blob",
    });
  }

  async downloadPresentationVideo(paperId) {
    return this.http.get(`/papertovideo/${paperId}/download-video`, {
      responseType: "blob",
    });
  }

  async downloadPresentationSlides(paperId) {
    return this.http.get(`/papertovideo/${paperId}/download-slides`, {
      responseType: "blob",
    });
  }

  async getPresentationMetaInfo(paperId) {
    return this.http.get(`/papertovideo/${paperId}/metadata`, {
      responseType: "json",
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

  getPresentationVideoStreamUrl(paperId) {
    return `${API_CONFIG.baseURL}/api/papertovideo/${paperId}/stream-video`;
  }
  getThreadImageUrl(paperId, filename) {
    return `${API_CONFIG.baseURL}/api/media/${paperId}/download-thread-image/${encodeURIComponent(filename)}`;
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

class FeedbackService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async submit(data) {
    const formData = new FormData();
    formData.append("rating", (data.rating ?? "").toString());
    formData.append("feedback", data.comment ?? "");

    if (data.fb_question) formData.append("fb_question", data.fb_question);
    if (data.questionKey) formData.append("questionKey", data.questionKey);
    if (data.page) formData.append("page", data.page);

    return this.http.post("feedback/submit_feedback", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
}

class PodcastService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  // async generate(file, language = "english") {
  //   // Basic sanity checks
  //   if (!file) throw new Error("No file provided to generate podcast");
  //   if (!(file instanceof File || file instanceof Blob)) {
  //     console.warn("generate: file is not File/Blob — got:", file);
  //   }

  //   const formData = new FormData();
  //   formData.append("file", file);
  //   formData.append("language", language);
  //   try {
  //     for (const pair of formData.entries()) {
  //       console.debug(
  //         "[PodcastService] formData entry:",
  //         pair[0],
  //         pair[1]?.name || pair[1],
  //       );
  //     }
  //   } catch (e) {
  //     console.debug("[PodcastService] could not iterate formData:", e);
  //   }

  //   const url = `${PODCAST_HOST}/api/podcast/get_podcast`;
  //   const config = {
  //     timeout: 5 * 60 * 1000,
  //     headers: {
  //       // Intentionally empty — avoid copying app-level defaults (auth, content-type)
  //     },
  //   };

  //   try {
  //     const resp = await axios.post(url, formData, config);
  //     console.debug("[PodcastService] generate OK", {
  //       url,
  //       status: resp.status,
  //       data: resp.data,
  //     });
  //     return resp;
  //   } catch (err) {
  //     // Show server validation error to help fix 422
  //     console.error("[PodcastService] generate ERR", {
  //       url,
  //       status: err?.response?.status,
  //       data: err?.response?.data,
  //       message: err?.message,
  //     });

  //     // Optional: throw a more helpful error for UI
  //     const serverMsg =
  //       err?.response?.data || err?.response?.statusText || err?.message;
  //     const e = new Error(`Podcast generation failed: ${serverMsg}`);
  //     e._raw = err;
  //     throw e;
  //   }
  // }

  // async getStatus(paperId) {
  //   const url = `${PODCAST_HOST}/api/podcast/podcast_status/${encodeURIComponent(
  //     paperId,
  //   )}`;
  //   // Use plain axios for status too (keeps it simple)
  //   return axios
  //     .get(url)
  //     .then((resp) => {
  //       console.debug("[PodcastService] Status OK", {
  //         paperId,
  //         data: resp.data,
  //       });
  //       return resp;
  //     })
  //     .catch((err) => {
  //       throw err;
  //     });
  // }

  // async generateFromArxiv(arxivUrl, language = "english") {
  //   const formData = new FormData();
  //   formData.append("arxiv_url", arxivUrl);
  //   formData.append("language", language);

  //   const url = `${PODCAST_HOST}/api/podcast/get_podcast_from_arxiv`;
  //   const config = {
  //     timeout: 5 * 60 * 1000,
  //     headers: {},
  //   };

  //   try {
  //     const resp = await axios.post(url, formData, config);
  //     console.debug("[PodcastService] generateFromArxiv OK", {
  //       url,
  //       status: resp.status,
  //       data: resp.data,
  //     });
  //     return resp;
  //   } catch (err) {
  //     console.error("[PodcastService] generateFromArxiv ERR", {
  //       url,
  //       status: err?.response?.status,
  //       data: err?.response?.data,
  //       message: err?.message,
  //     });

  //     const serverMsg =
  //       err?.response?.data?.detail ||
  //       err?.response?.data ||
  //       err?.response?.statusText ||
  //       err?.message;
  //     const e = new Error(`Podcast generation from arXiv failed: ${serverMsg}`);
  //     e._raw = err;
  //     throw e;
  //   }
  // }

  // async generateFromLatex(file, language = "english") {
  //   if (!file)
  //     throw new Error("No file provided to generate podcast from LaTeX");

  //   const formData = new FormData();
  //   formData.append("file", file);
  //   formData.append("language", language);

  //   const url = `${PODCAST_HOST}/api/podcast/get_podcast_from_latex`;
  //   const config = {
  //     timeout: 5 * 60 * 1000,
  //     headers: {},
  //   };

  //   try {
  //     const resp = await axios.post(url, formData, config);
  //     console.debug("[PodcastService] generateFromLatex OK", {
  //       url,
  //       status: resp.status,
  //       data: resp.data,
  //     });
  //     return resp;
  //   } catch (err) {
  //     console.error("[PodcastService] generateFromLatex ERR", {
  //       url,
  //       status: err?.response?.status,
  //       data: err?.response?.data,
  //       message: err?.message,
  //     });

  //     const serverMsg =
  //       err?.response?.data?.detail ||
  //       err?.response?.data ||
  //       err?.response?.statusText ||
  //       err?.message;
  //     const e = new Error(`Podcast generation from LaTeX failed: ${serverMsg}`);
  //     e._raw = err;
  //     throw e;
  //   }
  // }


    async generate(file, language = "english") {
    if (!file) throw new Error("No file provided to generate podcast");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    return this.http.client.post(`${PODCAST_HOST}/api/podcast/get_podcast`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async generateFromArxiv(arxivUrl, language = "english") {
    const formData = new FormData();
    formData.append("arxiv_url", arxivUrl);
    formData.append("language", language);

    return this.http.client.post(`${PODCAST_HOST}/api/podcast/get_podcast_from_arxiv`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async generateFromLatex(file, language = "english") {
    if (!file) throw new Error("No file provided");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    return this.http.client.post(`${PODCAST_HOST}/api/podcast/get_podcast_from_latex`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async getStatus(paperId) {
    return this.http.client.get(
      `${PODCAST_HOST}/api/podcast/podcast_status/${encodeURIComponent(paperId)}`
    );
  }

  async download(paperId) {
    const url = `${PODCAST_HOST}/api/podcast/download_audio/${encodeURIComponent(
      paperId,
    )}`;
    return axios.get(url, { responseType: "blob" });
  }

  getDownloadUrl(paperId) {
    return `${PODCAST_HOST}/api/podcast/download_audio/${encodeURIComponent(
      paperId,
    )}`;
  }

  getStreamUrl(paperId) {
    return `${PODCAST_HOST}/api/podcast/stream_audio/${encodeURIComponent(
      paperId,
    )}`;
  }
}

class ReelService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(file, language = "english") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    const url = `${REEL_HOST}/api/reels/generate_reel_from_pdf`;
    return this.http.client.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async generateFromArxiv(arxivUrl, language = "english") {
    const formData = new FormData();
    formData.append("arxiv_url", arxivUrl);
    formData.append("language", language);

    const url = `${REEL_HOST}/api/reels/generate_reel_from_arxiv`;
    return this.http.client.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async generateFromLatex(file, language = "english") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    const url = `${REEL_HOST}/api/reels/generate_reel_from_latex`;
    return this.http.client.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    });
  }

  async getStatus(paperId) {
    const url = `${REEL_HOST}/api/reels/reel_status/${encodeURIComponent(
      paperId,
    )}`;
    return this.http.client
      .get(url)
      .then((resp) => {
        console.debug("[ReelService] Status OK", { paperId, data: resp.data });
        return resp;
      })
      .catch((err) => {
        throw err;
      });
  }

  async getScript(paperId) {
    const url = `${REEL_HOST}/api/reels/reel_script/${encodeURIComponent(
      paperId,
    )}`;
    return this.http.client
      .get(url)
      .then((resp) => {
        console.debug("[ReelService] Script OK", { paperId, data: resp.data });
        return resp;
      })
      .catch((err) => {
        throw err;
      });
  }

  async updateScript(paperId, scriptData) {
    const url = `${REEL_HOST}/api/reels/reel_script/${encodeURIComponent(
      paperId,
    )}`;
    return this.http.client
      .put(url, { script: scriptData })
      .then((resp) => {
        console.debug("[ReelService] Script updated OK", {
          paperId,
          data: resp.data,
        });
        return resp;
      })
      .catch((err) => {
        throw err;
      });
  }

  async getAvailableAvatars() {
    const url = `${REEL_HOST}/api/reels/available_avatars`;
    return this.http.client
      .get(url)
      .then((resp) => {
        console.debug("[ReelService] Available avatars OK", {
          data: resp.data,
        });
        return resp;
      })
      .catch((err) => {
        throw err;
      });
  }

  async selectAvatars(paperId, avatarPairId) {
    const url = `${REEL_HOST}/api/reels/reel_avatar_selection/${encodeURIComponent(
      paperId,
    )}`;
    return this.http.client
      .post(url, { avatar_pair_id: avatarPairId })
      .then((resp) => {
        console.debug("[ReelService] Avatars selected OK", {
          paperId,
          data: resp.data,
        });
        return resp;
      })
      .catch((err) => {
        throw err;
      });
  }

  async finalize(paperId) {
    const url = `${REEL_HOST}/api/reels/reel_finalize/${encodeURIComponent(
      paperId,
    )}`;
    return this.http.client
      .post(url)
      .then((resp) => {
        console.debug("[ReelService] Finalize OK", {
          paperId,
          data: resp.data,
        });
        return resp;
      })
      .catch((err) => {
        throw err;
      });
  }

  getStreamUrl(paperId) {
    return `${REEL_HOST}/api/reels/stream_video/${encodeURIComponent(paperId)}`;
  }

  async download(paperId) {
    const url = `${REEL_HOST}/api/reels/download_video/${encodeURIComponent(
      paperId,
    )}`;
    return this.http.client.get(url, { responseType: "blob" });
  }

  getDownloadUrl(paperId) {
    return `${REEL_HOST}/api/reels/download_video/${encodeURIComponent(
      paperId,
    )}`;
  }
}

class PosterService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(file, conferenceVenue, template = "default") {
    const formData = new FormData();
    formData.append("file", file);
    if (conferenceVenue) formData.append("conference_venue", conferenceVenue);
    formData.append("template", template);

    const url = `${POSTER_API_BASE}/poster/generate`;
    return this.http.client.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 10 * 60 * 1000,
    });
  }

  getDownloadUrl(filePath) {
    return `${POSTER_API_BASE}/poster/download?file_path=${encodeURIComponent(filePath)}`;
  }
}

class BusinessBriefService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(paperId) {
    return this.http.withRetry(() =>
      this.http.post(`/business-brief/${paperId}/generate`),
    );
  }

  async getSections(paperId) {
    try {
      return await this.http.get(`/business-brief/${paperId}/sections`);
    } catch (error) {
      if (error.response?.status === 404) {
        return { data: { sections: {}, paper_id: paperId } };
      }
      throw error;
    }
  }

  async updateSections(paperId, sections) {
    return this.http.withRetry(() =>
      this.http.put(`/business-brief/${paperId}/sections`, { sections }),
    );
  }

  async downloadPdf(paperId) {
    return this.http.get(`/business-brief/${paperId}/download-pdf`, {
      responseType: "blob",
      timeout: 5 * 60 * 1000,
    });
  }
}

class WebpageService {
  constructor(httpClient) {
    this.http = httpClient;
  }

  async generate(paperId) {
    return this.http.post(`/webpage/${paperId}/generate`);
  }

  async listVariants(paperId) {
    return this.http.get(`/webpage/${paperId}/variants`);
  }

  async getPreviewHtml(paperId, variantId) {
    return this.http.get(`/webpage/${paperId}/preview/${variantId}`, {
      responseType: "text",
    });
  }

  async getPreviewAsset(paperId, imageName) {
    return this.http.get(`/webpage/${paperId}/asset/${imageName}`, {
      responseType: "blob",
    });
  }

  async downloadVariant(paperId, variantId) {
    return this.http.get(`/webpage/${paperId}/download/${variantId}`, {
      responseType: "blob",
    });
  }
}

class ApiService {
  constructor() {
    this.httpClient = new HttpClient();

    this.auth = new AuthService(this.httpClient);
    this.apiKeys = new ApiKeysService(this.httpClient);
    this.papers = new PapersService(this.httpClient);
    this.scripts = new ScriptsService(this.httpClient);
    this.images = new ImagesService(this.httpClient);
    this.slides = new SlidesService(this.httpClient);
    this.media = new MediaService(this.httpClient);
    this.youtube = new YoutubeService(this.httpClient);
    this.feedback = new FeedbackService(this.httpClient);
    this.podcast = new PodcastService(this.httpClient);
    this.reel = new ReelService(this.httpClient);
    this.poster = new PosterService(this.httpClient);
    this.businessBrief = new BusinessBriefService(this.httpClient);
    this.webpage = new WebpageService(this.httpClient);
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

  setupApiKeys = (keys) => this.apiKeys.setup(keys);
  getApiKeysStatus = () => this.apiKeys.getStatus();
  checkPaperExists = (paperId, documentType) =>
    this.papers.checkExists(paperId, documentType);
  uploadZip = (file, language) => this.papers.uploadZip(file, language);
  uploadPdf = (file, language) => this.papers.uploadPdf(file, language);
  // getPdfUploadStatus = (jobId) =>
  // this.papers.getPdfUploadStatus(jobId);
  uploadPdfToVideo = (file, ttsSource) =>
    this.papers.uploadPdfToVideo(file, ttsSource);
  uploadZipToVideo = (file, ttsSource) =>
    this.papers.uploadZipToVideo(file, ttsSource);
  scrapeArxiv = (url) => this.papers.scrapeArxiv(url);
  scrapeArxivToVideo = (url, ttsSource) =>
    this.papers.scrapeArxivToVideo(url, ttsSource);
  getPaperMetadata = (paperId) => this.papers.getMetadata(paperId);
  updatePaperMetadata = (paperId, metadata) =>
    this.papers.updateMetadata(paperId, metadata);
  downloadPaperPdf = (paperId) => this.papers.downloadPdf(paperId);
  uploadPatentPdf = (file) => this.papers.uploadPatentPdf(file);
  getPatentMetadata = (paperId, documentType) =>
    this.papers.getPatentMetadata(paperId, documentType);
  updatePatentMetadata = (paperId, metadata, documentType) =>
    this.papers.updatePatentMetadata(paperId, metadata, documentType);
  downloadPaperSource = (paperId) => this.papers.downloadSource(paperId);
  generateScript = (paperId, audienceLevel) =>
    this.scripts.generate(paperId, audienceLevel);
  generatePoster = (file, venue, template) =>
    this.poster.generate(file, venue, template);
  getPosterDownloadUrl = (filePath) => this.poster.getDownloadUrl(filePath);
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
  uploadImageToSection = (paperId, sectionName, file) =>
    this.images.uploadImageToSection(paperId, sectionName, file);
  generateSlides = (paperId, format, templateType, language) =>
    this.slides.generate(paperId, format, templateType, language);
  getAvailableLanguagesForSlides = (paperId) =>
    this.slides.getAvailableLanguages(paperId);
  getSlidePreview = (paperId) => this.slides.getPreview(paperId);
  getSlideImageUrl = (paperId, imageName) =>
    this.slides.getSlideImageUrl(paperId, imageName);
  downloadSlides = (paperId) => this.slides.download(paperId);
  downloadLatexSource = (paperId) => this.slides.downloadLatexSource(paperId);
  downloadPowerpoint = (paperId) => this.slides.downloadPowerpoint(paperId);
  getViewPdfUrl = (paperId) => this.slides.getViewPdfUrl(paperId);
  generateAudio = (paperId, config) =>
    this.media.generateAudio(paperId, config);
  generateBhashiniAudio = (paperId, config) =>
    this.media.generateBhashiniAudio(paperId, config);
  generateVideo = (paperId, config) =>
    this.media.generateVideo(paperId, config);
  downloadVideo = (paperId) => this.media.downloadVideo(paperId);
  downloadPresentationVideo = (paperId) =>
    this.media.downloadPresentationVideo(paperId);
  downloadPresentationSlides = (paperId) =>
    this.media.downloadPresentationSlides(paperId);
  getPresentationMetaInfo = (paperId) =>
    this.media.getPresentationMetaInfo(paperId);
  downloadAudio = (paperId, filename) =>
    this.media.downloadAudio(paperId, filename);
  getMediaStatus = (paperId) => this.media.getStatus(paperId);
  getAudioStreamUrl = (paperId, filename) =>
    this.media.getAudioStreamUrl(paperId, filename);
  getVideoStreamUrl = (paperId) => this.media.getVideoStreamUrl(paperId);
  getPresentationVideoStreamUrl = (paperId) =>
    this.media.getPresentationVideoStreamUrl(paperId);
  googleUpload = (code, paper_id) => this.youtube.googleUpload(code, paper_id);
  submitFeedback = (data) => this.feedback.submit(data);
  generatePodcast = (file, language) => this.podcast.generate(file, language);
  generatePodcastFromArxiv = (arxivUrl, language) =>
    this.podcast.generateFromArxiv(arxivUrl, language);
  generatePodcastFromLatex = (file, language) =>
    this.podcast.generateFromLatex(file, language);
  getPodcastStatus = (paperId) => this.podcast.getStatus(paperId);
  downloadPodcast = (paperId) => this.podcast.download(paperId);
  downloadPodcastAudio = (paperId) => this.podcast.getDownloadUrl(paperId);
  streamPodcastAudio = (paperId) => this.podcast.getStreamUrl(paperId);
  generateReel = (file, language) => this.reel.generate(file, language);
  generateReelFromPdf = (file, language) => this.reel.generate(file, language);
  generateReelFromArxiv = (arxivUrl, language) =>
    this.reel.generateFromArxiv(arxivUrl, language);
  generateReelFromLatex = (file, language) =>
    this.reel.generateFromLatex(file, language);
  getReelStatus = (paperId) => this.reel.getStatus(paperId);
  getReelVideoStreamUrl = (paperId) => this.reel.getStreamUrl(paperId);
  streamReelVideo = (paperId) => this.reel.getStreamUrl(paperId);
  downloadReelVideo = (paperId) => this.reel.download(paperId);
  getReelDownloadUrl = (paperId) => this.reel.getDownloadUrl(paperId);
  // ================= Twitter Thread =================
  generateTwitterThread = (paperId) =>
    this.media.generateTwitterThread(paperId);
  listThreadImages = (paperId) => this.media.listThreadImages(paperId);
  downloadThreadImagesZip = (paperId) =>
    this.media.downloadThreadImagesZip(paperId);
  downloadThreadImage = (paperId, filename) =>
    this.media.downloadThreadImage(paperId, filename);
  getThreadImageUrl = (paperId, filename) =>
    this.media.getThreadImageUrl(paperId, filename);
  // ================= Business Brief =================
  generateBusinessBrief = (paperId) => this.businessBrief.generate(paperId);
  getBusinessBriefSections = (paperId) =>
    this.businessBrief.getSections(paperId);
  updateBusinessBriefSections = (paperId, sections) =>
    this.businessBrief.updateSections(paperId, sections);
  downloadBusinessBriefPdf = (paperId) =>
    this.businessBrief.downloadPdf(paperId);
  generateWebpage = (paperId) => this.webpage.generate(paperId);
  listWebpageVariants = (paperId) => this.webpage.listVariants(paperId);
  getWebpagePreviewHtml = (paperId, variantId) =>
    this.webpage.getPreviewHtml(paperId, variantId);
  getWebpagePreviewAsset = (paperId, imageName) =>
    this.webpage.getPreviewAsset(paperId, imageName);
  downloadWebpageVariant = (paperId, variantId) =>
    this.webpage.downloadVariant(paperId, variantId);
}

export const apiService = new ApiService();

export const {
  apiKeys,
  papers,
  scripts,
  images,
  slides,
  media,
  youtube,
  feedback,
} = apiService;

export const httpClient = apiService.httpClient;
export { AuthManager };
export default apiService;
