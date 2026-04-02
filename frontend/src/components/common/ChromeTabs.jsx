import React from 'react';
import { motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const ChromeTabs = ({ tabs = [], activeTab, onTabClick, showNavigation }) => {
  if (!tabs.length) return null;

  const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < tabs.length - 1;

  const handlePrevious = () => {
    if (canGoPrev) {
      onTabClick(tabs[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      onTabClick(tabs[currentIndex + 1].id);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Chrome-style tabs */}
      <div className="flex space-x-1 overflow-x-auto hide-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onTabClick(tab.id)}
              className={`relative px-3 sm:px-4 py-2 sm:py-3 rounded-t-md font-medium transition-all duration-200 focus:outline-none whitespace-nowrap min-w-[100px] sm:min-w-[120px] flex items-center justify-center gap-2 text-sm sm:text-base ${
                isActive
                ? 'bg-white dark:bg-gray-900 border-x border-t border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 shadow-sm -mb-px'
                : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              style={{
                borderBottom: isActive ? '1px solid transparent' : undefined,
                marginBottom: isActive ? '-1px' : '0',
              }}
            >
              <span className="truncate">{tab.title}</span>
              
              {/* Status indicators */}
              <div className="flex items-center gap-1">
                {tab.hasChanges && (
                  <div className="w-2 h-2 bg-amber-500 rounded-full" title="Has unsaved changes" />
                )}
                {tab.isCompleted && !tab.hasChanges && (
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" title="Completed" />
                )}
                {tab.isLoading && (
                  <div className="w-3 h-3">
                    <div className="w-3 h-3 border-2 border-gray-400 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              {/* Active tab indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-gray-100"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Mobile Navigation Controls - Only visible on phones */}
      {tabs.length > 1 && (
        <div className="block sm:hidden">
          <div className="flex items-center justify-between px-4">
            <button
              onClick={handlePrevious}
              disabled={!canGoPrev}
              className="flex items-center gap-2 px-4 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] touch-manipulation"
            >
              <FiChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Previous</span>
            </button>

            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {currentIndex + 1} of {tabs.length}
            </div>

            <button
              onClick={handleNext}
              disabled={!canGoNext}
              className="flex items-center gap-2 px-4 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] touch-manipulation"
            >
              <span className="text-sm font-medium">Next</span>
              <FiChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChromeTabs;