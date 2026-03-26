import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FiDownload } from "react-icons/fi";
import BusinessBriefReview from "../components/workflow/BusinessBriefReview";
import BusinessBriefEditor from "../components/workflow/BusinessBriefEditor";
import { useWorkflow } from "../contexts/WorkflowContext";
import { apiService } from "../services/api";
import toast from "../services/toastService";
import Layout from "../components/common/Layout";
import LoadingSpinner from "../components/common/LoadingSpinner";

const BusinessBriefPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { paperId: ctxPaperId } = useWorkflow();

  const [paperId, setPaperId] = useState(ctxPaperId || null);
  const [currentStep, setCurrentStep] = useState("loading"); // loading | review | edit | pdf
  const [sections, setSections] = useState({});
  const [isInitializing, setIsInitializing] = useState(true);

  // PDF viewer state
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Scroll to top whenever step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        window.URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // Initialize paperId
  useEffect(() => {
    const initializePaperId = async () => {
      try {
        const params = new URLSearchParams(location.search);
        const urlPaperId = params.get("paperId");

        let pId = urlPaperId || ctxPaperId;

        if (!pId) {
          pId = sessionStorage.getItem("paperId");
        }

        if (!pId) {
          console.warn("No paper ID found");
          toast.error("No paper ID found. Please upload a paper first.");
          navigate("/paper-processing");
          setIsInitializing(false);
          return;
        }

        console.log("BusinessBriefPage initialized with paperId:", pId);
        setPaperId(pId);
        setIsInitializing(false);
      } catch (error) {
        console.error("Error initializing paperId:", error);
        toast.error("Error loading business brief");
        navigate("/paper-processing");
        setIsInitializing(false);
      }
    };

    initializePaperId();
  }, [ctxPaperId, location, navigate]);

  // Generate business brief and fetch sections once paperId is set
  useEffect(() => {
    if (!paperId || isInitializing) return;

    const generateAndFetch = async () => {
      setCurrentStep("loading");
      try {
        // First generate the brief
        console.log("[BusinessBriefPage] Generating business brief...");
        await apiService.generateBusinessBrief(paperId);

        // Then fetch the sections
        console.log("[BusinessBriefPage] Fetching sections...");
        const resp = await apiService.getBusinessBriefSections(paperId);
        const sectionsData = resp?.data?.sections || {};

        if (Object.keys(sectionsData).length > 0) {
          setSections(sectionsData);
          setCurrentStep("review");
        } else {
          toast.error("Business brief generated but no sections found");
          setCurrentStep("review");
        }
      } catch (error) {
        console.error("[BusinessBriefPage] Error:", error);
        toast.error(
          error.response?.data?.detail ||
            "Failed to generate business brief",
        );
        navigate("/paper-processing");
      }
    };

    generateAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, isInitializing]);

  const handleEditClick = () => {
    setCurrentStep("edit");
  };

  const handleEditSave = (updatedSections) => {
    setSections(updatedSections);
    setCurrentStep("review");
  };

  const handleEditCancel = () => {
    setCurrentStep("review");
  };

  const handleShowPdf = async () => {
    setIsLoadingPdf(true);
    try {
      const resp = await apiService.downloadBusinessBriefPdf(paperId);
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      setCurrentStep("pdf");
    } catch (error) {
      console.error("[BusinessBriefPage] PDF download error:", error);
      toast.error("Failed to generate business brief PDF");
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfBlobUrl) return;
    const link = document.createElement("a");
    link.href = pdfBlobUrl;
    link.setAttribute("download", "business_brief.pdf");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Business brief downloaded!");
  };

  const crumbs = [{ label: "Business Brief", href: "/business-brief" }];

  if (isInitializing || !paperId) {
    return (
      <div className="min-h-screen dark:bg-black">
        <Layout breadcrumbs={crumbs}>
          <div className="flex justify-center items-center h-screen">
            <div className="text-center">
              <p className="text-gray-500">
                Initializing business brief...
              </p>
            </div>
          </div>
        </Layout>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-black">
      <Layout breadcrumbs={crumbs}>
        {/* Loading / Generating */}
        {currentStep === "loading" && (
          <div className="max-w-3xl mx-auto pt-5 px-4 pb-20">
            <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 dark:border-neutral-600 dark:border-t-white rounded-full animate-spin" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Generating business brief…
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Review */}
        {currentStep === "review" && (
          <BusinessBriefReview
            sections={sections}
            onEdit={handleEditClick}
            onShowPdf={handleShowPdf}
          />
        )}

        {/* Edit */}
        {currentStep === "edit" && (
          <BusinessBriefEditor
            paperId={paperId}
            sections={sections}
            onSave={handleEditSave}
            onCancel={handleEditCancel}
          />
        )}

        {/* PDF Viewer */}
        {currentStep === "pdf" && (
          <div className="max-w-4xl mx-auto pt-5 px-4 pb-20">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Business Brief PDF
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Preview and download your business brief.
                </p>
              </div>

              {/* Embedded PDF */}
              <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                {pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    title="Business Brief PDF"
                    className="w-full"
                    style={{ height: "75vh", border: "none" }}
                  />
                ) : (
                  <div className="flex items-center justify-center py-20">
                    <LoadingSpinner size="lg" />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setCurrentStep("review")}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium transition-colors"
                >
                  Back to Review
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={!pdfBlobUrl}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-black dark:bg-slate-800 dark:hover:bg-slate-700 hover:bg-gray-800 text-white font-medium transition-colors disabled:opacity-50"
                >
                  <FiDownload className="w-5 h-5" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading PDF overlay */}
        {isLoadingPdf && currentStep === "review" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 flex items-center gap-3 shadow-lg">
              <LoadingSpinner size="md" />
              <span className="text-gray-700 dark:text-gray-300">
                Generating PDF…
              </span>
            </div>
          </div>
        )}
      </Layout>
    </div>
  );
};

export default BusinessBriefPage;
