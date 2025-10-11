import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '../navigation/Header';
import Sidebar from '../navigation/Sidebar';
import Breadcrumbs from '../navigation/Breadcrumbs';
import { useResponsive } from '../../hooks/useResponsive';

const Layout = ({ children, title, breadcrumbs = [] }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMobile } = useResponsive();

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-150">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black bg-opacity-70 backdrop-blur-xs"
            onClick={closeSidebar}
            />
            )}
      </AnimatePresence>

      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 z-50 w-64 h-screen transition-transform duration-150 transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
        />
      </div>

      {/* Main content */}
      <div 
        className={`transition-all duration-150 min-h-screen ${
          sidebarOpen && !isMobile ? 'ml-64' : 'ml-0'
        }`}
      >
        <Header 
          onMenuClick={toggleSidebar} 
          sidebarOpen={sidebarOpen}
        />

        <main className="px-6 py-4 max-w-7xl mx-auto">
          {breadcrumbs.length > 0 && (
            <div className="mb-6">
              <Breadcrumbs items={breadcrumbs} />
            </div>
            )}
          {title && (
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
                {title}
              </h1>
            </div>
            )}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
    );
};

export default Layout;
