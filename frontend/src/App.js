import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'react-hot-toast';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import ErrorBoundary from './components/common/ErrorBoundary';
import ProtectedRoute from './components/common/ProtectedRoute';
import { ApiProvider } from './contexts/ApiContext';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WorkflowProvider } from './contexts/WorkflowContext';

// Pages
import About from './pages/About';
import ApiSetup from './pages/ApiSetup';
import LandingPage from './pages/LandingPage';
import ManimAnimation from './pages/ManimAnimation';
import MediaGeneration from './pages/MediaGeneration';
import PaperProcessing from './pages/PaperProcessing';
import PosterGeneration from './pages/PosterGeneration';
import Results from './pages/Results';
import ScriptGeneration from './pages/ScriptGeneration';
import SlideCreation from './pages/SlideCreation';
import VideosPage from './pages/VideosPage';
import WhiteboardAnimation from './pages/WhiteboardAnimation';
// import SarasChat from './pages/SarasChat';
import SarasChatEnhanced from './pages/SarasChatEnhanced';

function App() {
  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ErrorBoundary>
          <Router>
            <ThemeProvider>
              <ApiProvider>
                <WorkflowProvider>
                  <div className="App min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                    <Routes>
                      <Route path="/" element={<LandingPage />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/sample" element={<VideosPage />} />
                      <Route path="/api-setup" element={
                        <ProtectedRoute>
                          <ApiSetup />
                        </ProtectedRoute>
                      } />
                      <Route path="/paper-processing" element={
                        <ProtectedRoute>
                          <PaperProcessing />
                        </ProtectedRoute>
                      } />
                      <Route path="/script-generation" element={
                        <ProtectedRoute>
                          <ScriptGeneration />
                        </ProtectedRoute>
                      } />
                      <Route path="/slide-creation" element={
                        <ProtectedRoute>
                          <SlideCreation />
                        </ProtectedRoute>
                      } />
                      <Route path="/media-generation" element={
                        <ProtectedRoute>
                          <MediaGeneration />
                        </ProtectedRoute>
                      } />
                      <Route path="/whiteboard-animation" element={
                        <ProtectedRoute>
                          <WhiteboardAnimation />
                        </ProtectedRoute>
                      } />
                      <Route path="/manim-animation" element={
                        <ProtectedRoute>
                          <ManimAnimation />
                        </ProtectedRoute>
                      } />
                      <Route path="/saras" element={
                        <ProtectedRoute>
                          <SarasChatEnhanced />
                        </ProtectedRoute>
                      } />
                      <Route path="/poster-generation" element={
                        <ProtectedRoute>
                          <PosterGeneration />
                        </ProtectedRoute>
                      } />
                      <Route path="/results" element={
                        <ProtectedRoute>
                          <Results />
                        </ProtectedRoute>
                      } />

                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>

                    <Toaster
                      position="top-right"
                      toastOptions={{
                        duration: 3000,
                        className: 'toast-custom',
                        style: {
                          background: 'var(--toast-bg)',
                          color: 'var(--toast-color)',
                          border: '1px solid var(--toast-border)',
                          borderRadius: '12px',
                          fontSize: '14px',
                          fontWeight: '500',
                        },
                        success: {
                          iconTheme: {
                            primary: '#10b981',
                            secondary: '#ffffff',
                          },
                        },
                        error: {
                          iconTheme: {
                            primary: '#ef4444',
                            secondary: '#ffffff',
                          },
                        },
                      }}
                    />
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
