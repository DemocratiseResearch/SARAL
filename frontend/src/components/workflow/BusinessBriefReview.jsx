import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { FiEdit2, FiFileText } from "react-icons/fi";

/**
 * Renders a section content string.
 * Lines starting with • or - are rendered as bullet list items;
 * everything else is rendered as a paragraph.
 */
const SectionContent = ({ content }) => {
  if (!content) return null;

  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const elements = [];
  let bulletBuffer = [];

  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      elements.push(
        <ul
          key={`ul-${elements.length}`}
          className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 text-sm leading-relaxed"
        >
          {bulletBuffer.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bulletBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("•") || trimmed.startsWith("- ")) {
      bulletBuffer.push(trimmed.replace(/^[•-]\s*/, ""));
    } else {
      flushBullets();
      elements.push(
        <p
          key={`p-${idx}`}
          className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed"
        >
          {trimmed}
        </p>,
      );
    }
  });
  flushBullets();

  return <div className="space-y-3">{elements}</div>;
};

const BusinessBriefReview = ({ sections, onEdit, onShowPdf }) => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const sectionEntries = Object.entries(sections || {});

  if (sectionEntries.length === 0) {
    return (
      <div className="max-w-3xl mx-auto pt-5 px-4 pb-20">
        <div className="text-center py-8 text-gray-500">
          No business brief sections available.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-5 px-4 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Business Brief
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Review the generated business brief below. You can edit individual
            sections or proceed to download the PDF.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sectionEntries.map(([title, content], idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 space-y-3"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
              <SectionContent content={content} />
            </motion.div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium transition-colors"
          >
            <FiEdit2 className="w-5 h-5" />
            Edit Sections
          </button>
          <button
            onClick={onShowPdf}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-black dark:bg-slate-800 dark:hover:bg-slate-700 hover:bg-gray-800 text-white font-medium transition-colors"
          >
            <FiFileText className="w-5 h-5" />
            Show Business Brief
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BusinessBriefReview;
