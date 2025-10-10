import React from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  FiKey, FiUpload, FiEdit3, FiSliders, 
  FiPlay, FiDownload, FiX, FiCheck, FiClock, FiLogOut, FiUser
} from 'react-icons/fi';
import { useWorkflow } from '../../contexts/WorkflowContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext'; // Add this import
import toast from 'react-hot-toast';

const SidebarLink = ({ to, icon: Icon, label, step, currentStep, completedSteps, isActive, onClick }) => {
  const isCompleted = completedSteps && completedSteps.includes(step);
  const isCurrent = currentStep === step;
  const isAccessible = step === 0 || step <= currentStep || isCompleted;

  return (
    <Link
      to={isAccessible ? to : '#'}
      onClick={onClick}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 focus:outline-none whitespace-nowrap min-w-[100px] sm:min-w-[120px] flex items-center justify-center gap-2 text-sm sm:text-base ${
        isActive && isAccessible
        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        : isAccessible
        ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
        : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
      }`}
    >
      <div className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors duration-150 ${
        isCompleted
        ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
        : isCurrent
        ? 'bg-gray-100 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400'
        : 'text-current'
      }`}>
      {isCompleted ? (
        <FiCheck className="w-4 h-4" />
        ) : isCurrent ? (
        <FiClock className="w-4 h-4" />
        ) : (
        <Icon className="w-4 h-4" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{label}</div>
        {step > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-500">
            Step {step}
          </div>
          )}
      </div>
    </Link>
    );
};

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentStep, completedSteps = [], setStep, disableAutoProgress, resetWorkflow } = useWorkflow();
  const { isMobile } = useResponsive();
  const { user, logout } = useAuth(); // Add this line

  const navigationItems = [
    { to: '/api-setup', icon: FiKey, label: 'API Setup', step: 1 },
    { to: '/paper-processing', icon: FiUpload, label: 'Paper Upload', step: 2 },
    { to: '/script-generation', icon: FiEdit3, label: 'Script Generation', step: 3 },
    { to: '/slide-creation', icon: FiSliders, label: 'Slide Creation', step: 4 },
    { to: '/media-generation', icon: FiPlay, label: 'Media Generation', step: 5 },
    { to: '/results', icon: FiDownload, label: 'Results', step: 6 },
  ];

  const handleLinkClick = (step) => {
    if (step === 0 || step <= currentStep || completedSteps.includes(step)) {
      setStep(step);
      disableAutoProgress();
    }
    if (isMobile && onClose) {
      onClose();
    }
  };

  // const handleLogout = async () => {
  //   try {
  //     await logout();
  //     toast.success('Logged out successfully');
  //     navigate('/');
  //   } catch (error) {
  //     toast.error('Logout failed');
  //     console.error('Logout error:', error);
  //   }
  // };

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem("paperId");
      sessionStorage.removeItem("paperId");
      resetWorkflow();
      toast.success('Logged out successfully');
      navigate('/');
    } catch (error) {
      toast.error('Logout failed');
      console.error('Logout error:', error);
    }
  };

  const progressPercentage = completedSteps.length > 0 ? Math.round((completedSteps.length / 6) * 100) : 0;

  return (
    <aside className="h-full w-full bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
      {/* Header */}
      {/* <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center">
            <span className="text-white dark:text-gray-900 font-bold text-sm">SA</span>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Saral AI
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Paper to Video
            </p>
          </div>
        </div>
        
        {isMobile && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150"
          >
            <FiX className="w-5 h-5" />
          </button>
          )}
      </div> */}

      {/* User Info - Add this section */}
      {user && (
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              {user.picture ? (
                <img 
                  src={user.picture} 
                  alt={user.name} 
                  className="w-8 h-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <FiUser className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 px-3">
          Workflow
        </div>
        
        {navigationItems.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            step={item.step}
            currentStep={currentStep}
            completedSteps={completedSteps}
            isActive={location.pathname === item.to}
            onClick={() => handleLinkClick(item.step)}
            />
            ))}
      </nav>

      {/* Progress */}
      <div className="px-4 py-4 border-t border-neutral-200 dark:border-neutral-700">
        <div className="px-3 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Progress
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {progressPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <motion.div
              className="bg-gray-400 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.15 }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {completedSteps.length > 0 ? `${completedSteps.length} of 6 completed` : 'Get started'}
          </div>
        </div>

        {/* Logout Button - Add this section */}
        <button
          onClick={handleLogout}
          className="w-full mt-3 flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-150"
        >
          <FiLogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
    );
};

export default Sidebar;
