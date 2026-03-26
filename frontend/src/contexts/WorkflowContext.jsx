import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiService } from "../services/api";
import toast from "../services/toastService";

/* ─────────────────────────── setup ─────────────────────────── */

const WorkflowContext = createContext();

const initialState = {
  currentStep: 1,
  completedSteps: [],
  paperId: null,
  isProcessed: false,
  sessionId: null,
  caption: null,
  metadata: { title: "", authors: "", date: "" },
  scripts: {},
  editedScripts: {},
  bulletPoints: {},
  images: [],
  selectedImages: {},
  slides: [],
  audioFiles: [],
  videoPath: null,
  isLoading: false,
  error: null,
  autoProgress: true,
  manualNavigation: false,
  documentType: null,
  selectedVoice: null,
  audienceLevel: null,
};

/* map step → route once so every effect can reuse it */
const stepRoutes = {
  1: "/api-setup",
  2: "/paper-processing",
  3: "/script-generation",
  4: "/slide-creation",
  5: "/media-generation",
  6: "/results",
};

/* list of URLs that belong to the linear workflow */
const workflowPaths = Object.values(stepRoutes);

/* ────────────────────────── reducer ─────────────────────────── */

const workflowReducer = (state, action) => {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload, isLoading: false };

    case "SET_STEP":
      return {
        ...state,
        currentStep: action.payload,
        manualNavigation: true,
        autoProgress: false,
      };

    case "PROGRESS_TO_NEXT_STEP": {
      const next = Math.min(state.currentStep + 1, 6);
      const finished = [
        ...new Set([...state.completedSteps, state.currentStep]),
      ];
      return {
        ...state,
        currentStep: next,
        completedSteps: finished,
        autoProgress: true,
        manualNavigation: false,
      };
    }

    case "MARK_STEP_COMPLETED":
      return {
        ...state,
        completedSteps: [...new Set([...state.completedSteps, action.payload])],
      };

    case "SET_PAPER_ID":
      return { ...state, paperId: action.payload };
    case "SET_SESSION_ID":
      return { ...state, sessionId: action.payload };
    case "SET_METADATA":
      return { ...state, metadata: { ...state.metadata, ...action.payload } };
    case "SET_IS_PROCESSED":
      return { ...state, isProcessed: !!action.payload };

    case "SET_SCRIPTS":
      return {
        ...state,
        scripts: action.payload || {},
        editedScripts: action.payload || {},
      };
    case "SET_EDITED_SCRIPTS":
      return { ...state, editedScripts: action.payload || {} };
    case "SET_BULLET_POINTS":
      return { ...state, bulletPoints: action.payload || {} };

    case "UPDATE_SCRIPT":
      return {
        ...state,
        editedScripts: {
          ...state.editedScripts,
          [action.payload.section]: action.payload.script,
        },
      };
    case "UPDATE_BULLET_POINTS":
      return {
        ...state,
        bulletPoints: {
          ...state.bulletPoints,
          [action.payload.section]: action.payload.bullets,
        },
      };

    case "SET_IMAGES":
      return { ...state, images: action.payload || [] };
    case "SET_SELECTED_IMAGE":
      return {
        ...state,
        selectedImages: {
          ...state.selectedImages,
          [action.payload.section]: action.payload.image,
        },
      };

    case "SET_SLIDES":
      return { ...state, slides: action.payload || [] };
    case "SET_CAPTION":
      return { ...state, caption: action.payload };

    case "SET_AUDIO_FILES":
      return { ...state, audioFiles: action.payload || [] };
    case "SET_VIDEO_PATH":
      return { ...state, videoPath: action.payload };

    case "PROCESS_UPLOAD_SUCCESS":
      // payload: { paperId, documentType, metadata, images }
      return {
        ...state,
        paperId: action.payload.paperId ?? state.paperId,
        documentType: action.payload.documentType ?? state.documentType,
        metadata: action.payload.metadata ?? state.metadata,
        images: action.payload.images ?? state.images,
        isProcessed: true,
        // optionally move user to paper-processing step if not already
        currentStep: Math.max(state.currentStep, 2),
        completedSteps: [...new Set([...state.completedSteps, 1])],
      };

    case "ENABLE_AUTO_PROGRESS":
      return { ...state, autoProgress: true, manualNavigation: false };
    case "DISABLE_AUTO_PROGRESS":
      return { ...state, autoProgress: false, manualNavigation: true };

    case "SET_AUDIENCE_LEVEL":
      return { ...state, audienceLevel: action.payload };

    case "RESET_WORKFLOW":
      return { ...initialState };

    default:
      return state;
  }
};

/* ─────────────────────── custom hook ────────────────────────── */

export const useWorkflow = () => {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
};

/* ─────────────────────── provider ───────────────────────────── */

