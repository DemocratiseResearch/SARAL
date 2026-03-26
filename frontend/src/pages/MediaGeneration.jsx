import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiMic, FiVideo, FiVolume2, FiArrowRight } from "react-icons/fi";
import Layout from "../components/common/Layout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { useWorkflow } from "../contexts/WorkflowContext";
import { apiService } from "../services/api";
import toast from "../services/toastService";
import { useNavigate } from "react-router-dom";
import { TTS_VOICES } from "../utils/constants";
import Analytics from "../lib/analytics";

/* ───────────────── voice selector ───────────────── */
const VoiceSelector = ({ language, value, onChange }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Voice
    </label>
    <select
      value={value}
      onChange={(e) => onChange(language, e.target.value)}
      className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900
                 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                 focus:outline-none focus:ring-2 focus:ring-gray-700"
    >
      {Object.entries(TTS_VOICES[language.toUpperCase()] || {}).map(
        ([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ),
      )}
    </select>
  </div>
);

/* ────────────── custom language dropdown ────────────── */
const LanguageDropdown = ({ languages, value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2 relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Language
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900
                   border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                   text-left focus:outline-none focus:ring-2 focus:ring-gray-700
                   flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {value}
        <span
          className={`transform transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 max-h-56 overflow-auto">
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => {
                onChange(lang);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 hover:bg-black hover:text-white dark:hover:bg-black dark:hover:text-white transition-colors ${
                value === lang
                  ? "font-semibold bg-gray-100 dark:bg-gray-900"
                  : ""
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────── main page ─────────────────────────── */
const SUPPORTED_LANGUAGES = [
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
  "Telugu",
  "Urdu",
  "Sanskrit",
  "Santali",
  "Manipuri",
  "Assamese",
  "Bodo",
  "Dogri",
  "Maithili",
];
const SORTED_LANGUAGES = [...SUPPORTED_LANGUAGES].sort((a, b) =>
  a.localeCompare(b),
);

const getDefaultVoices = () => {
  const defaults = {};
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const voices = Object.keys(TTS_VOICES[lang.toUpperCase()] || {});
    if (voices.length > 0) defaults[lang] = voices[0];
  });
  return defaults;
};

const inferGenderFromVoiceId = (voiceId) => {
  if (!voiceId) return "unknown";
  const v = voiceId.toLowerCase();
  if (
    v.includes("female") ||
    v.includes("_f") ||
    v.endsWith("f") ||
    v.includes("woman")
  )
    return "female";
  if (
    v.includes("male") ||
    v.includes("_m") ||
    v.endsWith("m") ||
    v.includes("man")
  )
    return "male";
  return "unknown";
};

const MediaGeneration = () => {
  const navigate = useNavigate();
  const {
    paperId,
    audioFiles,
    videoPath,
    completedSteps,
    setCaption,
    setAudioFiles,
    setVideoPath,
    markStepCompleted,
    progressToNextStep,
  } = useWorkflow();

  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [voiceSelections, setVoiceSelections] = useState(getDefaultVoices());
  const [selectedLanguage, setSelectedLang] = useState("English");
  const [hinglishIterations, setHinglishIterations] = useState(3);

  const [audioLoading, setAudioLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const hasAudioFiles = audioFiles && audioFiles.length > 0;
  const hasVideoPath = videoPath && videoPath.trim() !== "";
  const mediaGenerated = hasAudioFiles && hasVideoPath;

  // Fetch available languages from API
  useEffect(() => {
    let mounted = true;
    const fetchLanguages = async () => {
      if (!paperId) return;
      try {
        console.log(
          "[MediaGeneration] Fetching available languages for paperId:",
          paperId,
        );
        const response =
          await apiService.getAvailableLanguagesForSlides(paperId);

        if (mounted) {
          let langs = [];
          if (response.data) {
            if (Array.isArray(response.data)) {
              langs = response.data;
            } else if (response.data.languages) {
              langs = Array.isArray(response.data.languages)
                ? response.data.languages
                : [response.data.languages];
            } else if (response.data.language) {
              langs = Array.isArray(response.data.language)
                ? response.data.language
                : [response.data.language];
            }
          }

          if (langs.length > 0) {
            console.log("[MediaGeneration] Available languages:", langs);
            setAvailableLanguages(langs);
            setSelectedLang(langs[0]);
          } else {
            console.warn("[MediaGeneration] No languages found in response");
            setAvailableLanguages(SUPPORTED_LANGUAGES);
          }
        }
      } catch (error) {
        console.error("[MediaGeneration] Failed to fetch languages:", error);
        if (mounted) setAvailableLanguages(SUPPORTED_LANGUAGES);
      }
    };

    fetchLanguages();
    return () => {
      mounted = false;
    };
  }, [paperId]);

  // Auto-redirect when media generation is complete
  useEffect(() => {
    if (mediaGenerated && !audioLoading && !videoLoading) {
      // Small delay to show completion state briefly
      const timer = setTimeout(() => {
        progressToNextStep();
        navigate("/results", { replace: true });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [
    mediaGenerated,
    audioLoading,
    videoLoading,
    navigate,
    progressToNextStep,
  ]);

  /* voice change handler — syncs all languages to the same voice key */
  const changeVoice = (lang, voice) => {
    setVoiceSelections((prev) => {
      // Apply the chosen voice key to every language that supports it;
      // fall back to the language's first available voice if it doesn't.
      const next = { ...prev };
      SUPPORTED_LANGUAGES.forEach((l) => {
        const available = Object.keys(TTS_VOICES[l.toUpperCase()] || {});
        next[l] = available.includes(voice) ? voice : available[0] || prev[l];
      });

      try {
        Analytics.track("TTS Voice Selected", {
          timestamp: new Date().toISOString(),
          paper_id: paperId || null,
          language: lang,
          voice_id: voice,
          inferred_gender: inferGenderFromVoiceId(voice),
        });
      } catch (e) {
        /* ignore */
      }

      return next;
    });
  };

  /* language handler */
  const onLanguageChange = (lang) => {
    setSelectedLang(lang);
    try {
      Analytics.track("TTS Language Selected", {
        timestamp: new Date().toISOString(),
        paper_id: paperId || null,
        selected_language: lang,
        current_voice_for_lang: voiceSelections[lang] || null,
      });
    } catch (e) {
      /* ignore */
    }
  };

  const getVoiceSnapshot = (voiceSelections) => {
    const snapshot = {};
    Object.keys(voiceSelections).forEach((k) => {
      if (voiceSelections[k]) snapshot[k] = voiceSelections[k];
    });
    return snapshot;
  };

  const generateAudio = async () => {
    if (!paperId) return;

    // Track the click with a compact snapshot and gender counts
    try {
      const snapshot = getVoiceSnapshot(voiceSelections);
      const genders = Object.values(snapshot).reduce((acc, v) => {
        const g = inferGenderFromVoiceId(v);
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      }, {});
      Analytics.track("Clicked Generate Audio & Video", {
        timestamp: new Date().toISOString(),
        paper_id: paperId,
        selected_language: selectedLanguage,
        voice_snapshot: snapshot,
        voice_gender_counts: genders,
        hinglish_iterations: hinglishIterations,
      });
    } catch (e) {}

    setAudioLoading(true);
    setProgress(10);

    try {
      const cfg = {
        voice_selection: voiceSelections,
        hinglish_iterations: hinglishIterations,
        selected_language: selectedLanguage,
      };

      const { data } = await apiService.generateAudio(paperId, cfg);
      setAudioFiles(data.audio_files || []);
      setProgress(50);
      setAudioLoading(false); // Mark audio as complete

      // proceed to generate video
      await generateVideo();
    } catch (error) {
      console.error("Audio generation failed:", error);
      toast.error("Audio generation failed");
      setProgress(0);
      setAudioLoading(false);
    }
  };

  const generateVideo = async () => {
    if (!paperId) return;
    setVideoLoading(true);
    setProgress(60);

    try {
      const cfg = { selected_language: selectedLanguage };
      const { data } = await apiService.generateVideo(paperId, cfg);

      console.log("🎥 generateVideo response:", data);
      console.log("📝 caption:", data?.caption);

      setVideoPath(data.video_path);
      setCaption(data.caption);

      // TEMP: store caption locally to confirm
      sessionStorage.setItem("debug_caption", data?.caption);

      markStepCompleted(5);
      setProgress(100);
      toast.success("Video created successfully!");
    } catch (error) {
      console.error("Video generation failed:", error);
      toast.error("Video generation failed");
    } finally {
      setVideoLoading(false);
    }
  };

  const crumbs = [{ label: "Media Generation", href: "/media-generation" }];
  if (!paperId) {
    return (
      <Layout title="" breadcrumbs={crumbs}>
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">
          Upload a paper and create slides first.
        </div>
      </Layout>
    );
  }

  return (
    <Layout breadcrumbs={crumbs}>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Generate Audio & Video
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {mediaGenerated
              ? "Your audio and video have been generated successfully!"
              : "Click once – the system narrates your slides and builds the video automatically."}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6"
        >
          {(audioLoading || videoLoading) && (
            <div className="h-2 w-full bg-gray-900 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-blue-600 dark:bg-gray-900 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {mediaGenerated && !audioLoading && !videoLoading && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <FiVideo className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                    Media Generation Complete
                  </h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Redirecting to results...
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={mediaGenerated ? "opacity-50" : ""}>
            <VoiceSelector
              language={selectedLanguage}
              value={voiceSelections[selectedLanguage]}
              onChange={changeVoice}
            />

            {/* <LanguageDropdown
              languages={availableLanguages.length > 0 ? availableLanguages : SORTED_LANGUAGES}
              value={selectedLanguage}
              onChange={onLanguageChange}
              disabled={mediaGenerated}
            /> */}
          </div>

          {!mediaGenerated && (
            <button
              onClick={generateAudio}
              disabled={audioLoading || videoLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3
                         rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400
                         text-white font-medium transition-colors duration-150"
            >
              {audioLoading || videoLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  {videoLoading ? "Building video…" : "Generating audio…"}
                </>
              ) : (
                <>
                  <FiMic className="w-5 h-5" />
                  Generate Audio & Video
                </>
              )}
            </button>
          )}

          {(hasAudioFiles || hasVideoPath) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div
                className={`flex items-center gap-2 text-sm ${hasAudioFiles ? "text-gray-600 dark:text-gray-400" : "text-neutral-400"}`}
              >
                <FiMic className="w-4 h-4" />
                <span>Audio: {hasAudioFiles ? "Generated" : "Pending"}</span>
              </div>
              <div
                className={`flex items-center gap-2 text-sm ${hasVideoPath ? "text-gray-600 dark:text-gray-400" : "text-neutral-400"}`}
              >
                <FiVideo className="w-4 h-4" />
                <span>Video: {hasVideoPath ? "Generated" : "Pending"}</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
};

export default MediaGeneration;
