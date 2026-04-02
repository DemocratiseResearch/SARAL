// src/components/upload/PaperUpload.jsx
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiUpload,
  FiFile,
  FiX,
  FiGlobe,
  FiCheck,
  FiFileText,
} from "react-icons/fi";
import toast from "../../services/toastService";
import { apiService } from "../../services/api";
import { useWorkflow } from "../../contexts/WorkflowContext";
import LoadingSpinner from "../common/LoadingSpinner";
import ProcessingStatus from "../common/ProcessingStatus";
import YouTubeLogin from "../../pages/YouTubeLogin";
import VideoPlayer from "../workflow/VideoPlayer";
import { useNavigate } from "react-router-dom";
import Analytics from "../../lib/analytics";

// helper for analytics
const track = (eventName, props = {}) => {
  Analytics.track(eventName, {
    timestamp: new Date().toISOString(),
    ...props,
  });
};

// Language options (languages only, no genders)
const LANGUAGES = [
  "English",
  "Hindi",
  "Bengali",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Odia",
  "Punjabi",
  "Tamil",
  "Telugu"
];

const UploadTypeCard = ({
  type,
  onSelect,
  icon: Icon,
  title,
  description,
  isActive,
  disabled,
}) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => onSelect(type)}
    disabled={disabled}
    className={`w-full p-6 rounded-xl border transition-all duration-150 text-left ${
      disabled ? "opacity-60 cursor-not-allowed" : ""
    } ${
      isActive
        ? "border-gray-700 bg-gray-50 dark:bg-gray-900/50"
        : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800"
    }`}
  >
    <Icon
      className={`w-6 h-6 mb-3 ${
        isActive
          ? "text-gray-700 dark:text-gray-300"
          : "text-gray-600 dark:text-gray-400"
      }`}
    />
    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
      {title}
    </h3>
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
  </motion.button>
);

