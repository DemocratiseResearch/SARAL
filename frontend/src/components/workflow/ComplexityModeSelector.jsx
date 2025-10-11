import React from 'react';
import { motion } from 'framer-motion';
import { FiCheck } from 'react-icons/fi';

const ComplexityModeSelector = ({ selectedMode, onModeChange, disabled = false }) => {
  const modes = [
    {
      value: 'broad',
      label: 'Broad Overview',
      icon: '📌',
      description: 'Quick high-level summary',
      details: '3 sections • 3-4 bullet points • 2-3 min video',
      features: [
        'Perfect for quick understanding',
        'Simple, accessible language',
        'General audience friendly'
      ]
    },
    {
      value: 'normal',
      label: 'Balanced Depth',
      icon: '📊',
      description: 'Standard comprehensive coverage',
      details: '5 sections • 4-5 bullet points • 3-5 min video',
      features: [
        'Balanced technical detail',
        'Complete methodology & results',
        'Research-aware audience'
      ]
    },
    {
      value: 'in_depth',
      label: 'In-Depth Analysis',
      icon: '📚',
      description: 'Detailed technical exploration',
      details: '7 sections • 5-6 bullet points • 5-8 min video',
      features: [
        'Comprehensive technical details',
        'Full analysis & implications',
        'Academic/expert audience'
      ]
    }
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Choose Content Complexity
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select how detailed you want your presentation to be
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modes.map((mode) => (
          <motion.button
            key={mode.value}
            onClick={() => !disabled && onModeChange(mode.value)}
            disabled={disabled}
            whileHover={!disabled ? { scale: 1.02 } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
            className={`relative p-5 rounded-lg border-2 transition-all duration-200 text-left ${
              selectedMode === mode.value
                ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800 shadow-lg'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-900'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Selection indicator */}
            {selectedMode === mode.value && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-3 right-3 w-6 h-6 bg-gray-900 dark:bg-gray-100 rounded-full flex items-center justify-center"
              >
                <FiCheck className="w-4 h-4 text-white dark:text-gray-900" />
              </motion.div>
            )}

            {/* Icon */}
            <div className="text-3xl mb-3">{mode.icon}</div>

            {/* Title */}
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
              {mode.label}
            </h4>

            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {mode.description}
            </p>

            {/* Details */}
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-mono">
              {mode.details}
            </p>

            {/* Features */}
            <ul className="space-y-1">
              {mode.features.map((feature, idx) => (
                <li
                  key={idx}
                  className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1"
                >
                  <span className="text-gray-400 dark:text-gray-500 mt-0.5">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </motion.button>
        ))}
      </div>

      {/* Selected mode info */}
      {selectedMode && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
        >
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-semibold">
              {modes.find(m => m.value === selectedMode)?.label}
            </span>
            {' mode selected. '}
            You can change this anytime before generating scripts.
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default ComplexityModeSelector;
