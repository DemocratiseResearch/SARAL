// src/pages/SlideCreation.jsx
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  FiSliders,
  FiDownload,
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
  FiArrowLeft,
  FiAlertCircle,
} from "react-icons/fi";
import Layout from "../components/common/Layout";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { useWorkflow } from "../contexts/WorkflowContext";
import { apiService } from "../services/api";
import { downloadBlob } from "../utils/helpers";
import toast from "../services/toastService";
import Analytics from "../lib/analytics";

const SlidePreview = ({ slides, current, setCurrent }) => {
  if (!slides?.length) return null;
  return (
    <div className="space-y-3">
      <div className="relative aspect-video bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm overflow-hidden">
        <img
          src={slides[current]}
          alt={`Slide ${current + 1}`}
          className="w-full h-full object-contain"
        />
        {slides.length > 1 && (
          <>
            <button
              onClick={() => setCurrent(Math.max(0, current - 1))}
              disabled={current === 0}
              className="absolute inset-y-0 left-0 w-10 flex items-center justify-center text-white bg-gradient-to-r from-black/20 to-transparent hover:from-black/30 disabled:opacity-30 transition"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() =>
                setCurrent(Math.min(slides.length - 1, current + 1))
              }
              disabled={current === slides.length - 1}
              className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-white bg-gradient-to-l from-black/20 to-transparent hover:from-black/30 disabled:opacity-30 transition"
            >
              <FiChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2.5 h-2.5 rounded-full transition ${i === current ? "bg-gray-900 dark:bg-gray-100" : "bg-gray-400 hover:bg-gray-500 dark:bg-gray-600 dark:hover:bg-gray-500"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SlideCreation = () => {
  const { paperId, slides, setSlides, progressToNextStep } = useWorkflow();
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [metadata, setMetadata] = useState(null);
  const [downPdf, setDownPdf] = useState(false);
  const [downLatex, setDownLatex] = useState(false);
  const [downPpt, setDownPpt] = useState(false);
  const [pptResp, setPptResp] = useState(null);
  const [pptPath, setPptPath] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [fetchingPdfBlob, setFetchingPdfBlob] = useState(false);
  const [format, setFormat] = useState(() => {
    const stored = sessionStorage.getItem("presentation_format");
    return stored === "powerpoint" ? "powerpoint" : "beamer";
  });

  const autoGenerateRef = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("presentation_format");
    setFormat(stored === "powerpoint" ? "powerpoint" : "beamer");
    autoGenerateRef.current = false;
  }, [paperId]);

  useEffect(() => {
    const stored = sessionStorage.getItem("presentation_format");
    setFormat(stored === "powerpoint" ? "powerpoint" : "beamer");
  }, []);

  useEffect(() => {
    const nothingToShow =
      format === "powerpoint" ? !pptPath : !slides || slides.length === 0;
    if (!paperId) return;
    if (loading) return;
    if (autoGenerateRef.current) return;
    if (nothingToShow) {
      autoGenerateRef.current = true;
      genSlides();
    }
  }, [paperId, slides, loading, format, pptPath]);

  useEffect(() => {
    if (!paperId || format !== "powerpoint") return;
    let cancelled = false;
    let objectUrl = null;

    const fetchPdfAsBlob = async () => {
      setFetchingPdfBlob(true);
      try {
        const resp = await apiService.httpClient.get(
          `/slides/${paperId}/view-pdf`,
          {
            responseType: "blob",
          },
        );
        const blob = new Blob([resp.data], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setPdfBlobUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) setPdfBlobUrl(null);
      } finally {
        if (!cancelled) setFetchingPdfBlob(false);
      }
    };

    fetchPdfAsBlob();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [paperId, format]);

  const genSlides = async (overrideFormat = null) => {
    if (!paperId) return;
    const useFormat = overrideFormat || format || "beamer";
    const storedLanguage =
      sessionStorage.getItem("slide_language") || undefined;
    setLoading(true);
    try {
      const genResp = await apiService.generateSlides(
        paperId,
        useFormat,
        undefined,
        storedLanguage,
      );
      if (useFormat === "powerpoint") {
        const data = genResp?.data ?? genResp;
        setPptResp(data);
        const serverPptPath =
          data?.pptx_path ?? data?.ppt_path ?? data?.pdf_path ?? null;
        if (serverPptPath) setPptPath(serverPptPath);
        try {
          const previewResp = await apiService.getSlidePreview(paperId);
          const urls = (previewResp.data.images || []).map((img) =>
            apiService.getSlideImageUrl(paperId, img),
          );
          setSlides(urls);
          setCurrentSlide(0);
        } catch (e) {
          console.warn("No preview images for PPT flow", e);
        }
      } else {
        const previewResp = await apiService.getSlidePreview(paperId);
        const urls = (previewResp.data.images || []).map((img) =>
          apiService.getSlideImageUrl(paperId, img),
        );
        setSlides(urls);
        setCurrentSlide(0);
        toast.success(
          `${urls.length} slide${urls.length === 1 ? "" : "s"} generated`,
        );
      }
      try {
        Analytics.track("Slides Generation Succeeded", {
          timestamp: new Date().toISOString(),
          paper_id: paperId,
          format: useFormat,
          slides_generated: Array.isArray(slides) ? slides.length : undefined,
        });
      } catch (e) {}
    } catch (error) {
  console.error('Slide generation failed:', error);
  const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to generate slides';
  toast.error(errorMessage);
      try {
        Analytics.track("Slides Generation Failed", {
          timestamp: new Date().toISOString(),
          paper_id: paperId,
          format: useFormat,
          error_message: error?.message || String(error),
        });
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  const dlPdf = async () => {
    if (!paperId) return;
    setDownPdf(true);
    try {
      const resp = await apiService.downloadSlides(paperId);
      downloadBlob(resp.data, `slides_${paperId}.pdf`);
      toast.success("PDF downloaded");
      try {
        Analytics.track("Downloaded Slides PDF", {
          timestamp: new Date().toISOString(),
          paper_id: paperId,
          file_name: `slides_${paperId}.pdf`,
          format,
        });
      } catch (e) {}
    } catch (error) {
      console.error("PDF download failed:", error);
      toast.error("Failed to download PDF");
    } finally {
      setDownPdf(false);
    }
  };

  const dlLatex = async () => {
    if (!paperId) return;
    setDownLatex(true);
    try {
      const resp = await apiService.downloadLatexSource(paperId);
      downloadBlob(resp.data, `slides_${paperId}.tex`);
      toast.success("LaTeX downloaded");
      try {
        Analytics.track("Downloaded LaTeX Source", {
          timestamp: new Date().toISOString(),
          paper_id: paperId,
          file_name: `slides_${paperId}.tex`,
          format,
        });
      } catch (e) {}
    } catch (error) {
      console.error("LaTeX download failed:", error);
      toast.error("Failed to download LaTeX");
    } finally {
      setDownLatex(false);
    }
  };

  const dlPpt = async () => {
    if (!paperId) return;
    setDownPpt(true);
    try {
      const resp = await apiService.downloadPowerpoint(paperId);
      downloadBlob(resp.data, `slides_${paperId}.pptx`);
      toast.success("PPT downloaded");
      try {
        Analytics.track("Downloaded PPT", {
          timestamp: new Date().toISOString(),
          paper_id: paperId,
          file_name: `slides_${paperId}.pptx`,
          format,
        });
      } catch (e) {}
    } catch (error) {
      console.error("PPT download failed:", error);
      toast.error("Failed to download PPT");
    } finally {
      setDownPpt(false);
    }
  };

  useEffect(() => {
    const noSlides = !slides || slides.length === 0;
    if (
      paperId &&
      format === "powerpoint" &&
      !loading &&
      !autoGenerateRef.current
    ) {
      autoGenerateRef.current = true;
      genSlides("powerpoint");
    }
  }, [paperId, format]);

  const isPpt = format === "powerpoint";
  const crumbs = [
    {
      label: isPpt ? "PowerPoint Creation" : "Slide Creation",
      href: "/slide-creation",
    },
  ];

  if (!paperId) {
    return (
      <Layout title={crumbs[0].label} breadcrumbs={crumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-12 border border-neutral-200 dark:border-neutral-700 text-center"
          >
            <FiAlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Slides Available
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please generate slides first.
            </p>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium transition-colors duration-150"
            >
              Go Back
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="" breadcrumbs={crumbs}>
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-neutral-800 rounded-xl p-12 border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center"
          >
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              {isPpt ? "Generating PowerPoint..." : "Generating slides..."}
            </p>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="" breadcrumbs={crumbs}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {isPpt ? "Generated PowerPoint" : "Generated Presentation Slides"}
            </h2>
            {metadata?.title && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {metadata.title}
              </p>
            )}
          </div>

          <button
            onClick={() => progressToNextStep()}
            className="flex items-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium transition-colors duration-150"
          >
            <FiArrowRight className="w-5 h-5" /> Continue to Audio & Video
          </button>
        </motion.div>

        {/* Preview Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 space-y-6"
        >
          {!isPpt && slides?.length > 0 ? (
            <SlidePreview
              slides={slides}
              current={currentSlide}
              setCurrent={setCurrentSlide}
            />
          ) : isPpt && fetchingPdfBlob ? (
            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg flex flex-col items-center justify-center gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Please wait, fetching PDF preview...
              </p>
            </div>
          ) : isPpt && pdfBlobUrl ? (
            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
              <iframe
                title="PPT PDF preview"
                src={pdfBlobUrl}
                style={{ width: "100%", height: "100%", border: 0 }}
              />
            </div>
          ) : (
            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg flex items-center justify-center">
              <p className="text-sm text-gray-500">Preview not available</p>
            </div>
          )}

          {metadata && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              {metadata.authors && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Authors:</span>{" "}
                  {metadata.authors}
                </p>
              )}
              {metadata.date && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Date:</span> {metadata.date}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {!isPpt ? (
              <>
                <button
                  onClick={dlPdf}
                  disabled={downPdf}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150 disabled:cursor-not-allowed"
                >
                  {downPdf ? (
                    <>
                      <LoadingSpinner size="sm" /> Downloading...
                    </>
                  ) : (
                    <>
                      <FiDownload className="w-5 h-5" /> Download PDF
                    </>
                  )}
                </button>
                <button
                  onClick={dlLatex}
                  disabled={downLatex}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150 disabled:cursor-not-allowed"
                >
                  {downLatex ? (
                    <>
                      <LoadingSpinner size="sm" /> Downloading...
                    </>
                  ) : (
                    <>
                      <FiDownload className="w-5 h-5" /> Download LaTeX
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={dlPpt}
                disabled={downPpt}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium transition-colors duration-150 disabled:cursor-not-allowed"
              >
                {downPpt ? (
                  <>
                    <LoadingSpinner size="sm" /> Downloading...
                  </>
                ) : (
                  <>
                    <FiDownload className="w-5 h-5" /> Download PPT
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default SlideCreation;
