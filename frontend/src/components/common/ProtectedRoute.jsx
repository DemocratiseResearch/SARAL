import React from 'react';
// import { useAuth } from '../../contexts/AuthContext';  // Commented out for local use
// import LoadingSpinner from './LoadingSpinner';  // Commented out for local use
// import Login from '../../pages/Login';  // Commented out for local use

// ProtectedRoute disabled for local use - all routes are now public
const ProtectedRoute = ({ children }) => {
  // Authentication disabled for local use
  // const { isAuthenticated, loading } = useAuth();

  // if (loading) {
  //   return (
  //     <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
  //       <div className="text-center">
  //         <LoadingSpinner size="xl" className="mx-auto mb-4" />
  //         <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Loading</h2>
  //         <p className="text-gray-600 dark:text-gray-400">Please wait while we verify your session...</p>
  //       </div>
  //     </div>
  //   );
  // }

  // if (!isAuthenticated) {
  //   return <Login />;
  // }

  // Directly return children without authentication check
  return children;
};

export default ProtectedRoute;
