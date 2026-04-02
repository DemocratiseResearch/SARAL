// src/pages/About.jsx - UPDATED
import React from "react";
import { motion } from 'framer-motion';
import { FiLinkedin, FiMail } from 'react-icons/fi';
import UnifiedHeader from '../components/common/UnifiedHeader';
import sai_ganesh from "../images/sai-ganesh.jpg";
import rahul_sundar from "../images/rahul-sundar.jpg";
import akhila from "../images/akhila.jpg";
import meghana from "../images/meghana.jpg";
import sairam from "../images/sairam.jpg";
import vishnu from "../images/vishnu.jpg";
import arka from "../images/arka.jpeg";
import samah from "../images/samah.jpeg";
import pk from "../images/pk.jpg";
import arihant from "../images/arihant.jpg";
import tejas from "../images/tejas.jpg";
import ram from "../images/ram.png";
import lakshmanan_nataraj from "../images/lakshmanan-nataraj.jpg";


const TeamMember = ({ member, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15, delay }}
    className="card p-6 text-center hover:shadow-lg transition-shadow duration-150"
  >
    <div className="w-24 h-24 mx-auto mb-4 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
      <img
        src={member.img}
        alt={member.name}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        className="w-full h-full object-cover"
      />
      {!member.img && (
        <div className="text-lg font-semibold text-neutral-800 dark:text-white">
          {member.name.split(' ').map(n => n[0]).slice(0,2).join('')}
        </div>
      )}
    </div>

    <h3 className="font-semibold text-neutral-900 dark:text-white mb-1">
      {member.name}
    </h3>
    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
      {member.role}
    </p>

    {member.linkedin && (
      <a
        href={member.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150"
      >
        <FiLinkedin className="w-5 h-5" />
        LinkedIn
      </a>
    )}
  </motion.div>
);

const TeamSection = ({ title, members, delay = 0 }) => (
  <motion.section
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15, delay }}
    className="mb-12"
  >
    <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6 text-center">
      {title}
    </h3>
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {members.map((member, index) => (
        <TeamMember
          key={member.name}
          member={member}
          delay={delay + (index * 0.05)}
        />
      ))}
    </div>
  </motion.section>
);


const StackTamers = [
  {
    name: "Akhila Sri Manasa Venigalla",
    role: "Technical Lead",
    img: akhila,
    linkedin: "https://www.linkedin.com/in/akhila-sri-manasa7896/",
  },
  {
    name: "Meghana Tatavolu",
    role: "Developer",
    img: meghana,
    linkedin: "https://www.linkedin.com/in/meghana-tatavolu/",
  },
  {
    name: "Sairam Bonu",
    role: "Developer",
    img: sairam,
    linkedin: "https://www.linkedin.com/in/sairam-bonu-779804238/",
  },
  {
    name: "Tejas Agarwal",
    role: "Developer",
    img: tejas,
    linkedin: "https://www.linkedin.com/in/tejasag0/",
  },
  {
    name: "Arkaprava Gaine", 
    role: "Developer",  
    img: arka,
    linkedin: "https://www.linkedin.com/in/arkagme/",
  },
  {
    name: "Samah Syed",
    role: "Developer",
    img: samah,
    linkedin: "https://www.linkedin.com/in/samah-syed/",
  },

];

const PastDevelopers = [
  {
    name: "Imandi Sai Ganesh",
    role: "Developer",
    img: sai_ganesh,
    linkedin: "https://www.linkedin.com/in/sai-ganesh-91505a261/",
  },
  {
    name: "Arihant Rastogi",
    role: "Developer",
    img: arihant,
    linkedin: "https://www.linkedin.com/in/arihant-rastogi-7605942aa/",
  },
  {
    name: "Vishnu Sathwik",
    role: "Developer",
    img: vishnu,
    linkedin: "https://www.linkedin.com/in/vishnu-sathwik-14117a257/",
  },
  {
    name: "Ram",
    role: "Developer",
    img: ram,
    linkedin: "https://www.linkedin.com/in/ram-from-tvl/",
  },
];

const ProjectManagers = [
  {
    name: "Dr. Lakshmanan Nataraj",
    role: "Project Manager",
    img: lakshmanan_nataraj,
    linkedin: "https://www.linkedin.com/in/lakshmanannataraj/",
  },
  {
    name: "Rahul Sundar",
    role: "Project Manager",
    img: rahul_sundar,
    linkedin: "https://www.linkedin.com/in/rahul-sundar-311a6977/",
  },
];

const PrincipalInvestigator = [
  {
    name: "Prof. Ponnurangam Kumaraguru",
    role: "Principal Investigator",
    img: pk,
    linkedin: "https://www.linkedin.com/in/ponguru/",
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-150">
      {/* Unified Header */}
      <UnifiedHeader />

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            About SARAL AI
          </h1>

          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto leading-relaxed">
            We democratize research by making academic workflows smoother, faster, and more accessible 
            through AI-integrated tools that transform complex papers into engaging video presentations.
          </p>
        </motion.section>

        {/* Mission Section */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.1 }}
          className="card p-8 mb-16"
        >
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-4">
            Our Mission
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            Research papers contain valuable insights that often remain locked behind technical jargon 
            and complex formatting. Saral AI bridges this gap by automatically converting academic papers 
            into accessible, engaging video presentations that can reach broader audiences and facilitate 
            better knowledge transfer.
          </p>
        </motion.section>

        {/* Team Section */}
        <section className="mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: 0.2 }}
            className="text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12"
          >
            Our Team
          </motion.h2>

          <TeamSection
            title="Stack Tamers"
            members={StackTamers}
            delay={0.25}
          />

          <TeamSection
            title="Project Managers"
            members={ProjectManagers}
            delay={0.3}
          />

          <TeamSection
            title="Principal Investigator"
            members={PrincipalInvestigator}
            delay={0.35}
          />

          <TeamSection
            title="Past Developers"
            members={PastDevelopers}
            delay={0.4}
          />
        </section>

        {/* Contact Section */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.45 }}
          className="card p-8 text-center"
        >
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-4">
            Get in Touch
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            Have questions about Saral AI or want to collaborate with us?
          </p>
          <a
            href="mailto:pk.guru@iiit.ac.in"
            className="btn-primary inline-flex items-center gap-2"
          >
            <FiMail className="w-4 h-4" />
            Contact Us
          </a>
        </motion.section>
      </main>
    </div>
  );
}