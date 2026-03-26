import { useState, useCallback } from 'react';
import { apiService } from '../services/api';
import toast from '../services/toastService';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (apiCall, options = {}) => {
    const { 
      showLoading = true, 
      showError = true, 
      showSuccess = false,
      successMessage = 'Operation completed successfully',
      onSuccess,
      onError 
    } = options;

    try {
      if (showLoading) setLoading(true);
      setError(null);

      const result = await apiCall();

      if (showSuccess) {
        toast.success(successMessage);
      }

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || 'An error occurred';
      setError(errorMessage);

      if (showError) {
        // Don't show generic server errors, only specific ones
        if (!err.response || err.response.status !== 500) {
          toast.error(errorMessage);
        } else {
          toast.error('Something went wrong. Please try again.');
        }
      }

      if (onError) {
        onError(err);
      }

      // Don't throw the error to prevent unwanted redirects
      console.error('API Error:', err);
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  return { loading, error, execute, setError };
};
