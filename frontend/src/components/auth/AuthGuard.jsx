import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkflow } from '../../contexts/WorkflowContext';
import toast from '../../services/toastService';

const AuthGuard = ({ children }) => {
  const { isAuthenticated, isLoading, token } = useAuth();
  const { resetWorkflow } = useWorkflow();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      resetWorkflow();
      toast.error('Please login to access this page');
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate, resetWorkflow]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
      );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};

export default AuthGuard;
