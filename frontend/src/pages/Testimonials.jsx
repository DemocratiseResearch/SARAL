import React, { useState } from "react";
import { motion } from 'framer-motion';
import { FiArrowLeft, FiMessageCircle, FiImage, FiType } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/common/ThemeToggle';

const TestimonialCard = ({ testimonial, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay }}
      className="card overflow-hidden hover:shadow-lg transition-shadow duration-150 relative"
    >
      {testimonial.contentImage ? (
        <>
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                {testimonial.name && (
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {testimonial.name}{testimonial.organization && `, ${testimonial.organization}`}
                  </p>
                )}
              </div>
              
              {testimonial.url && (
                <a
                  href={testimonial.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium transition-colors duration-150"
                >
                  LinkedIn
                </a>
              )}
            </div>
          </div>
          <div className="w-full bg-neutral-50 dark:bg-neutral-800">
            <img
              src={testimonial.contentImage}
              alt="Testimonial"
              className="w-full h-auto object-contain"
            />
          </div>
        </>
      ) : (
        <div className="p-6">
          <div className="absolute top-4 right-4 text-primary-600 dark:text-primary-400 opacity-20">
            <FiMessageCircle className="w-8 h-8" />
          </div>
          
          {testimonial.content && (
            <blockquote className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4 italic">
              "{testimonial.content}"
            </blockquote>
          )}

          <div className="flex items-center justify-between">
            <div>
              {testimonial.name && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {testimonial.name}{testimonial.organization && `, ${testimonial.organization}`}
                </p>
              )}
            </div>
            
            {testimonial.url && (
              <a
                href={testimonial.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium transition-colors duration-150"
              >
                LinkendIn
              </a>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

const testimonials = [
     {
    id: 6,
    name: "Chittaranjan Hens",
    role: "",
    organization: "",
    rating: 5,
    // content: "This tool is a game-changer for academic presentations. The automated script generation is remarkably accurate, and the video quality is professional. My students love the format!",
    contentImage: "/images/dcr_testimonial6.jpeg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7374514071808856064/"
  },
   {
    id: 5,
    name: "Karthik Vaidyanathan",
    role: "Assistant Professor",
    organization: "IIIT Hyderabad",
    rating: 5,
    // content: "This tool is a game-changer for academic presentations. The automated script generation is remarkably accurate, and the video quality is professional. My students love the format!",
    contentImage: "/images/dcr_testimonial5.jpeg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7371576553526325249/"
  },
  {
    id: 1,
    name: "Chitranshu Harbola",
    role: "",
    organization: "IIT Madras",
    // rating: ,
    // content: "Saral AI has transformed how I present my research. What used to take days of creating slides and recording now takes just hours. The AI perfectly captures the essence of my papers and creates engaging presentations.",
    contentImage: "/images/dcr_testimonial1.jpg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7364500174263554048/"
  },
 
  {
    id: 2,
    name: "Arindam Khan",
    role: "",
    organization: "IIT Kharagpur",
    // rating: 4,
    // content: "As a grad student, I don't have much time for creating presentation materials. Saral AI helps me share my research with the broader community effortlessly. The interface is intuitive and the results are impressive.",
    contentImage: "/images/dcr_testimonial2.jpg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7369025758729596930/"
  },
  {
    id: 4,
    name: "Kanak Roy",
    role: "",
    organization: "Banaras Hindu University",
    rating: 5,
    contentImage: "/images/dcr_testimonial4.jpg",
    url: "https://saral.democratiseresearch.in/"
  },

  // {
  //   id: 5,
  //   name: "Dr. Maria González",
  //   role: "Postdoc Fellow",
  //   organization: "Harvard Medical School",
  //   rating: 5,
  //   content: "I've used Saral AI for presenting my medical research findings. The tool beautifully handles complex medical terminology and creates clear, engaging visualizations that help communicate with both peers and patients.",
  //   url: "https://saral.democratiseresearch.in/demo/maria-gonzalez"
  // },
  // {
  //   id: 6,
  //   name: "Dr. Alex Thompson",
  //   role: "Research Director",
  //   organization: "Microsoft Research",
  //   rating: 4,
  //   content: "Saral AI has significantly reduced the time our team spends on creating research presentations. The automated workflow is smooth, and the final videos maintain high academic standards while being accessible to wider audiences.",
  //   url: "https://saral.democratiseresearch.in/demo/alex-thompson"
  // }
];

// const stats = [
//   { number: "500+", label: "Research Papers Processed" },
//   { number: "98%", label: "User Satisfaction" },
//   { number: "50+", label: "Universities" },
//   { number: "10hrs", label: "Average Time Saved" }
// ];

export default function Testimonials() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-150">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150"
            >
              <FiArrowLeft className="w-4 h-4" />
              Back
            </button>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-neutral-900 dark:bg-white rounded-lg flex items-center justify-center">
                <span className="text-white dark:text-neutral-900 font-bold text-sm">SA</span>
              </div>
              <span className="font-semibold text-neutral-900 dark:text-white">
                Saral AI
              </span>
            </div>
            
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            What Researchers Say
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto leading-relaxed">
            Join researchers and academics who trust Saral AI to transform their research papers into engaging video presentations.
          </p>
        </motion.section>
{/* 
        Stats Section
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
        >
          {stats.map((stat, index) => (
            <div key={index} className="card p-6 text-center">
              <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 mb-2">
                {stat.number}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.section> */}

        {/* Testimonials Grid */}
        <section className="mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.2 }}
            className="text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12"
          >
            Testimonials
          </motion.h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard 
                key={testimonial.id} 
                testimonial={testimonial} 
                delay={0.25 + (index * 0.05)} 
              />
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.4 }}
          className="card p-8 text-center"
        >
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-4">
            Ready to Transform Your Research?
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            Join the growing community of researchers using Saral AI to make their work more accessible and engaging.
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Get Started Today
          </button>
        </motion.section>
      </main>
    </div>
  );
}
