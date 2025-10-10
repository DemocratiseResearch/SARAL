import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiPlay } from 'react-icons/fi';
import Layout from '../common/Layout';

// Language mapping for native script + English
const languageMap = {
  'English': 'English',
  'Hindi': 'हिंदी (Hindi)',
  'Telugu': 'తెలుగు (Telugu)',
  'Tamil': 'தமிழ் (Tamil)',
  'Bengali': 'বাংলা (Bengali)',
  'Gujarati': 'ગુજરાતી (Gujarati)',
  'Kannada': 'ಕನ್ನಡ (Kannada)',
  'Malayalam': 'മലയാളം (Malayalam)',
  'Marathi': 'मराठी (Marathi)',
  'Punjabi': 'ਪੰਜਾਬੀ (Punjabi)',
  'Urdu': 'اردو (Urdu)',
  'Odia': 'ଓଡ଼ିଆ (Odia)'
};

const VideoCard = ({ video, index }) => {
  const displayLanguage = languageMap[video.language] || video.language;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.1 }}
      className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-150"
    >
      {/* Video Player */}
      <div className="w-full aspect-video overflow-hidden">
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${video.videoId}?rel=0`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      
      {/* Language Info Only */}
      <div className="p-4 text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {displayLanguage}
        </h3>
      </div>
    </motion.div>
  );
};

const GeneratedVideoDisplay = ({ 
  videos = [],
  backLink = "/",
  backText = "Back to Dashboard"
}) => {
  const crumbs = [
    { label: backText, href: backLink },
    { label: "Generated Videos", href: '#' }
  ];

  // Filter out videos without videoId
  const validVideos = videos.filter(video => video.videoId);

  return (
    <Layout breadcrumbs={crumbs}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Generated Videos
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Videos in different languages
          </p>
        </motion.div>

        {/* Videos Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {validVideos.length > 0 ? (
            validVideos.map((video, index) => (
              <VideoCard key={video.id || index} video={video} index={index} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 dark:text-gray-500 mb-4">
                <FiPlay className="w-12 h-12 mx-auto mb-4" />
                <p className="text-lg">No videos available</p>
                <p className="text-sm">
                  Generate your first video from a research paper
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.2 }}
          className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700"
        >
          <Link
            to={backLink}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-150"
          >
            <FiArrowLeft className="w-4 h-4" />
            {backText}
          </Link>
        </motion.div>
      </div>
    </Layout>
  );
};

export default GeneratedVideoDisplay;
