
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiFileText,
  FiImage,
  FiVideo,
  FiMic,
  FiLayout,
  FiUpload,
  FiShare2,
  FiYoutube,
  FiZap,
  FiGlobe,
  FiBarChart2,
  FiMessageSquare,
  FiArrowRight
} from "react-icons/fi";
import { PuzzlePiece24Regular } from "@fluentui/react-icons";
import UnifiedHeader from '../components/common/UnifiedHeader';
import { apiService } from '../services/api';
import toast from '../services/toastService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import anrf_logo from "../images/anrf.jpg";
import sarvam_logo from "../images/sarvam_logo.jpeg";
import google from "../images/google.jpg";
import abhishek from '../testimonial_imgs/Abhishek.png';
import prem from '../testimonial_imgs/prem.png';
import anupam from '../testimonial_imgs/anupam.png';
import iitr from '../testimonial_imgs/iitr.png'

/* ---------- Small FeatureCard (kept for How It Works) ---------- */
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

const GroupedFeatureColumns = ({ groups }) => {
  return (
    <div className="mt-8 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 px-6 py-6">
     <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => (
          <div key={group.title}>
            {/* Section heading */}
            <h3 className="text-ml font-semibold text-gray-900 dark:text-white mb-3">
              {group.title}
            </h3>

            <ul className="space-y-4">
              {group.items.map((it) => (
                <li key={it.id} className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <it.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </div>

                  <div className="flex-1">
                    <span className="text-ml text-gray-700 dark:text-gray-300">
                      {it.text}
                    </span>

                    {it.status === "new" && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded border border-emerald-500 text-emerald-700 bg-emerald-100">
                        NEW
                      </span>
                    )}

                    {it.status === "upcoming" && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded border border-amber-500 text-amber-700 bg-amber-100">
                        UPCOMING
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
const landingTestimonials = [
  {
    id: 3,
    name: "Video Testimonial",
    rating: 5,
    type: "video",
    videoId: "Sy3L8EvYymg",
    channelHandle: "@harbola",
    channelUrl: "https://www.youtube.com/@harbola"
  },
  {
    id: 13,
    name: "IIT Indore ",
    organization: "",
    type: "video",
    videoId: "RDeXvp7ikec",
    channelHandle: "@WaterClimateSustainabilityLab",
    channelUrl: "https://www.youtube.com/channel/UCRUR2bFwd_KGBOhveB4SH5g"
  },
  {
    id: 2,
    name: "Abhishek Verma",
    role: "",
    organization: "IIT Roorkee",
    rating: 5,
    contentImage: abhishek,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7411699547602759680/"
   },
];

const TestimonialCard = ({ testimonial, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay }}
      className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:shadow-lg transition-shadow duration-150 flex flex-col h-full"
    >
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">
            {testimonial.name}
            {testimonial.organization && `, ${testimonial.organization}`}
          </p>

          {testimonial.url && (
            <a
              href={testimonial.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-3 text-primary-600 dark:text-primary-400 text-sm font-medium flex-shrink-0"
            >
              LinkedIn
            </a>
          )}
          {testimonial.channelHandle && testimonial.channelUrl && (
            <a
              href={testimonial.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              {testimonial.channelHandle}
            </a>
          )}
          </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-neutral-50 dark:bg-neutral-900 p-3 flex items-center justify-center">
        {testimonial.type === "video" ? (
          <div
            className="w-full rounded-lg overflow-hidden shadow-sm"
            style={{ maxHeight: "500px", aspectRatio: "9 / 16" }}
          >
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${testimonial.videoId}`}
              title="Video testimonial"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <img
            src={testimonial.contentImage}
            alt={`${testimonial.name} testimonial`}
            className="w-full h-auto rounded-lg shadow-sm"
            style={{ maxHeight: "500px", objectFit: "contain" }}
          />
        )}
      </div>
    </motion.div>
  );
};

const LogoOrInitials = ({ src, alt, initials }) => {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div className="w-50 h-40 rounded-2xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-100 dark:border-neutral-700 flex items-center justify-center text-lg font-semibold text-neutral-900 dark:text-white shadow-sm">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-50 h-40 object-contain rounded-2xl"
    />
  );
};

const PartnerTile = ({ partner, delay = 0 }) => (
  <motion.article
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.22, delay }}
    className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-200"
  >
    <div className="flex flex-col items-center gap-4">
      <div className="w-56 h-30 flex items-center justify-center">
        <LogoOrInitials
          src={partner.logo}
          alt={partner.name}
          initials={partner.name.split(' ').map(n => n[0]).slice(0,2).join('')}
        />
      </div>

      <h4 className="text-lg font-semibold text-neutral-900 dark:text-white leading-snug text-center">
        {partner.name}
      </h4>
    </div>

    <div className="mt-6 flex items-center justify-between gap-4">
      

      <span className="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[10rem]">
        {new URL(partner.link).hostname.replace('www.', '')}
      </span>
      <a
        href={partner.link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-transparent bg-primary-50 dark:bg-primary-600/10 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-600/20 transition-colors duration-150"
      >
        Visit
      </a>
    </div>
  </motion.article>
);

const PartnersSection = ({ partners = [] }) => (
  <motion.section
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, delay: 0.34 }}
    className="mb-12"
  >
    <section className="py-16 bg-neutral-50 dark:bg-neutral-900">
    <h3 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-white text-center mb-8">
      Partners
    </h3>

    <div className="max-w-6xl mx-auto px-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {partners.map((p, i) => (
          <PartnerTile partner={p} key={p.name} delay={0.04 * i} />
        ))}
      </div>
    </div>
    </section>
  </motion.section>
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

  /* core product features (kept for How It Works) */
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

const groupedFeatures = [
  {
    title: "Content Creation",
    items: [
      // UPCOMING
      

      // NEW
      { id: 'paper-to-poster', icon: FiLayout, text: 'Paper → Poster', status: 'new' },
      { id: 'paper-to-reels', icon: FiVideo, text: 'Paper → Reels', status: 'new' },
      { id: 'paper-to-podcast', icon: FiMic, text: 'Paper → Podcast', status: 'new' },
      { id: 'ppt-templates', icon: FiFileText, text: 'PowerPoint Templates', status: 'new' },
      { id: 'upload-new-images', icon: FiImage, text: 'Upload New Images', status: 'new' },

      // OLD
      { id: 'paper-upload', icon: FiFileText, text: 'Paper Upload', status: 'old' },
      { id: 'ai-script', icon: FiZap, text: 'AI Script Generation', status: 'old' },
    ],
  },
  {
    title: "Media & Distribution",
    items: [
      // OLD
      { id: 'voice', icon: FiMic, text: 'Voice Synthesis', status: 'old' },
      { id: 'video', icon: FiVideo, text: 'Video Production', status: 'old' },
      { id: 'youtube', icon: FiYoutube, text: 'Direct YouTube Publishing', status: 'old' },
      { id: 'share', icon: FiShare2, text: 'Social Sharing', status: 'old' },

      // OLD (but still belongs here)
      { id: 'patent2video', icon: FiVideo, text: 'Patent2Video', status: 'old' },
    ],
  },
  {
    title: "Automation & Integrations",
    items: [
      // OLD
      { id: 'browser-extension', icon: FiZap, text: 'Browser Extension', status: 'old' },
      { id: 'bhashini', icon: FiGlobe, text: 'Bhashini Integration', status: 'old' },
      { id: 'pdf-video', icon: FiUpload, text: 'PDF → Video', status: 'old' },
      { id: 'ppt-output', icon: FiFileText, text: 'PowerPoint Output', status: 'old' },
    ],
  },
  {
    title: "Insights & Feedback",
    items: [
      // OLD
      { id: 'analytics', icon: FiBarChart2, text: 'Usage Analytics', status: 'old' },
      { id: 'feedback', icon: FiMessageSquare, text: 'Feedback Channels', status: 'old' },
    ],
  },
];
const Partners = [
  {
    name: "Anusandhan National Research Foundation (ANRF)",
    logo: anrf_logo,
    link: "https://www.anrfonline.in/",
  },
  {
    name: "Sarvam",
    logo: sarvam_logo,
    link: "https://www.sarvam.ai/"
  },
  {
    name: "Google",
    logo: google,
    link: "https://cloud.google.com/edu/researchers",
  }
];


  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-150">
      <UnifiedHeader />
      {/* Hero Section */}
      <section className="py-16 md:py-20 border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center">
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
                {loading ? <LoadingSpinner size="sm" /> : 'SARALify'}
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
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4">
              See Saral AI in Action
            </h2>
          </motion.div>

          {/* Two videos side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* left video */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.05 }}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 text-center">
              Saral podcast demo
            </h3>

            <div className="aspect-video rounded-lg overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-700">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/K6mUnh1aXMQ"
                title="Saral podcast demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </motion.div>
          
           {/* right video */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 text-center">
              Hands-on Session with ANRF
            </h3>

            <div className="aspect-video rounded-lg overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-700">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/ORRieF7JI_w"
                title="Hands-on Session with ANRF"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </motion.div>

          </div>
        </div>
      </section>


      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-white dark:bg-neutral-800 scroll-mt-20">
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

      {/* All Features Section (flat list with status field) */}
      <section id="features" className="py-16 bg-neutral-50 dark:bg-neutral-900">
       <div className="max-w-[1300px] mx-auto px-6">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
              All Features
            </h2>
          </div>

          {/* Single-box 3-column layout */}
         <GroupedFeatureColumns groups={groupedFeatures} />
        </div>
      </section>
      
      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4">
              Trusted by Researchers
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Researchers and faculty across top institutions use Saral AI to make
              their work more accessible and impactful.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {landingTestimonials.map((t, index) => (
              <TestimonialCard
                key={t.id}
                testimonial={t}
                delay={index * 0.05}
              />
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              to="/testimonials"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              View more testimonials <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <PartnersSection partners={Partners} />

      {/* Final CTA Section */}
      <section className="py-20 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="card p-10 text-center"
          >
            <h2 className="text-3xl font-semibold text-neutral-900 dark:text-white mb-4">
              Ready to Transform Your Research?
            </h2>

            <p className="text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Join researchers and faculty using Saral AI to turn academic papers into
              engaging videos, podcasts, and presentations — in minutes, not weeks.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleGetStarted}
                disabled={loading}
                className="btn-primary flex items-center gap-2 px-6 py-3 text-base"
              >
                {loading ? <LoadingSpinner size="sm" /> : "SARALify your research"}
                {!loading && <FiArrowRight className="w-4 h-4" />}
              </button>

            </div>
          </motion.div>
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