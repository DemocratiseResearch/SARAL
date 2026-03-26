import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ReelScriptReview from "../components/workflow/ReelScriptReview";
import ReelScriptEditor from "../components/workflow/ReelScriptEditor";
import ReelAvatarSelector from "../components/workflow/ReelAvatarSelector";
import ReelProgress from "../components/workflow/ReelProgress";
import { useWorkflow } from "../contexts/WorkflowContext";
import { apiService } from "../services/api";
import toast from '../services/toastService';
import Layout from "../components/common/Layout";

const ReelScriptEditorPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { paperId: ctxPaperId } = useWorkflow();

  const [paperId, setPaperId] = useState(ctxPaperId || null);
  const [currentStep, setCurrentStep] = useState("review"); // review | edit | avatars | progress
  const [scriptData, setScriptData] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Scroll to top whenever step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // Get paperId from URL, context, or sessionStorage
  useEffect(() => {
    const initializePaperId = async () => {
      try {
        // Try to get from URL params first
        const params = new URLSearchParams(location.search);
        const urlPaperId = params.get("paperId");

        // Then try context
        let pId = urlPaperId || ctxPaperId;

        // Finally try sessionStorage
        if (!pId) {
          pId = sessionStorage.getItem("paperId");
        }

        if (!pId) {
          console.warn("No paper ID found in URL, context, or sessionStorage");
          toast.error("No paper ID found. Please upload a paper first.");
          navigate("/paper-processing");
          setIsInitializing(false);
          return;
        }

        console.log("ReelScriptEditorPage initialized with paperId:", pId);
        setPaperId(pId);
        setIsInitializing(false);
      } catch (error) {
        console.error("Error initializing paperId:", error);
        toast.error("Error loading reel editor");
        navigate("/paper-processing");
        setIsInitializing(false);
      }
    };

    initializePaperId();
  }, [ctxPaperId, location, navigate]);

  const crumbs = [{ label: 'Reel Generation', href: '/reel-script-editor' }];

  if (isInitializing || !paperId) {
    return (
      <div className="min-h-screen dark:bg-black">
        <Layout breadcrumbs={crumbs}>
          <div className="flex justify-center items-center h-screen">
            <div className="text-center">
              <p className="text-gray-500">Initializing reel editor...</p>
            </div>
          </div>
        </Layout>
      </div>
    );
  }

  const handleEditClick = async () => {
    setCurrentStep("edit");
  };

  const handleScriptSave = (editedScript) => {
    setScriptData(editedScript);
    setCurrentStep("review");
  };

  const handleNextToAvatars = () => {
    setCurrentStep("avatars");
  };

  const handleBackFromAvatars = () => {
    setCurrentStep("review");
  };

  const handleGenerateReel = async () => {
    // Call finalize endpoint to start video generation
    try {
      await apiService.reel.finalize(paperId);
      setCurrentStep("progress");
    } catch (error) {
      toast.error("Failed to start reel finalization");
      console.error("Finalize error:", error);
    }
  };

  const handleProgressComplete = () => {
    sessionStorage.setItem("paperId", paperId);
    navigate("/reel-display");
  };

  const handleProgressError = (error) => {
    toast.error("Reel generation failed");
    console.error("Progress error:", error);
  };

  return (
    <div className="min-h-screen dark:bg-black">
      <Layout breadcrumbs={crumbs}>
        {/* Main Content */}

        {currentStep === "review" && (
          <ReelScriptReview
            paperId={paperId}
            script={scriptData.length > 0 ? scriptData : undefined}
            onEdit={handleEditClick}
            onNext={handleNextToAvatars}
            onError={(err) => {
              toast.error("Failed to load script");
              navigate("/paper-processing");
            }}
          />
        )}

        {currentStep === "edit" && (
          <ReelScriptEditor
            paperId={paperId}
            initialScript={scriptData}
            onSave={handleScriptSave}
            onCancel={() => setCurrentStep("review")}
          />
        )}

        {currentStep === "avatars" && (
          <ReelAvatarSelector
            paperId={paperId}
            onBack={handleBackFromAvatars}
            onGenerate={handleGenerateReel}
          />
        )}

        {currentStep === "progress" && (
          <ReelProgress
            paperId={paperId}
            onComplete={handleProgressComplete}
            onError={handleProgressError}
          />
        )}

        {/* Fallback - if somehow no step matches, show review */}
        {!["review", "edit", "avatars", "progress"].includes(currentStep) && (
          <ReelScriptReview
            paperId={paperId}
            script={scriptData.length > 0 ? scriptData : undefined}
            onEdit={handleEditClick}
            onNext={handleNextToAvatars}
            onError={(err) => {
              toast.error("Failed to load script");
              navigate("/paper-processing");
            }}
          />
        )}
      </Layout>
    </div>
  );
};

export default ReelScriptEditorPage;