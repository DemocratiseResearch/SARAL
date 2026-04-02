import React from 'react';
import { FiAlertTriangle, FiRefreshCw, FiHome } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Analytics from '../../lib/analytics';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    console.error('Error caught by boundary:', error, errorInfo);

    // Log to Mixpanel
    try {
      Analytics.track('FE React ErrorBoundary', {
        message: error?.message || String(error),
        stack: error?.stack || null,
        componentStack: errorInfo?.componentStack || null,
        path: window.location.pathname + window.location.search,
        userAgent: navigator?.userAgent,
      });
    } catch (e) {
      console.warn('Failed to track ErrorBoundary error', e);
    }
  }

  // Reset boundary when resetKey changes (e.g. route change)
  componentDidUpdate(prevProps) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="max-w-md w-full"
          >
            <div className="card p-8 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FiAlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>

              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-3">
                Something went wrong
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
                We're sorry, but something unexpected happened. Please try refreshing the page or return to the home page.
              </p>

              {import.meta.env.MODE === 'development' && this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="cursor-pointer text-sm text-neutral-500 dark:text-neutral-400 mb-2 hover:text-neutral-700 dark:hover:text-neutral-300">
                    Error Details (Development Mode)
                  </summary>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 text-xs font-mono text-neutral-800 dark:text-neutral-200 overflow-auto max-h-32 text-left">
                    <div className="mb-2">
                      <strong>Error:</strong> {this.state.error.toString()}
                    </div>
                    <div>
                      <strong>Stack trace:</strong>
                      <pre className="whitespace-pre-wrap text-xs mt-1">
                        {this.state.errorInfo?.componentStack}
                      </pre>
                    </div>
                  </div>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReload}
                  className="btn-primary flex-1"
                >
                  <FiRefreshCw className="w-4 h-4 mr-2" />
                  Reload Page
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="btn-secondary flex-1"
                >
                  <FiHome className="w-4 h-4 mr-2" />
                  Go Home
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
