import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiKey, FiCheck, FiAlertCircle, FiEye, FiEyeOff, FiExternalLink } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Layout from '../components/common/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { apiService } from '../services/api';
import { useWorkflow } from '../contexts/WorkflowContext';

const ApiKeyInput = ({ label, name, value, onChange, required, description, showPassword, onTogglePassword, status, link }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {status && (
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
          status === 'valid' 
          ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
          : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          {status === 'valid' ? (
            <FiCheck className="w-3 h-3" />
          ) : (
            <FiAlertCircle className="w-3 h-3" />
          )}
          {status === 'valid' ? 'Valid' : 'Invalid'}
        </div>
      )}
    </div>
    
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-900
                   border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-gray-700 pr-12"
        placeholder={`Enter your ${label.toLowerCase()}`}
      />
      <button
        type="button"
        onClick={onTogglePassword}
        className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 
                   text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 
                   rounded transition-colors duration-150"
      >
        {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
      </button>
    </div>
    <div className="flex flex-row justify-between">
      {description && (
        <span className="text-sm text-gray-600 dark:text-gray-400">{description}</span>
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 
                   hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150"
      >
        Get API Key
        <FiExternalLink className="w-3 h-3" />
      </a>
    </div>
  </div>
);

const ApiSetupForm = () => {
  const { progressToNextStep, setCurrentStep } = useWorkflow();
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [status, setStatus] = useState({});
  const [showPasswords, setShowPasswords] = useState({});
  const [apiKeys, setApiKeys] = useState({
    gemini_key: '',
    sarvam_key: '',
    openai_key: ''
  });

  useEffect(() => {
    checkExistingSetup();
  }, []);

  const checkExistingSetup = async () => {
    try {
      setCheckingExisting(true);
      const response = await apiService.getApiKeysStatus();
      setStatus(response.data);
      
      // If Gemini API key is already configured and valid, skip to paper upload
      if (response.data.gemini_key === 'valid') {
        toast.success('API keys already configured!');
        // Skip to paper upload step (assuming it's step 2)
        setCurrentStep(2); // or whatever step number paper upload is
        return;
      }
    } catch (error) {
      console.error('Error checking existing API keys:', error);
    } finally {
      setCheckingExisting(false);
    }
  };

  const checkApiKeysStatus = async () => {
    try {
      const response = await apiService.getApiKeysStatus();
      setStatus(response.data);
    } catch (error) {
      console.error('Error checking API keys status:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setApiKeys(prev => ({ ...prev, [name]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const isFormValid = () => {
    return apiKeys.gemini_key.trim() !== '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isFormValid()) {
      toast.error('Gemini API key is required to continue');
      return;
    }

    setLoading(true);

    try {
      await apiService.setupApiKeys(apiKeys);
      toast.success('API keys configured successfully!');
      await checkApiKeysStatus();
      progressToNextStep();
    } catch (error) {
      console.error('API setup error:', error);
      toast.error('Failed to configure API keys. Please check your keys and try again.');
    } finally {
      setLoading(false);
    }
  };

  const apiKeyConfigs = [
    {
      name: 'gemini_key',
      label: 'Gemini API Key',
      required: true,
      description: 'Required for script generation and content analysis.',
      link: 'https://makersuite.google.com/app/apikey'
    },
    {
      name: 'sarvam_key', 
      label: 'Sarvam API Key',
      required: false,
      description: 'Optional: Used for Hindi text-to-speech generation.',
      link: 'https://sarvam.ai'
    },
    {
      name: 'openai_key',
      label: 'OpenAI API Key', 
      required: false,
      description: 'Optional: Alternative for script generation.',
      link: 'https://platform.openai.com/api-keys'
    }
  ];

  // Show loading while checking existing setup
  if (checkingExisting) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 dark:text-gray-400">Checking existing configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* header */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Configure API Keys
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Set up your API keys to enable AI-powered features. Gemini API key is required to continue.
        </p>
      </div>

      {/* form card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6
                   border border-neutral-200 dark:border-neutral-700 space-y-6"
      >
        {/* loading indicator */}
        {loading && (
          <div className="h-1 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden mb-4">
            <div className="h-full w-full animate-pulse bg-gray-700 dark:bg-gray-400" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {apiKeyConfigs.map((config) => (
            <div key={config.name} className="space-y-2">
              <ApiKeyInput
                label={config.label}
                name={config.name}
                value={apiKeys[config.name]}
                onChange={handleInputChange}
                required={config.required}
                description={config.description}
                showPassword={showPasswords[config.name]}
                onTogglePassword={() => togglePasswordVisibility(config.name)}
                status={status[config.name]}
                link={config.link}
              />
            </div>
          ))}

          <div className="flex flex-col sm:flex-row gap-3 pt-6">
            <button
              type="submit"
              disabled={loading || !isFormValid()}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                         rounded-md bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400
                         text-white font-medium transition-colors duration-150"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Configuring...
                </>
              ) : (
                <>
                  <FiKey className="w-5 h-5" />
                  Save Configuration & Continue
                </>
              )}
            </button>
            
            {/* Remove the Skip button since Gemini API key is now required */}
          </div>
        </form>

        {/* security notice */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <div className="flex items-start gap-3">
            <FiAlertCircle className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-1">API Key Security</p>
              <p>Your API keys are encrypted and stored securely. You can update or remove them at any time in settings.</p>
            </div>
          </div>
        </div>

        {/* Required field notice */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-start gap-3">
            <FiKey className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Gemini API Key Required</p>
              <p>The Gemini API key is required to use the core features of this application. Other API keys are optional for enhanced functionality.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ApiSetupForm;
