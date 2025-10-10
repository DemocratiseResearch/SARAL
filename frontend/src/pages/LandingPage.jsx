import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiFileText, FiMic, FiVideo, FiZap, FiCheck } from 'react-icons/fi';
import ThemeToggle from '../components/common/ThemeToggle';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

const FeatureCard = ({ icon: Icon, title, description, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15, delay }}
    className="card p-6 hover:shadow-lg transition-shadow duration-150"
  >
    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
      {title}
    </h3>
    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
      {description}
    </p>
  </motion.div>
  );

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGetStarted = async () => {
    if (!isAuthenticated) {
      navigate('/api-setup');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.getApiKeysStatus();
      if (response.data.gemini_configured) {
        navigate('/paper-processing');
      } else {
        navigate('/api-setup');
      }
    } catch (error) {
      toast.error("Could not check settings, proceeding to setup.");
      navigate('/api-setup');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: FiFileText,
      title: 'Paper Upload',
      description: 'Upload research papers via arXiv links or direct LaTeX files. Our system automatically extracts content and figures.'
    },
    {
      icon: FiZap,
      title: 'AI Script Generation',
      description: 'Generate engaging presentation scripts using advanced AI models like Gemini and GPT for educational content.'
    },
    {
      icon: FiMic,
      title: 'Voice Synthesis',
      description: 'Convert scripts to natural-sounding audio narration with support for multiple languages including Hindi.'
    },
    {
      icon: FiVideo,
      title: 'Video Production',
      description: 'Automatically create professional presentation videos combining slides, narration, and visual elements.'
    }
  ];

  const benefits = [
    'Upload papers from arXiv or LaTeX sources',
    'AI-powered script generation',
    'Multi-language voice synthesis',
    'Professional video output',
    'Customizable slides and content',
    'Export in multiple formats'
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-150">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center">
                <span className="text-white dark:text-gray-900 font-bold text-sm">SA</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Saral AI
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link to="/testimonials" className="btn-secondary">
              Testimonials
            </Link>
              <Link to="/about" className="btn-secondary">
              About
            </Link>
        </div>
      </div>
    </div>
  </header>

      {/* Hero Section */}
  <div className="w-full bg-gray-100 border-b border-gray-300 text-white-900 dark:bg-gray-900 dark:text-white dark:border-gray-700 py-2 px-4 text-center text-sm font-medium flex items-center justify-center gap-2">
    <svg
      className="inline w-5 h-5 mr-1 text-gray-500 dark:text-gray-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 8v4m0 4h.01"
      />
    </svg>
    For the best experience, please use{" "}
    <span className="font-semibold">Google Chrome</span> browser.
  </div>

      {/* Hero Section */}
  <section className="py-16 md:py-20 border-b border-neutral-200 dark:border-neutral-700">
    <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center">
    {/* Copy block */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, delay: 0.05 }}
        className="text-center"
      >
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
          Turn Academic Papers into Engaging Video Presentations 
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
          Saral AI seamlessly transforms your research papers into professional video presentations, utilizing AI-powered scripts, customized slides, and natural voice narration.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleGetStarted}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <LoadingSpinner size="sm" /> : 'Get Started'}
            {!loading && <FiArrowRight className="w-4 h-4" />}
          </button>

          <Link
            to="/sample"
            className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:underline"
          >
            Learn more
          </Link>
        </div>
      </motion.div>
    </div>
  </section>

    {/* Demo Video Section */}
    <section className="py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
            >
                <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4">
                    See Saral AI in Action
                </h2>
                <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8">
                    Prof. PK is giving demo to IndiaBiostreams
                </p>
            </motion.div>
            {/* Video Embed */}
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: 0.1 }}
                className="w-full"
            >
                <div className="aspect-video rounded-lg overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-700">
                    <iframe
                        className="w-full h-full"
                        src="https://www.youtube.com/embed/rlWnGAp7P5A"
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>
            </motion.div>
        </div>
    </section>

      {/* Features Section */}
  <section className="py-24 bg-white dark:bg-neutral-800">
    <div className="max-w-7xl mx-auto px-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4">
          How It Works
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Our streamlined workflow transforms your research papers into professional presentation videos in just a few steps.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (
          <FeatureCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
            delay={index * 0.05}
            />
            ))}
      </div>
    </div>
  </section>

      {/* Benefits Section */}
  <section className="py-24">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-6">
            Democratize Research Access
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            Make complex research accessible to wider audiences through engaging video presentations. Our AI-powered platform handles the technical complexity while you focus on your content.
          </p>
          
          <div className="space-y-3">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: index * 0.05 }}
                className="flex items-center gap-3"
              >
                <div className="w-5 h-5 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <FiCheck className="w-3 h-3 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-gray-700 dark:text-gray-300">
                  {benefit}
                </span>
              </motion.div>
              ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.1 }}
          className="card p-8 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"
        >
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FiVideo className="w-8 h-8 text-gray-600 dark:text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Ready to Get Started?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Join researchers worldwide who are making their work more accessible through video presentations.
            </p>
            <button onClick={handleGetStarted} disabled={loading} className="btn-primary w-full">
            {loading ? <LoadingSpinner size="sm" /> : 'Create Your First Video'}
            {!loading && <FiArrowRight className="w-4 h-4 ml-2" />}
          </button>
        </div>
      </motion.div>
    </div>
  </div>
</section>

      {/* Footer */}
<footer className="border-t border-neutral-200 dark:border-neutral-700 py-12">
  <div className="max-w-7xl mx-auto px-6 text-center">
    <div className="flex items-center justify-center gap-3 mb-4">
      <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center">
        <span className="text-white dark:text-gray-900 font-bold text-sm">SA</span>
      </div>
      <span className="text-lg font-semibold text-gray-900 dark:text-white">
        Saral AI
      </span>
    </div>
    <p className="text-gray-500 dark:text-gray-400 mb-6">
      Making research accessible through AI-powered video generation
    </p>
    <div className="flex justify-center gap-6">
      <Link to="/about" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-150">
      About
    </Link>
    <a href="mailto:pk.guru@iiit.ac.in" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-150">
      Contact Us
    </a>
  </div>
</div>
</footer>
</div>
);
};

export default LandingPage;
