import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

/* ─────────────────────────── setup ─────────────────────────── */

const WorkflowContext = createContext();

const initialState = {
  currentStep      : 1,
  completedSteps   : [],
  paperId          : null,
  isProcessed      : false,
  sessionId        : null,
  metadata         : { title:'', authors:'', date:'' },
  scripts          : {},
  editedScripts    : {},
  bulletPoints     : {},
  images           : [],
  selectedImages   : {},
  slides           : [],
  audioFiles       : [],
  videoPath        : null,
  isLoading        : false,
  error            : null,
  autoProgress     : true,
  manualNavigation : false
};

/* map step → route once so every effect can reuse it */
const stepRoutes = {
  1 : '/api-setup',
  2 : '/paper-processing',
  3 : '/script-generation',
  4 : '/slide-creation',
  5 : '/media-generation',
  6 : '/results'
};

/* list of URLs that belong to the linear workflow */
const workflowPaths = Object.values(stepRoutes);

/* ────────────────────────── reducer ─────────────────────────── */

const workflowReducer = (state, action) => {
  switch (action.type) {
  case 'SET_LOADING'         : return { ...state, isLoading: action.payload };
  case 'SET_ERROR'           : return { ...state, error: action.payload, isLoading:false };

  case 'SET_STEP'            :
    return { ...state, currentStep: action.payload, manualNavigation:true, autoProgress:false };

  case 'PROGRESS_TO_NEXT_STEP': {
    const next     = Math.min(state.currentStep + 1, 6);
    const finished = [...new Set([...state.completedSteps, state.currentStep])];
    return { ...state, currentStep: next, completedSteps: finished, autoProgress:true, manualNavigation:false };
  }

case 'MARK_STEP_COMPLETED' : return { ...state, completedSteps:[...new Set([...state.completedSteps, action.payload])] };

case 'SET_PAPER_ID'        : return { ...state, paperId:      action.payload };
case 'SET_SESSION_ID'      : return { ...state, sessionId:    action.payload };
case 'SET_METADATA'        : return { ...state, metadata:     { ...state.metadata, ...action.payload }};
case 'SET_IS_PROCESSED'    : return { ...state, isProcessed: !!action.payload };

case 'SET_SCRIPTS'         : return { ...state, scripts: action.payload||{}, editedScripts: action.payload||{} };
case 'SET_EDITED_SCRIPTS'  : return { ...state, editedScripts: action.payload||{} };
case 'SET_BULLET_POINTS'   : return { ...state, bulletPoints : action.payload||{} };

  case 'UPDATE_SCRIPT'       : return {
    ...state,
    editedScripts:{ ...state.editedScripts, [action.payload.section]: action.payload.script }
  };
  case 'UPDATE_BULLET_POINTS': return {
    ...state,
    bulletPoints :{ ...state.bulletPoints, [action.payload.section]: action.payload.bullets }
  };

case 'SET_IMAGES'          : return { ...state, images        : action.payload||[] };
  case 'SET_SELECTED_IMAGE'  : return {
    ...state,
    selectedImages:{ ...state.selectedImages, [action.payload.section]: action.payload.image }
  };

case 'SET_SLIDES'          : return { ...state, slides        : action.payload||[] };
case 'SET_AUDIO_FILES'     : return { ...state, audioFiles    : action.payload||[] };
case 'SET_VIDEO_PATH'      : return { ...state, videoPath     : action.payload };

case 'ENABLE_AUTO_PROGRESS': return { ...state, autoProgress:true,  manualNavigation:false };
case 'DISABLE_AUTO_PROGRESS':return { ...state, autoProgress:false, manualNavigation:true  };

case 'RESET_WORKFLOW'      : return { ...initialState };

default                    : return state;
}
};

/* ─────────────────────── custom hook ────────────────────────── */

export const useWorkflow = () => {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider');
  return ctx;
};

/* ─────────────────────── provider ───────────────────────────── */

