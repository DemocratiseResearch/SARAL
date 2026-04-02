import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { GoogleOAuthProvider } from "@react-oauth/google";

import { ThemeProvider } from "./contexts/ThemeContext";
import { WorkflowProvider } from "./contexts/WorkflowContext";
import { ApiProvider } from "./contexts/ApiContext";
import { AuthProvider } from "./contexts/AuthContext";

import ErrorBoundary from "./components/common/ErrorBoundary";
import ProtectedRoute from "./components/common/ProtectedRoute";
import FeedbackWidget from "./components/common/FeedbackWidget";
import SessionTracker from "./components/common/SessionTracker";
import StatusBanner from "./components/common/StatusBanner";

import Analytics from "./lib/analytics";
import usePageTracking from "./hooks/usePageTracking";

import LandingPage from "./pages/LandingPage";
import ApiSetup from "./pages/ApiSetup";
import PaperProcessing from "./pages/PaperProcessing";
import ScriptGeneration from "./pages/ScriptGeneration";
import SlideCreation from "./pages/SlideCreation";
import MediaGeneration from "./pages/MediaGeneration";
import Results from "./pages/Results";
import About from "./pages/About";
import VideosPage from "./pages/VideosPage";
import Testimonials from "./pages/Testimonials";
import YouTubeLogin from "./pages/YouTubeLogin";
import OAuthCallback from "./pages/OAuthCallback";
import VideoPreview from "./pages/VideoPreview";
import VideoDisplay from "./pages/VideoDisplay";
import ReelDisplay from "./pages/ReelsDisplay";
import ReelScriptEditorPage from "./pages/ReelScriptEditorPage";
import PodcastDisplay from "./pages/PodcastDisplay";
import PosterGenerator from "./pages/PosterGenerator";
import BusinessBriefPage from "./pages/BusinessBriefPage";
import ScrollToTop from "./components/common/ScrollToTop";


function PageTracker() {
  usePageTracking();
  return null;
}

const toastConfig = {
  position: "top-right",
  toastOptions: {
    duration: 3000,
    className: "toast-custom",
    style: {
      background: "var(--toast-bg)",
      color: "var(--toast-color)",
      border: "1px solid var(--toast-border)",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: "500",
    },
    success: {
      iconTheme: {
        primary: "#10b981",
        secondary: "#ffffff",
      },
    },
    error: {
      iconTheme: {
        primary: "#ef4444",
        secondary: "#ffffff",
      },
    },
  },
};

function App() {
  useEffect(() => {
    Analytics.init();
    console.log("Mixpanel init called from App");
  }, []);

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_REACT_APP_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ErrorBoundary>
          <Router>
            <ScrollToTop />   
            <SessionTracker />
            <PageTracker />
            <ThemeProvider>
              <ApiProvider>
                <WorkflowProvider>
                  <div className="App min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                    {/* Global status / outage banner – always visible above routes */}
                    {/* <StatusBanner /> */}
                    <div
                    style={{
                      padding: "10px",
                      background: "black",
                      textAlign: "center",
                      color: "white",
                      fontWeight: "600",
                    }}
                  >
                   For better experience, please use Google Chrome browser and configure your own api keys in the API Setup section.
                  </div>

                    <Routes>
                      <Route path="/" element={<LandingPage />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/sample" element={<VideosPage />} />
                      <Route path="/testimonials" element={<Testimonials />} />

                      <Route
                        path="/api-setup"
                        element={
                          <ProtectedRoute>
                            <ApiSetup />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/paper-processing"
                        element={
                          <ProtectedRoute>
                            <PaperProcessing />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/script-generation"
                        element={
                          <ProtectedRoute>
                            <ScriptGeneration />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/slide-creation"
                        element={
                          <ProtectedRoute>
                            <SlideCreation />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/media-generation"
                        element={
                          <ProtectedRoute>
                            <MediaGeneration />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/results"
                        element={
                          <ProtectedRoute>
                            <Results />
                          </ProtectedRoute>
                        }
                      />

                      <Route path="/youtube-login" element={<YouTubeLogin />} />
                      <Route
                        path="/oauth2callback"
                        element={<OAuthCallback />}
                      />
                      <Route path="/video-preview" element={<VideoPreview />} />
                      <Route path="/video-display" element={<VideoDisplay />} />
                      <Route
                        path="/reel-script-editor"
                        element={<ReelScriptEditorPage />}
                      />
                      <Route path="/reel-display" element={<ReelDisplay />} />
                      <Route
                        path="/podcast-display"
                        element={<PodcastDisplay />}
                      />
                      <Route path="/poster" element={<PosterGenerator />} />
                      <Route
                        path="/business-brief"
                        element={<BusinessBriefPage />}
                      />

                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>

                    <FeedbackWidget
                      title="Results feedback"
                      placeholder="Was this result useful? Tell us why."
                      context={{ page: "results" }}
                    />

                    <Toaster {...toastConfig} />
                  </div>
                </WorkflowProvider>
              </ApiProvider>
            </ThemeProvider>
          </Router>
        </ErrorBoundary>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
