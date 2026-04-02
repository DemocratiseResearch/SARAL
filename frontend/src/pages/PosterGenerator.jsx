import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars
import { FiUpload, FiDownload, FiCheck, FiCpu, FiX } from "react-icons/fi";
import Layout from "../components/common/Layout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { apiService } from "../services/api";
import toast from "../services/toastService";
import { useDropzone } from "react-dropzone";

import { useLocation } from "react-router-dom";

const PosterGenerator = () => {
  const location = useLocation();
  const [file, setFile] = useState(location.state?.fileToGenerate || null);
  const [venue, setVenue] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(location.state?.result || null);
  const [autoStarted, setAutoStarted] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const isSubmitting = useRef(false);

  const progressInterval = useRef(null);

  const onDrop = (acceptedFiles) => {
    if (acceptedFiles?.length > 0) {
      setFile(acceptedFiles[0]);
      setResult(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  const startFakeProgress = () => {
    setProgress(0);
    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 2; // Increment by 0-5% randomly
      });
    }, 1000);
  };

  const stopFakeProgress = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setProgress(100);
  };

  const handleGenerate = async (fileToUse, template = "default") => {
    if (isSubmitting.current) return;

    const targetFile = fileToUse || file;
    if (!targetFile) {
      toast.error("Please upload a PDF first.");
      return;
    }

    isSubmitting.current = true;
    setLoading(true);
    setShowTemplateModal(false);
    startFakeProgress();

    try {
      const response = await apiService.generatePoster(
        targetFile,
        venue,
        template,
      );
      console.log("Poster Generation Result:", response.data);
      setResult(response.data);
      toast.success("Poster generated successfully!");
    } catch (error) {
      console.error("Poster generation failed:", error);
      toast.error("Failed to generate poster. See console for details.");
    } finally {
      stopFakeProgress();
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  const openTemplateModal = () => {
    if (!file) {
      toast.error("Please upload a PDF first.");
      return;
    }
    setShowTemplateModal(true);
  };

  // Auto-start generation if file was passed from PaperUpload
  useEffect(() => {
    if (location.state?.fileToGenerate && !autoStarted && !result) {
      setAutoStarted(true);
      setShowTemplateModal(true);
    }
  }, [location.state?.fileToGenerate, autoStarted, result]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            One Click Poster Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Turn your research paper into a conference-ready poster instantly
            using Gemini.
          </p>
        </motion.div>

        {!result && (
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-8">
            {/* Upload Area */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                ${isDragActive ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-gray-300 dark:border-gray-600 hover:border-brand-400"}
              `}
            >
              <input {...getInputProps()} />
              <FiUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {file ? (
                <div>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-200">
                    {file.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p className="text-brand-600 mt-2 font-medium">
                    Click or Drag to replace
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                    Drag & drop your paper PDF here
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    or click to browse
                  </p>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="mt-8">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Conference Venue / Date (Optional)
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. NeurIPS 2024, Vancouver"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none transition-shadow"
              />
            </div>

            {/* Action */}
            <div className="mt-8 flex justify-center">
              <button
                onClick={openTemplateModal}
                disabled={loading || !file}
                className="btn-primary w-full md:w-auto px-8 py-3 text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Generating... {Math.round(progress)}%
                  </>
                ) : (
                  <>
                    <FiCpu className="w-5 h-5" />
                    Generate Poster
                  </>
                )}
              </button>
            </div>

            {/* Loading Bar */}
            {loading && (
              <div className="mt-6">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-brand-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-center text-sm text-gray-500 mt-2 animate-pulse">
                  Parsing paper, analyzing content, designing layout...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Result View */}
        {result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-8 text-center"
          >
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <FiCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Poster Generated!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Your poster has been created successfully.
            </p>

            <div className="flex flex-col md:flex-row gap-4 justify-center">
                <a
                  href={apiService.getPosterDownloadUrl(result.pdf_path)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  <FiDownload className="w-5 h-5" />
                  Download Poster PDF
                </a>
              <button
                onClick={() => setResult(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:underline mt-4 md:mt-0"
              >
                Create Another
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Template Selection Modal */}
      <AnimatePresence>
        {showTemplateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 p-8 w-full max-w-md relative"
            >
              <button
                onClick={() => setShowTemplateModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Choose a Poster Template
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                Select the template style for your poster generation.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Default Template */}
                <button
                  onClick={() => handleGenerate(file, "default")}
                  className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 dark:border-neutral-600 hover:border-brand-500 dark:hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all"
                >
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                    <FiDownload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      Default
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Outputs a{" "}
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        .pdf
                      </span>{" "}
                      poster
                    </p>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
};

export default PosterGenerator;