export const WorkflowProvider = ({ children }) => {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const navigate = useNavigate();
  const location = useLocation();

  /* -------- 1° check that stored paper still exists -------- */
  // Track if this is a fresh upload to avoid verification race condition
  const isRecentUploadRef = useRef(false);
  const lastPaperIdRef = useRef(null);

  useEffect(() => {
    const verifyPaperExists = async () => {
      if (!state.paperId) return;

      // Skip verification immediately after setting paper ID from upload
      // to avoid race condition where metadata endpoint isn't ready yet
      if (isRecentUploadRef.current) {
        console.log("Skipping verification for recent upload");
        isRecentUploadRef.current = false;
        return;
      }

      try {
        // if your API accepts documentType, keep it; otherwise call with single arg
        const exists = await apiService.checkPaperExists(
          state.paperId,
          state.documentType,
        );

        // if backend returned "false" explicitly → treat as not found
        if (exists === false) {
          // wipe workflow bits
          dispatch({ type: "SET_PAPER_ID", payload: null });
          dispatch({ type: "SET_METADATA", payload: initialState.metadata });
          dispatch({ type: "SET_SCRIPTS", payload: {} });
          dispatch({ type: "SET_EDITED_SCRIPTS", payload: {} });
          dispatch({ type: "SET_BULLET_POINTS", payload: {} });
          dispatch({ type: "SET_IMAGES", payload: [] });
          dispatch({ type: "SET_SELECTED_IMAGE", payload: {} });
          dispatch({ type: "SET_IS_PROCESSED", payload: false });
          dispatch({ type: "SET_STEP", payload: 2 });

          if (workflowPaths.includes(location.pathname)) {
            toast.error(
              "Previous session could not be loaded. Please upload your paper again.",
            );
            navigate("/paper-processing");
          }
        }

        // if exists === true or any truthy value, just continue silently
      } catch (err) {
        // NETWORK / CORS / 500 errors land here.
        // Don't wipe the session for transient errors. Log for debugging.
        console.warn(
          "verifyPaperExists: could not verify paper (network/server).",
          err,
        );

        // Optional: show a small non-blocking toast so user knows server unreachable
        // toast.error('Could not reach backend to verify previous session (server unreachable).');

        // DO NOT reset workflow — let the user continue. The server team should fix CORS/500.
      }
    };

    // Only verify if paper ID actually changed (not just a re-render)
    if (state.paperId !== lastPaperIdRef.current) {
      verifyPaperExists();
      lastPaperIdRef.current = state.paperId;
    }
  }, [state.paperId, state.documentType, location.pathname, navigate]);

  /* -------- 2° auto-progress inside the workflow -------- */
  useEffect(() => {
    // Ignore non-workflow pages like /about or /login
    if (!workflowPaths.includes(location.pathname)) return;

    if (!state.autoProgress || state.manualNavigation) return;

    const targetRoute = stepRoutes[state.currentStep];
    if (targetRoute && location.pathname !== targetRoute) {
      navigate(targetRoute, { replace: true });
      // stop autoProgress after the redirect to avoid an infinite loop
      setTimeout(() => dispatch({ type: "DISABLE_AUTO_PROGRESS" }), 500);
    }
  }, [
    state.currentStep,
    state.autoProgress,
    state.manualNavigation,
    location.pathname,
    navigate,
  ]);

  /* -------- 3° keep step number in sync when user navigates manually -------- */
  useEffect(() => {
    const pathToStep = Object.fromEntries(
      Object.entries(stepRoutes).map(([k, v]) => [v, Number(k)]),
    );

    if (!workflowPaths.includes(location.pathname)) return; // ignore public pages

    const expected = pathToStep[location.pathname];
    if (expected && expected !== state.currentStep && !state.autoProgress) {
      dispatch({ type: "SET_STEP", payload: expected });
    }
  }, [location.pathname, state.currentStep, state.autoProgress]);

  /* -------- exposed API -------- */
  const value = {
    ...state,
    /* setters */
    processUploadSuccess: (payload) => {
      // Mark this as a recent upload to skip verification
      isRecentUploadRef.current = true;
      dispatch({ type: "PROCESS_UPLOAD_SUCCESS", payload });
    },
    setLoading: (v) => dispatch({ type: "SET_LOADING", payload: v }),
    setError: (v) => dispatch({ type: "SET_ERROR", payload: v }),
    setStep: (v) => dispatch({ type: "SET_STEP", payload: v }),
    setPaperId: (v) => {
      // Mark this as a recent upload to skip verification
      isRecentUploadRef.current = true;
      dispatch({ type: "SET_PAPER_ID", payload: v });
    },
    setSessionId: (v) => dispatch({ type: "SET_SESSION_ID", payload: v }),
    setMetadata: (v) => dispatch({ type: "SET_METADATA", payload: v }),
    setScripts: (v) => dispatch({ type: "SET_SCRIPTS", payload: v }),
    setIsProcessed: (v) => dispatch({ type: "SET_IS_PROCESSED", payload: !!v }),
    setEditedScripts: (v) =>
      dispatch({ type: "SET_EDITED_SCRIPTS", payload: v }),
    setCaption: (v) => dispatch({ type: "SET_CAPTION", payload: v }),
    setBulletPoints: (v) => dispatch({ type: "SET_BULLET_POINTS", payload: v }),
    updateScript: (section, script) =>
      dispatch({ type: "UPDATE_SCRIPT", payload: { section, script } }),
    updateBulletPoints: (section, bullets) =>
      dispatch({ type: "UPDATE_BULLET_POINTS", payload: { section, bullets } }),
    setImages: (v) => dispatch({ type: "SET_IMAGES", payload: v }),
    setSelectedImage: (section, image) =>
      dispatch({ type: "SET_SELECTED_IMAGE", payload: { section, image } }),
    setSlides: (v) => dispatch({ type: "SET_SLIDES", payload: v }),
    setAudioFiles: (v) => dispatch({ type: "SET_AUDIO_FILES", payload: v }),
    setVideoPath: (v) => dispatch({ type: "SET_VIDEO_PATH", payload: v }),
    setAudienceLevel: (v) =>
      dispatch({ type: "SET_AUDIENCE_LEVEL", payload: v }),

    /* flow helpers */
    progressToNextStep: () => dispatch({ type: "PROGRESS_TO_NEXT_STEP" }),
    enableAutoProgress: () => dispatch({ type: "ENABLE_AUTO_PROGRESS" }),
    disableAutoProgress: () => dispatch({ type: "DISABLE_AUTO_PROGRESS" }),
    resetWorkflow: () => dispatch({ type: "RESET_WORKFLOW" }),
    markStepCompleted: (step) =>
      dispatch({ type: "MARK_STEP_COMPLETED", payload: step }),
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
};
