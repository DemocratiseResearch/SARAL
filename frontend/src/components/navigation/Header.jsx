import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMenu, FiX, FiLogOut, FiUser, FiChevronDown } from 'react-icons/fi';
import ThemeToggle from '../common/ThemeToggle';
import { useWorkflow } from '../../contexts/WorkflowContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const Header = ({ onMenuClick, sidebarOpen }) => {
  const { currentStep, resetWorkflow } = useWorkflow();
  const { isMobile } = useResponsive();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const steps = [
    { id: 1, name: 'API Setup' },
    { id: 2, name: 'Paper Upload' },
    { id: 3, name: 'Script Generation' },
    { id: 4, name: 'Slide Creation' },
    { id: 5, name: 'Media Generation' }
  ];

  const currentStepInfo = steps.find(step => step.id === currentStep);

  
  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem("paperId");
      sessionStorage.removeItem("paperId");
      resetWorkflow();
      toast.success('Logged out successfully');
      navigate('/');
      setShowUserMenu(false);
    } catch (error) {
      toast.error('Logout failed');
      console.error('Logout error:', error);
    }
  };

  return (
    <motion.header
      initial={{ y: -6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 sticky top-0 z-30"
    >
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left section */}
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150"
            >
              {sidebarOpen ? (
                <FiX className="w-5 h-5" />
                ) : (
                <FiMenu className="w-5 h-5" />
                )}
              </button>
              
              <div className={`flex items-center gap-3 transition-opacity duration-150 ${
                !isMobile && sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}>
              <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center">
                <span className="text-white dark:text-gray-900 font-bold text-sm">SA</span>
              </div>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white">
                  <a href='/'>Saral AI</a>
                </h1>
                {currentStepInfo && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {currentStepInfo.name}
                  </p>
                  )}
              </div>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {!isMobile && <ThemeToggle />}

            {/* User Menu */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150"
                >
                  {user.picture ? (
                    <img 
                      src={user.picture} 
                      alt={user.name} 
                      className="w-6 h-6 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                      <FiUser className="w-3 h-3" />
                    </div>
                  )}
                  <FiChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-gray-200 dark:border-neutral-700 py-1 z-50"
                    >
                      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {user.email}
                        </p>
                      </div>

                      {/* Theme Toggle (visible only on mobile) */}
                      {isMobile && (
                        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                          <ThemeToggle />
                        </div>
                      )}

                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
                      >
                        <FiLogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.header>
    );
};

export default Header;