const FileDisplay = ({ file, onRemove, disabled }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    className="bg-white dark:bg-neutral-800 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
          <FiFile className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {file.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      </div>
      <button
        onClick={onRemove}
        disabled={disabled}
        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors duration-150"
      >
        <FiX className="w-5 h-5" />
      </button>
    </div>
  </motion.div>
);

const LanguagePickerModal = ({
  open,
  onClose,
  onPick,
  title = "Select Language",
  okLabel = "OK — Continue",
}) => {
  const [selected, setSelected] = useState("English");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected("English");
      setMenuOpen(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 w-full max-w-lg bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          {title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Choose language for slides and narration.
        </p>

        <div className="mb-4 relative">
          <button
            type="button"
            onClick={() => setMenuOpen((s) => !s)}
            className="w-full text-left p-3 border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
            aria-expanded={menuOpen}
          >
            <span>{selected}</span>
            <svg
              className={`w-4 h-4 transform ${menuOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6 8l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div
            className={`absolute left-0 right-0 mt-2 rounded-md shadow-lg z-20 ${
              menuOpen ? "" : "hidden"
            }`}
          >
            <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 max-h-56 overflow-auto rounded-md">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setSelected(lang);
                    setMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white transition-colors ${
                    selected === lang
                      ? "font-semibold bg-gray-50 dark:bg-gray-900/40"
                      : ""
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onPick(selected)}
            className="px-4 py-2 rounded-md bg-pink-600 hover:bg-pink-500 text-white text-sm"
          >
            {okLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const PaperUpload = () => {
  const {
    setLoading,
    setPaperId,
    setMetadata,
    setImages,
    paperId,
    setIsProcessed,
    documentType,
  } = useWorkflow();
  const [uploadType, setUploadType] = useState("file"); // file | pdf | arxiv
  const [arxivUrl, setArxivUrl] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);

  // processing flags
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [isConvertingVideo, setIsConvertingVideo] = useState(false);
  const [isConvertingReel, setIsConvertingReel] = useState(false);
  const [isConvertingPodcast, setIsConvertingPodcast] = useState(false);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [isImportingArxiv, setIsImportingArxiv] = useState(false);
  const [isImportingArxivToVideo, setIsImportingArxivToVideo] = useState(false);

  const [videoUrl, setVideoUrl] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const navigate = useNavigate();
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const processingRef = useRef(null);

  useEffect(() => {
    track("Paper Processing Page Viewed", {
      doc_type: documentType === "patent" ? "patent" : "research_paper",
    });
  }, [documentType]);

  useEffect(() => {
    let mounted = true;
    if (!paperId) {
      setStreamUrl(null);
      return;
    }
    try {
      const maybe = apiService.getPresentationVideoStreamUrl(paperId);
      if (maybe && typeof maybe.then === "function") {
        maybe
          .then((url) => {
            if (mounted) {
              setStreamUrl(url || null);
              setVideoUrl(url || null);
            }
          })
          .catch(() => {
            if (mounted) setStreamUrl(null);
          });
      } else {
        setStreamUrl(maybe || null);
        setVideoUrl(maybe || null);
      }
    } catch {
      if (mounted) setStreamUrl(null);
    }
    return () => {
      mounted = false;
    };
  }, [paperId]);

  const isAnyProcessing = useMemo(() => {
    return (
      isProcessingUpload ||
      isConvertingVideo ||
      isConvertingReel ||
      isConvertingPodcast ||
      isGeneratingBrief ||
      isImportingArxiv ||
      isImportingArxivToVideo
    );
  }, [
    isProcessingUpload,
    isConvertingVideo,
    isConvertingReel,
    isConvertingPodcast,
    isGeneratingBrief,
    isImportingArxiv,
    isImportingArxivToVideo,
  ]);

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      const file = acceptedFiles[0];
      if (rejectedFiles.length > 0) {
        const error = rejectedFiles[0].errors[0];
        if (error.code === "file-too-large") {
          toast.error("File size too large. Please upload a smaller file.", { duration: 8000 });
        } else if (error.code === "file-invalid-type") {
          toast.error(
            `Please upload a ${uploadType === "file" ? "ZIP" : "PDF"} file`,
            { duration: 8000 },
          );
        } else {
          toast.error("File upload failed. Please try again.", { duration: 8000 });
        }
        return;
      }

      if (file) {
        setUploadedFile(file);
        toast.success("File selected successfully");
      }
    },
    [uploadType],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept:
        uploadType === "file"
          ? { "application/zip": [".zip"] }
          : { "application/pdf": [".pdf"] },
      multiple: false,
      maxSize: 50 * 1024 * 1024, // 50MB
    });

  const handleSelectType = (type) => {
    if (isAnyProcessing) return; // prevent switching while processing
    setUploadType(type);
    setUploadedFile(null);
    setArxivUrl("");
    setVideoUrl(null);

    const source = type === "file" ? "latex" : type === "pdf" ? "pdf" : "arxiv";

    track("Document Source Selected", {
      doc_type: documentType === "patent" ? "patent" : "research_paper",
      source,
    });
  };

  // ----- arXiv (custom) -----
  const handleArxivSubmit = async (language = "ENGLISH") => {
    console.log(
      "[PaperUpload] handleArxivSubmit called with language:",
      language,
    );

    if (!arxivUrl.trim()) {
      toast.error("Please enter an arXiv URL", { duration: 8000 });
      return;
    }
    if (!arxivUrl.includes("arxiv.org") && !arxivUrl.includes("biorxiv.org")) {
      toast.error("Please enter a valid arXiv or bioRxiv URL", { duration: 8000 });
      return;
    }

    setIsImportingArxiv(true);
    setLoading(true);

    try {
      console.log("[PaperUpload] Scraping arXiv URL:", arxivUrl);
      const response = await apiService.scrapeArxiv(arxivUrl);
      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setMetadata(metadata);
      setImages(image_files);
      setIsProcessed(true);

      toast.success("Paper processed successfully!");

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: "arxiv",
        file_name: arxivUrl.slice(0, 200),
        result: "succeeded",
        paper_id,
      });
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to process arXiv paper";
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: "arxiv",
        file_name: arxivUrl.slice(0, 200),
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsImportingArxiv(false);
      setLoading(false);
    }
  };

  const handleArxivToVideoWithTts = async (ttsSource) => {
    if (!arxivUrl.trim()) {
      toast.error("Please enter an arXiv URL", { duration: 8000 });
      return;
    }
    if (!arxivUrl.includes("arxiv.org")) {
      toast.error("Please enter a valid arXiv URL", { duration: 8000 });
      return;
    }

    setIsImportingArxivToVideo(true);
    setLoading(true);

    try {
      const response = await apiService.scrapeArxivToVideo(arxivUrl, ttsSource);
      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setMetadata(metadata);
      setImages(image_files);
      sessionStorage.setItem("paperId", paper_id);

      toast.success("Paper processed successfully!");

      track("One Click to Video Selected", {
        doc_type: documentType === "patent" ? "patent" : "research_paper",
        source: "arxiv",
        file_name: arxivUrl.slice(0, 200),
        tts_source: ttsSource,
        paper_id,
      });

      navigate("/video-display");
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to process arXiv paper";
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: "arxiv",
        file_name: arxivUrl.slice(0, 200),
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsImportingArxivToVideo(false);
      setLoading(false);
    }
  };

  // ----- file/pdf upload (custom) -----
  const handleFileUpload = async (language = "ENGLISH") => {
    console.log(
      "[PaperUpload] handleFileUpload called with language:",
      language,
    );

    if (!uploadedFile) {
      toast.error(
        `Please select a ${uploadType === "file" ? "ZIP" : "PDF"} file`,
      );
      return;
    }

    console.log(
      `[PaperUpload] Starting ${uploadType === "file" ? "LaTeX" : "PDF"} upload...`,
    );
    console.log(
      "[PaperUpload] File name:",
      uploadedFile.name,
      "Size:",
      uploadedFile.size,
    );

    setIsProcessingUpload(true);
    setLoading(true);
    setVideoUrl(null);
    setStreamUrl(null);

    try {
      let response;
      if (uploadType === "file") {
        console.log("[PaperUpload] Calling uploadZip with language:", language);
        response = await apiService.uploadZip(uploadedFile, language);
      } else {
        console.log("[PaperUpload] Calling uploadPdf with language:", language);
        response = await apiService.uploadPdf(uploadedFile, language);
      }

      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setMetadata(metadata || { title: "", authors: "", date: "" });
      setImages(image_files || []);
      setIsProcessed(true);

      toast.success(
        `${uploadType === "file" ? "LaTeX" : "PDF"} processed successfully!`,
      );

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        file_name: uploadedFile.name,
        result: "succeeded",
        language: language,
        paper_id,
      });

      track("Custom Video Generation Selected", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        conversion_choice: "custom",
        file_name: uploadedFile?.name || null,
        language: language,
      });
    } catch (error) {
      console.error("[PaperUpload] File upload processing error:", error);
      console.error("[PaperUpload] Error Status:", error.response?.status);
      console.error("[PaperUpload] Error Data:", error.response?.data);
      console.error("[PaperUpload] Error Message:", error.message);

      const errorMessage =
        error.response?.data?.detail || `Failed to process ${uploadType} file`;
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        file_name: uploadedFile?.name || null,
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsProcessingUpload(false);
      setLoading(false);
    }
  };

  // ----- one-click conversion for uploaded file (video) -----
  const handleConvertVideoWithTts = async (ttsSource) => {
    if (!uploadedFile) {
      toast.error(
        `Please select a ${uploadType === "file" ? "ZIP" : "PDF"} file`,
      );
      return;
    }

    setIsConvertingVideo(true);
    setLoading(true);
    setVideoUrl(null);

    try {
      let response;
      if (uploadType === "file") {
        response = await apiService.uploadZipToVideo(uploadedFile, ttsSource);
      } else {
        response = await apiService.uploadPdfToVideo(uploadedFile, ttsSource);
      }

      const { paper_id, metadata, image_files } = response.data;

      setPaperId(paper_id);
      setIsProcessed(false);
      sessionStorage.setItem("paperId", paper_id);
      setImages(image_files || []);

      toast.success("Video generation started!");

      track("One Click to Video Selected", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        file_name: uploadedFile.name,
        tts_source: ttsSource,
        paper_id: paper_id || null,
      });

      navigate("/video-display");
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to convert to video";
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        file_name: uploadedFile?.name || null,
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsConvertingVideo(false);
      setLoading(false);
    }
  };

  // ----- ONE-CLICK REEL (PDF, LaTeX, arXiv) -----
  const handleGenerateReel = async (language) => {
    setIsConvertingReel(true);
    setLoading(true);
    try {
      let resp;
      let source;
      let fileName;

      if (uploadType === "pdf" && uploadedFile) {
        resp = await apiService.generateReelFromPdf(uploadedFile, language);
        source = "pdf";
        fileName = uploadedFile?.name;
      } else if (uploadType === "file" && uploadedFile) {
        resp = await apiService.generateReelFromLatex(uploadedFile, language);
        source = "latex";
        fileName = uploadedFile?.name;
      } else if (uploadType === "arxiv" && arxivUrl.trim()) {
        resp = await apiService.generateReelFromArxiv(arxivUrl, language);
        source = "arxiv";
        fileName = arxivUrl.slice(0, 200);
      } else {
        toast.error("Please provide a valid source to generate a reel.");
        return;
      }

      console.log("[PaperUpload] generateReel response:", resp);

      const paper_id =
        resp?.data?.paper_id ||
        resp?.data?.paperId ||
        resp?.paper_id ||
        resp?.paperId ||
        resp?.data?.id ||
        null;

      console.log(
        "[PaperUpload] Extracted paper_id:",
        paper_id,
        "from response:",
        resp,
      );

      if (!paper_id) {
        console.error(
          "[PaperUpload] Reel API did not return paper_id. Full response:",
          resp,
        );
        throw new Error("Reel API did not return paper_id");
      }

      setPaperId(paper_id);
      sessionStorage.setItem("paperId", paper_id);
      console.log("[PaperUpload] Set paperId in sessionStorage:", paper_id);

      toast.success("Starting reel generation workflow...");

      track("One Click to Reel Selected", {
        doc_type: documentType === "patent" ? "patent" : "research_paper",
        source,
        file_name: fileName,
        language,
        paper_id: paper_id || null,
      });

      console.log("[PaperUpload] Navigating to /reel-script-editor");
      navigate("/reel-script-editor");
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to generate reel";
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : uploadType,
        file_name: uploadedFile?.name || arxivUrl.slice(0, 200),
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsConvertingReel(false);
      setLoading(false);
    }
  };

  const handleGeneratePodcast = async (language = "ENGLISH") => {
    setIsConvertingPodcast(true);
    setLoading(true);

    try {
      let resp;
      let source;
      let fileName;

      if (uploadType === "pdf" && uploadedFile) {
        resp = await apiService.generatePodcast(uploadedFile, language);
        source = "pdf";
        fileName = uploadedFile?.name;
      } else if (uploadType === "file" && uploadedFile) {
        resp = await apiService.generatePodcastFromLatex(
          uploadedFile,
          language,
        );
        source = "latex";
        fileName = uploadedFile?.name;
      } else if (uploadType === "arxiv" && arxivUrl.trim()) {
        resp = await apiService.generatePodcastFromArxiv(arxivUrl, language);
        source = "arxiv";
        fileName = arxivUrl.slice(0, 200);
      } else {
        toast.error("Please provide a valid source to generate a podcast.");
        return;
      }

      const paper_id =
        resp?.data?.paper_id ||
        resp?.data?.paperId ||
        resp?.paper_id ||
        resp?.paperId ||
        resp?.data?.id ||
        null;

      if (!paper_id) throw new Error("Podcast API did not return paper_id");

      sessionStorage.setItem("podcast_paper_id", paper_id);
      setPaperId(paper_id);
      sessionStorage.setItem("paperId", paper_id);

      toast.success("Podcast generation started!");

      track("One Click to Podcast Selected", {
        doc_type: documentType === "patent" ? "patent" : "research_paper",
        source,
        file_name: fileName,
        language,
        paper_id: paper_id || null,
      });

      navigate("/podcast-display");
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to generate podcast";
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : uploadType,
        file_name: uploadedFile?.name || arxivUrl.slice(0, 200),
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsConvertingPodcast(false);
      setLoading(false);
    }
  };

  const handleConvertPodcastWithTts = async (ttsSource) => {
    if (!uploadedFile) {
      toast.error(
        `Please select a ${uploadType === "file" ? "ZIP" : "PDF"} file`,
      );
      return;
    }

    setIsConvertingPodcast(true);
    setLoading(true);

    try {
      let response;
      if (uploadType === "file") {
        response = await apiService.uploadZipToPodcast(uploadedFile, ttsSource);
      } else {
        response = await apiService.uploadPdfToPodcast(uploadedFile, ttsSource);
      }

      const { paper_id } = response.data;
      setPaperId(paper_id);
      sessionStorage.setItem("paperId", paper_id);

      toast.success("Podcast generation started!");

      track("One Click to Podcast Selected", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        file_name: uploadedFile.name,
        tts_source: ttsSource,
        paper_id,
      });

      navigate("/podcast-display");
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to convert to podcast";
      toast.error(errorMessage);

      track("Upload Document", {
        doc_type: documentType === "patent" ? "patent" : "research",
        source: uploadType === "file" ? "latex" : "pdf",
        file_name: uploadedFile?.name || null,
        result: "failed",
        error_message: errorMessage,
      });
    } finally {
      setIsConvertingPodcast(false);
      setLoading(false);
    }
  };

  const handleGeneratePoster = () => {
    if (!uploadedFile) {
      toast.error(
        `Please select a ${uploadType === "file" ? "ZIP" : "PDF"} file`,
      );
      return;
    }

    track("One Click to Poster Selected", {
      doc_type: documentType === "patent" ? "patent" : "research",
      source: uploadType === "file" ? "latex" : "pdf",
      file_name: uploadedFile.name,
    });

    // Navigate to poster page with the file to generate
    navigate("/poster", { state: { fileToGenerate: uploadedFile } });
  };

  const handleRemoveFile = () => {
    if (isAnyProcessing) return;
    setUploadedFile(null);
  };

  const handleGenerateBusinessBrief = async () => {
    if (!uploadedFile) {
      toast.error("Please select a PDF file");
      return;
    }

    setIsGeneratingBrief(true);
    setLoading(true);
    try {
      // Upload PDF first (same as Process PDF) — language required by backend
      const resp = await apiService.uploadPdf(uploadedFile, "English");
      const paper_id =
        resp?.data?.paper_id ||
        resp?.data?.paperId ||
        resp?.paper_id ||
        null;

      if (!paper_id) {
        throw new Error("Upload did not return a paper ID");
      }

      setPaperId(paper_id);
      sessionStorage.setItem("paperId", paper_id);

      track("Business Brief Selected", {
        doc_type: documentType === "patent" ? "patent" : "research_paper",
        source: "pdf",
        file_name: uploadedFile.name,
        paper_id: paper_id,
      });

      toast.success("Starting business brief generation...");
      navigate("/business-brief");
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || "Failed to process PDF for business brief";
      toast.error(errorMessage);
    } finally {
      setIsGeneratingBrief(false);
      setLoading(false);
    }
  };

  const uploadTypes = [
    {
      type: "file",
      icon: FiUpload,
      title: "LaTeX Source",
      description: "Upload ZIP file containing LaTeX source code and figures",
    },
    {
      type: "pdf",
      icon: FiFileText,
      title: "PDF Document",
      description:
        "Upload research paper as PDF (text and images will be extracted)",
    },
    {
      type: "arxiv",
      icon: FiGlobe,
      title: "arXiv Import",
      description: "Import paper directly from arXiv using URL",
    },
  ];

  const processingMode = useMemo(() => {
    if (isImportingArxiv || isImportingArxivToVideo) return "importing";
    if (isConvertingVideo) return "video";
    if (isConvertingReel) return "reel";
    if (isConvertingPodcast) return "podcast";
    if (isProcessingUpload) return "processing";
    return null;
  }, [
    isImportingArxiv,
    isImportingArxivToVideo,
    isConvertingVideo,
    isConvertingReel,
    isConvertingPodcast,
    isProcessingUpload,
  ]);

  useEffect(() => {
    if (!processingMode) return;
    const id = requestAnimationFrame(() => {
      const el =
        processingRef.current ||
        document.querySelector("[data-processing-status]");
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [processingMode]);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6"
      >
        <div>
          <div className="grid md:grid-cols-3 gap-4">
            {uploadTypes.map((typeConfig) => (
              <UploadTypeCard
                key={typeConfig.type}
                type={typeConfig.type}
                onSelect={handleSelectType}
                icon={typeConfig.icon}
                title={typeConfig.title}
                description={typeConfig.description}
                isActive={uploadType === typeConfig.type}
                disabled={isAnyProcessing}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {(uploadType === "file" || uploadType === "pdf") && (
            <motion.div
              key={`${uploadType}-upload`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
                  isAnyProcessing ? "opacity-60 pointer-events-none" : ""
                } ${
                  isDragActive && !isDragReject
                    ? "border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                    : isDragReject
                      ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                      : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                }`}
              >
                <input {...getInputProps()} />
                <FiUpload
                  className={`w-12 h-12 mx-auto mb-4 ${
                    isDragReject ? "text-red-400" : "text-gray-400"
                  }`}
                />

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {isDragActive
                    ? isDragReject
                      ? "Invalid file type"
                      : `Drop your ${
                          uploadType === "file" ? "ZIP" : "PDF"
                        } file here`
                    : `Upload ${
                        uploadType === "file" ? "LaTeX Source" : "PDF File"
                      }`}
                </h3>

                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Drag and drop your {uploadType === "file" ? "ZIP" : "PDF"}{" "}
                  file here, or click to browse
                </p>

                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>Maximum file size: 50MB</p>
                  <p>
                    Accepted format: {uploadType === "file" ? "ZIP" : "PDF"}{" "}
                    files only
                  </p>
                </div>
              </div>

              <AnimatePresence>
                {uploadedFile && (
                  <FileDisplay
                    file={uploadedFile}
                    onRemove={handleRemoveFile}
                    disabled={isAnyProcessing}
                  />
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    if (!uploadedFile || isAnyProcessing) return;
                    track("Custom Video Generation Selected", {
                      doc_type:
                        documentType === "patent" ? "patent" : "research_paper",
                      source: uploadType === "file" ? "latex" : "pdf",
                      conversion_choice: "custom",
                      file_name: uploadedFile?.name || null,
                    });
                    setPendingAction("file-video");
                    setLanguageModalOpen(true);
                  }}
                  disabled={!uploadedFile || isAnyProcessing}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                    !uploadedFile || isAnyProcessing
                      ? "bg-gray-400 text-white"
                      : "bg-gray-900 hover:bg-gray-800 text-white"
                  } font-medium transition-colors duration-150`}
                >
                  {isProcessingUpload ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <FiCheck className="w-5 h-5" />
                  )}
                  {isProcessingUpload ? (
                    `Processing ${uploadType === "file" ? "LaTeX" : "PDF"}...`
                  ) : (
                    <>
                      Process {uploadType === "file" ? "LaTeX" : "PDF"} File
                      <br />
                      (custom video generation)
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (!uploadedFile || isAnyProcessing) return;
                    // directly call API with sarvam as tts source
                    track("Custom Video Generation Selected", {
                      doc_type:
                        documentType === "patent" ? "patent" : "research_paper",
                      source: uploadType === "file" ? "latex" : "pdf",
                      conversion_choice: "one_click",
                      file_name: uploadedFile?.name || null,
                      tts_source: "sarvam",
                    });
                    handleConvertVideoWithTts("sarvam");
                  }}
                  disabled={!uploadedFile || isAnyProcessing}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                    !uploadedFile || isAnyProcessing
                      ? "bg-gray-400 text-white"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  } font-medium transition-colors duration-150`}
                >
                  {isConvertingVideo ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <FiCheck className="w-5 h-5" />
                  )}
                  {isConvertingVideo
                    ? "Converting to video..."
                    : "One click to Video"}
                </button>

                {(uploadType === "pdf" || uploadType === "file") && (
                  <>
                    <button
                      onClick={() => {
                        if (!uploadedFile || isAnyProcessing) return;
                        setPendingAction("file-reel");
                        setLanguageModalOpen(true);
                        track("Custom Reel Generation Selected", {
                          doc_type:
                            documentType === "patent"
                              ? "patent"
                              : "research_paper",
                          source: uploadType === "file" ? "latex" : "pdf",
                          conversion_choice: "one_click_reel",
                          file_name: uploadedFile?.name || null,
                        });
                      }}
                      disabled={!uploadedFile || isAnyProcessing}
                      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                        !uploadedFile || isAnyProcessing
                          ? "bg-gray-400 text-white"
                          : "bg-pink-600 hover:bg-pink-500 text-white"
                      } font-medium transition-colors duration-150`}
                    >
                      {isConvertingReel ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <FiCheck className="w-5 h-5" />
                      )}
                      {isConvertingReel
                        ? "Starting reel workflow..."
                        : "Custom Reel Generation"}
                    </button>

                    <button
                      onClick={() => {
                        if (!uploadedFile || isAnyProcessing) return;
                        setPendingAction("file-podcast");
                        setLanguageModalOpen(true);
                        track("Custom Podcast Generation Selected", {
                          doc_type:
                            documentType === "patent"
                              ? "patent"
                              : "research_paper",
                          source: uploadType === "file" ? "latex" : "pdf",
                          conversion_choice: "one_click_podcast",
                          file_name: uploadedFile?.name || null,
                        });
                      }}
                      disabled={!uploadedFile || isAnyProcessing}
                      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                        !uploadedFile || isAnyProcessing
                          ? "bg-gray-400 text-white"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      } font-medium transition-colors duration-150`}
                    >
                      {isConvertingPodcast ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <FiCheck className="w-5 h-5" />
                      )}
                      {isConvertingPodcast
                        ? "Converting to podcast..."
                        : "One click to Podcast"}
                    </button>

                    {uploadType === "pdf" && (
                      <>
                        <button
                          onClick={() => {
                            if (!uploadedFile || isAnyProcessing) return;
                            handleGeneratePoster();
                          }}
                          disabled={!uploadedFile || isAnyProcessing}
                          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                            !uploadedFile || isAnyProcessing
                              ? "bg-gray-400 text-white"
                              : "bg-purple-600 hover:bg-purple-500 text-white"
                          } font-medium transition-colors duration-150`}
                        >
                          {isGeneratingPoster ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <FiCheck className="w-5 h-5" />
                          )}
                          {isGeneratingPoster
                            ? "Generating poster..."
                            : "One click to Poster"}
                        </button>

                        <button
                          onClick={() => {
                            if (!uploadedFile || isAnyProcessing) return;
                            handleGenerateBusinessBrief();
                          }}
                          disabled={!uploadedFile || isAnyProcessing}
                          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                            !uploadedFile || isAnyProcessing
                              ? "bg-gray-400 text-white"
                              : "bg-amber-600 hover:bg-amber-500 text-white"
                          } font-medium transition-colors duration-150`}
                        >
                          {isGeneratingBrief ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <FiCheck className="w-5 h-5" />
                          )}
                          {isGeneratingBrief
                            ? "Processing for brief..."
                            : "Business Brief"}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {streamUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-900 rounded-md p-3 sm:p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm"
                >
                  <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
                    <VideoPlayer
                      src={streamUrl}
                      title="Generated Presentation"
                      paperId={paperId}
                    />
                  </div>
                  <div className="mt-2">
                    <YouTubeLogin />
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {uploadType === "arxiv" && (
            <motion.div
              key="arxiv-input"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  arXiv Paper URL
                </label>
                <input
                  type="url"
                  value={arxivUrl}
                  onChange={(e) => setArxivUrl(e.target.value)}
                  placeholder="https://arxiv.org/abs/2301.00000"
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Enter the URL of an arXiv paper (e.g.,
                  https://arxiv.org/abs/2301.00000)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    if (!arxivUrl.trim() || isAnyProcessing) return;
                    track("Custom Video Generation Selected", {
                      doc_type:
                        documentType === "patent" ? "patent" : "research",
                      source: "arxiv",
                      conversion_choice: "custom",
                      file_name: arxivUrl.slice(0, 200),
                    });
                    setPendingAction("arxiv-video");
                    setLanguageModalOpen(true);
                  }}
                  disabled={!arxivUrl.trim() || isAnyProcessing}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150"
                >
                  {isImportingArxiv ? (
                    <>
                      <LoadingSpinner size="sm" /> Importing...
                    </>
                  ) : (
                    <>
                      {" "}
                      Process arXiv <br /> (custom video generation)
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (!arxivUrl.trim() || isAnyProcessing) return;
                    setPendingAction("arxiv-video");
                    setLanguageModalOpen(true);
                    track("Custom Video Generation Selected", {
                      doc_type:
                        documentType === "patent" ? "patent" : "research_paper",
                      source: "arxiv",
                      conversion_choice: "one_click",
                      file_name: arxivUrl.slice(0, 200),
                      tts_source: "sarvam",
                    });
                  }}
                  disabled={!arxivUrl.trim() || isAnyProcessing}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-400 text-white font-medium transition-colors duration-150"
                >
                  {isImportingArxivToVideo ? (
                    <>
                      <LoadingSpinner size="sm" /> Converting...
                    </>
                  ) : (
                    <>
                      {" "}
                      <FiGlobe className="w-5 h-5" /> One click to Video{" "}
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (!arxivUrl.trim() || isAnyProcessing) return;
                    setPendingAction("arxiv-reel");
                    setLanguageModalOpen(true);
                    track("Custom Reel Generation Selected", {
                      doc_type:
                        documentType === "patent" ? "patent" : "research_paper",
                      source: "arxiv",
                      conversion_choice: "one_click_reel",
                      file_name: arxivUrl.slice(0, 200),
                    });
                  }}
                  disabled={!arxivUrl.trim() || isAnyProcessing}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                    !arxivUrl.trim() || isAnyProcessing
                      ? "bg-gray-400 text-white"
                      : "bg-pink-600 hover:bg-pink-500 text-white"
                  } font-medium transition-colors duration-150`}
                >
                  {isConvertingReel ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <FiCheck className="w-5 h-5" />
                  )}
                  {isConvertingReel
                    ? "Starting reel workflow..."
                    : "Custom Reel Generation"}
                </button>

                <button
                  onClick={() => {
                    if (!arxivUrl.trim() || isAnyProcessing) return;
                    setPendingAction("arxiv-podcast");
                    setLanguageModalOpen(true);
                    track("Custom Podcast Generation Selected", {
                      doc_type:
                        documentType === "patent" ? "patent" : "research_paper",
                      source: "arxiv",
                      conversion_choice: "one_click_podcast",
                      file_name: arxivUrl.slice(0, 200),
                    });
                  }}
                  disabled={!arxivUrl.trim() || isAnyProcessing}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-md ${
                    !arxivUrl.trim() || isAnyProcessing
                      ? "bg-gray-400 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  } font-medium transition-colors duration-150`}
                >
                  {isConvertingPodcast ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <FiCheck className="w-5 h-5" />
                  )}
                  {isConvertingPodcast
                    ? "Converting to podcast..."
                    : "One click to Podcast"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* show progress bar when any long running job is active */}
      {processingMode && !["reel", "podcast"].includes(processingMode) && (
        <div ref={processingRef} data-processing-status>
          <ProcessingStatus
            mode={processingMode}
            pendingAction={pendingAction}
          />
        </div>
      )}

      {/* Language modal used for custom file processing and reel/podcast */}
      <LanguagePickerModal
        open={languageModalOpen}
        title={
          pendingAction && pendingAction.includes("video")
            ? "Select Language for Custom Video Processing"
            : pendingAction && pendingAction.includes("podcast")
              ? "Select Language for Podcast"
              : "Select Language for Reel"
        }
        okLabel={
          pendingAction && pendingAction.includes("video")
            ? "Process File"
            : pendingAction && pendingAction.includes("podcast")
              ? "Generate Podcast"
              : "Custom Reel Generation"
        }
        onClose={() => {
          setLanguageModalOpen(false);
          setPendingAction(null);
        }}
        onPick={(language) => {
          setLanguageModalOpen(false);

          if (
            pendingAction === "file-reel" ||
            pendingAction === "arxiv-reel" ||
            pendingAction === "latex-reel"
          ) {
            handleGenerateReel(language);
          } else if (
            pendingAction === "file-podcast" ||
            pendingAction === "arxiv-podcast" ||
            pendingAction === "latex-podcast"
          ) {
            handleGeneratePodcast(language);
          } else if (pendingAction === "file-video") {
            handleFileUpload(language);
          } else if (pendingAction === "arxiv-video") {
            handleArxivSubmit(language);
          }

          setPendingAction(null);
        }}
      />
    </div>
  );
};

export default PaperUpload;
