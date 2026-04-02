import React from "react";
import { motion } from 'framer-motion';
import { FiMessageCircle } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import testimonial3 from '../testimonial_imgs/aaditya_pandey.png';
import UnifiedHeader from '../components/common/UnifiedHeader';
import anupam from '../testimonial_imgs/anupam.png'
import abhishek from '../testimonial_imgs/Abhishek.png';
import rashmi from '../testimonial_imgs/Rashmi.png';
import prem from '../testimonial_imgs/prem.png';
import seetha from '../testimonial_imgs/seetha.png';
import iitr from '../testimonial_imgs/iitr.png';

const TestimonialCard = ({ testimonial, delay = 0 }) => {
  const isVideo = testimonial.type === "video";

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
      <div className="flex-1 bg-neutral-50 dark:bg-neutral-900 p-4 flex items-center justify-center">
        {isVideo ? (
          <div
            className="w-full rounded-lg overflow-hidden shadow-sm"
            style={{ maxHeight: "600px", aspectRatio: "9 / 16" }}
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
        ) : testimonial.channelUrl ? (
          <a
            href={testimonial.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-full flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition"
          >
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Watch videos of Saral AI testimonials
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Published on YouTube
            </p>
            <span className="mt-4 text-sm font-semibold text-red-600 dark:text-red-400">
              View channel →
            </span>
          </a>
        ) : (
          testimonial.contentImage && (
            <img
              src={testimonial.contentImage}
              alt={`${testimonial.name} testimonial`}
              className="w-full h-auto rounded-lg shadow-sm"
              style={{ maxHeight: "600px", objectFit: "contain" }}
            />
          )
        )}
      </div>

    </motion.div>
  );
};

const testimonials = [
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
    id: 12,
    name: "Video Testimonial",
    rating: 5,
    type: "video",
    videoId: "Sy3L8EvYymg",
    channelHandle: "@harbola",
    channelUrl: "https://www.youtube.com/@harbola"
  },
  {
    id: 100,
    name: "Indian Institute of Technology, Roorkee",
    role: "",
    organization: "",
    rating: 5,
    contentImage: iitr,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7414543292480159744/"
   },
  {
    id: 11,
    name: "Abhishek Verma",
    role: "",
    organization: "IIT Roorkee",
    rating: 5,
    contentImage: abhishek,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7411699547602759680/"
   },
  {
    id: 10,
    name: "Rashmi Choudhary",
    role: "",
    organization: "IIT Roorkee",
    rating: 5,
    contentImage: rashmi,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7412113890169430017/"
  },
  {
    id: 9,
    name: "Prem Kumar Sharma",
    role: "",
    organization: "IIT Bombay",
    rating: 5,
    contentImage:  prem,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7409835343283294208/"
    },
  {
    id: 8,
    name: "Seethalakshmi B R",
    role: "",
    organization: "CSIR-Structural Engineering Research Centre",
    rating: 5,
    contentImage: seetha,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7400437344828420097/"  
  },
  {
    id: 7,
    name: "Anupam Sobti",
    role: "",
    organization: "Plaksha University",
    rating: 5,
    contentImage: anupam,
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7413272457983389696/"
    },
  {
    id:6,
    name: "Kanak Roy",
    role: "",
    organization: "Banaras Hindu University",
    rating: 5,
    contentImage: "/images/dcr_testimonial4.jpg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7359480510819061760/"
  },
  {
    id: 5,
    name: "Aaditya Pandey",
    role: "",
    organization: "IIT Roorkee",
    contentImage: testimonial3,
    url : "https://www.linkedin.com/feed/update/urn:li:activity:7409226873274171392/"
  },
  {
    id: 4,
    name: "Arindam Khan",
    role: "",
    organization: "IIT Kharagpur",
    contentImage: "/images/dcr_testimonial2.jpg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7369025758729596930/"
  },
  {
    id: 3,
    name: "Chitranshu Harbola",
    role: "",
    organization: "IIT Madras",
    contentImage: "/images/dcr_testimonial1.jpg",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7364500174263554048/"
  },
];

export default function Testimonials() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-150">
      <UnifiedHeader />

      <main className="max-w-7xl mx-auto px-6 py-12">
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

        <section className="mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.2 }}
            className="text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12"
          >
            Testimonials
          </motion.h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
           {testimonials.map((item, index) => {
  if (item.type === "channel") {
    return (
      <ChannelCard
        key={item.id}
        channel={item}
        delay={0.25 + index * 0.05}
      />
    );
  }

  return (
    <TestimonialCard
      key={item.id}
      testimonial={item}
      delay={0.25 + index * 0.05}
    />
  );
})}

          </div>
        </section>

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
            onClick={() => navigate('/api-setup')}
            className="btn-primary"
          >
            SARALify
          </button>
        </motion.section>
      </main>
    </div>
  );
}