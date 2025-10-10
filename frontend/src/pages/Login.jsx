import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { auth, provider } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { signInWithPopup } from "firebase/auth";
import ThemeToggle from '../components/common/ThemeToggle';

const Login = () => {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // Use Firebase Auth to sign in with Google
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      // console.log("Firebase ID Token:", idToken);
      // Send Firebase ID token to backend
      const loginResult = await loginWithGoogle(idToken);
      console.log("Backend login result:", loginResult);
      if (loginResult.success) {
        toast.success('Login successful!');
        navigate('/api-setup');
      } else {
        toast.error(loginResult.error || 'Login failed');
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-6">

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-md"
      >
        <div className="card p-8 text-center">
          {/* Logo */}
          <div className="w-16 h-16 bg-neutral-900 dark:bg-white rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white dark:text-neutral-900 font-bold text-xl">SA</span>
          </div>

          {/* Header */}
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-2">
            Welcome to Saral AI
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mb-8">
            Sign in to start converting your research papers into engaging videos
          </p>

          {/* Login Form */}
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner size="lg" />
                <span className="ml-3 text-neutral-600 dark:text-neutral-400">
                  Signing you in...
                </span>
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  onClick={handleGoogleLogin}
                  className="btn btn-google"
                  style={{ minWidth: 200, padding: '0.75rem 1.5rem', fontSize: '1rem', borderRadius: '0.5rem', background: '#4285F4', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  <FiUser className="mr-2" /> Sign in with Google
                </button>
              </div>
            )}
            </div>

          {/* Features Preview */}
            <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
              <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-3">
                What you can do:
              </h3>
              <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                  Upload research papers from arXiv or LaTeX
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                  Generate AI-powered presentation scripts
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                  Create professional educational videos
                </div>
              </div>
            </div>

          {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                By signing in, you agree to our terms of service and privacy policy
              </p>
            </div>
          </div>

        {/* Quick Start Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, delay: 0.1 }}
            className="mt-6 text-center"
          >
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150"
            >
              <FiArrowRight className="w-4 h-4 rotate-180" />
              Back to Home
            </button>
          </motion.div>
        </motion.div>
      </div>
      );
};

export default Login;