export const WorkflowProvider = ({ children }) => {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const navigate          = useNavigate();
  const location          = useLocation();

  /* -------- 1° check that stored paper still exists -------- */
  useEffect(() => {
    const verifyPaperExists = async () => {
      if (!state.paperId) return;
      try {
        const exists = await apiService.checkPaperExists(state.paperId);
        if (exists) return;

        // paper vanished → wipe state
        dispatch({ type:'SET_PAPER_ID',        payload:null });
        dispatch({ type:'SET_METADATA',        payload:initialState.metadata });
        dispatch({ type:'SET_SCRIPTS',         payload:{} });
        dispatch({ type:'SET_EDITED_SCRIPTS',  payload:{} });
        dispatch({ type:'SET_BULLET_POINTS',   payload:{} });
        dispatch({ type:'SET_IMAGES',          payload:[] });
        dispatch({ type:'SET_SELECTED_IMAGE',  payload:{} });

        if (workflowPaths.includes(location.pathname)) {
          toast.error('Previous session could not be loaded. Please upload your paper again.');
          navigate('/paper-processing');
        }
      } catch (err) {
        console.error('Error verifying paper existence:', err);
      }
    };
    verifyPaperExists();
  }, [state.paperId, location.pathname, navigate]);

  /* -------- 2° auto-progress inside the workflow -------- */
  useEffect(() => {
    // Ignore non-workflow pages like /about or /login
    if (!workflowPaths.includes(location.pathname)) return;

    if (!state.autoProgress || state.manualNavigation) return;

    const targetRoute = stepRoutes[state.currentStep];
    if (targetRoute && location.pathname !== targetRoute) {
      navigate(targetRoute, { replace:true });
      // stop autoProgress after the redirect to avoid an infinite loop
      setTimeout(() => dispatch({ type:'DISABLE_AUTO_PROGRESS' }), 500);
    }
  }, [
    state.currentStep,
    state.autoProgress,
    state.manualNavigation,
    location.pathname,
    navigate
  ]);

  /* -------- 3° keep step number in sync when user navigates manually -------- */
  useEffect(() => {
    const pathToStep = Object.fromEntries(
      Object.entries(stepRoutes).map(([k,v]) => [v, Number(k)])
      );

    if (!workflowPaths.includes(location.pathname)) return; // ignore public pages

    const expected = pathToStep[location.pathname];
    if (expected && expected !== state.currentStep && !state.autoProgress) {
      dispatch({ type:'SET_STEP', payload:expected });
    }
  }, [location.pathname, state.currentStep, state.autoProgress]);

  /* -------- exposed API -------- */
  const value = {
    ...state,
    /* setters */
    setLoading        : v => dispatch({ type:'SET_LOADING',       payload:v }),
    setError          : v => dispatch({ type:'SET_ERROR',         payload:v }),
    setStep           : v => dispatch({ type:'SET_STEP',          payload:v }),
    setPaperId        : v => dispatch({ type:'SET_PAPER_ID',      payload:v }),
    setSessionId      : v => dispatch({ type:'SET_SESSION_ID',    payload:v }),
    setMetadata       : v => dispatch({ type:'SET_METADATA',      payload:v }),
    setScripts        : v => dispatch({ type:'SET_SCRIPTS',       payload:v }),
    setIsProcessed    : v => dispatch({ type:'SET_IS_PROCESSED',  payload:!!v }),
    setEditedScripts  : v => dispatch({ type:'SET_EDITED_SCRIPTS',payload:v }),
    setBulletPoints   : v => dispatch({ type:'SET_BULLET_POINTS', payload:v }),
    updateScript      : (section,script)=>dispatch({ type:'UPDATE_SCRIPT',       payload:{section,script} }),
    updateBulletPoints: (section,bullets)=>dispatch({ type:'UPDATE_BULLET_POINTS',payload:{section,bullets} }),
    setImages         : v => dispatch({ type:'SET_IMAGES',        payload:v }),
    setSelectedImage  : (section,image)=>dispatch({ type:'SET_SELECTED_IMAGE',   payload:{section,image} }),
    setSlides         : v => dispatch({ type:'SET_SLIDES',        payload:v }),
    setAudioFiles     : v => dispatch({ type:'SET_AUDIO_FILES',   payload:v }),
    setVideoPath      : v => dispatch({ type:'SET_VIDEO_PATH',    payload:v }),

    /* flow helpers */
    progressToNextStep: () => dispatch({ type:'PROGRESS_TO_NEXT_STEP' }),
    enableAutoProgress: () => dispatch({ type:'ENABLE_AUTO_PROGRESS' }),
    disableAutoProgress:() => dispatch({ type:'DISABLE_AUTO_PROGRESS' }),
    resetWorkflow     : () => dispatch({ type:'RESET_WORKFLOW' }),
    markStepCompleted : step => dispatch({ type:'MARK_STEP_COMPLETED', payload:step })
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
    );
};
