import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageCircle, FiX, FiSend, FiStar } from 'react-icons/fi';
import toast from '../../services/toastService';
import { apiService } from '../../services/api';
import { useLocation } from 'react-router-dom';


const feedbackMap = {
  '/': {
    title: 'Landing page feedback',
    questionKey: 'landing_overall',
    question: 'What was your first impression of the landing page?',
    placeholder: 'What grabbed your attention? Any confusing copy or CTAs?'
  },
  '/about': {
    title: 'About page feedback',
    questionKey: 'about_clarity',
    question: 'Did the About page explain who we are clearly?',
    placeholder: 'Was anything unclear or missing?'
  },
  '/sample': {
    title: 'Samples / Videos page feedback',
    questionKey: 'videos_relevance',
    question: 'Were the sample videos helpful and relevant?',
    placeholder: 'Which sample stood out or which was confusing?'
  },
  '/testimonials': {
    title: 'Testimonials page feedback',
    questionKey: 'testimonials_trust',
    question: 'Did the testimonials build trust for you?',
    placeholder: 'Any testimonial you found especially useful or suspicious?'
  },
  '/api-setup': {
    title: 'API Setup feedback',
    questionKey: 'api_setup_flow',
    question: 'Was the API setup flow clear and easy to follow?',
    placeholder: 'What step was painful or needs better docs?'
  },
  '/paper-processing': {
    title: 'Paper Processing feedback',
    questionKey: 'paper_processing_accuracy',
    question: 'How accurate/useful were the paper processing results?',
    placeholder: 'Tell us about any missing info or errors you saw.'
  },
  '/script-generation': {
    title: 'Script Generation feedback',
    questionKey: 'script_quality',
    question: 'How useful and coherent were the generated scripts?',
    placeholder: 'What would make the script generation better for you?'
  },
  '/slide-creation': {
    title: 'Slide Creation feedback',
    questionKey: 'slides_quality',
    question: 'Did the generated slides match your expectations?',
    placeholder: 'Design, content, or layout — what needs improvement?'
  },
  '/media-generation': {
    title: 'Media Generation feedback',
    questionKey: 'media_quality',
    question: 'How would you rate the media generation (images/video/etc.)?',
    placeholder: 'Any artifacts, quality issues or feature requests?'
  },
  '/results': {
    title: 'Results page feedback',
    questionKey: 'results_relevance',
    question: 'Were the results relevant and actionable?',
    placeholder: 'What did you expect vs what you got?'
  },
  '/youtube-login': {
    title: 'YouTube login feedback',
    questionKey: 'youtube_login_flow',
    question: 'Did YouTube login work smoothly for you?',
    placeholder: 'Any auth errors or confusing steps?'
  },
  '/oauth2callback': {
    title: 'OAuth callback feedback',
    questionKey: 'oauth_callback',
    question: 'Did OAuth redirect / callback work correctly?',
    placeholder: 'Describe any failures or unexpected behaviour.'
  },
  '/video-preview': {
    title: 'Video Preview feedback',
    questionKey: 'video_preview_experience',
    question: 'Was the video preview accurate and fast?',
    placeholder: 'Playback, quality, or UX issues — tell us.'
  },
  '/video-display': {
    title: 'Video Display feedback',
    questionKey: 'video_display_quality',
    question: 'How would you rate the final video display page?',
    placeholder: 'Anything missing: captions, controls, quality?'
  }
};const defaultConfig = {
  title: 'Share Your Feedback',
  questionKey: 'general',
  question: 'Tell us what you think.',
  placeholder: 'What did you like? What could be improved?'
};

const FeedbackWidget = () => {
  const location = useLocation();
  const config = feedbackMap[location.pathname] || defaultConfig;

  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [additionalComment, setAdditionalComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    if (!comment.trim()) {
      toast.error('Please write a comment');
      return;
    }

    setIsSubmitting(true);

    try {
      // Primary feedback submission
      await apiService.feedback.submit({
        rating,
        comment: comment.trim(),
        page: location.pathname,
        questionKey: config.questionKey,
        fb_question: config.question
      });

      toast.success('Thank you for your feedback!');
      // reset primary fields
      setRating(0);
      setComment('');
      setIsOpen(false);
    } catch (error) {
      console.error('Feedback submission error:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to submit feedback. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }

    // Send additional comment as a separate API call if provided
    if (additionalComment.trim()) {
      // don't block or re-open main toast flow; just try to send it
      try {
        if (apiService?.feedback?.submitAdditional) {
          await apiService.feedback.submitAdditional({
            comment: additionalComment.trim(),
            page: location.pathname,
            questionKey: `${config.questionKey}_additional`,
            fb_question: 'Additional comments'
          });
        } else {
          // fallback if backend uses same endpoint but expects a flag
          await apiService.feedback.submit({
            rating: null,
            comment: additionalComment.trim(),
            page: location.pathname,
            questionKey: `${config.questionKey}_additional`,
            fb_question: 'Additional comments',
            is_additional: true
          });
        }
        // clear additional comment on success
        setAdditionalComment('');
      } catch (err) {
        console.error('Additional comment submission error:', err);
        // Non-blocking: inform devs/users but do not undo main success
        toast.error('Additional comment failed to send. It won’t affect your main feedback.');
      }
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300"
            aria-label="Open feedback form"
          >
            <FiMessageCircle className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 z-40 md:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] md:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FiMessageCircle className="w-5 h-5 text-white" />
                  <h3 className="text-white font-semibold">{config.title}</h3>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/80 hover:text-white transition-colors"
                  aria-label="Close feedback form"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {config.question}
                  </label>
                  <div className="flex gap-2 justify-center py-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <motion.button
                        key={star}
                        type="button"
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="focus:outline-none"
                      >
                        <FiStar
                          className={`w-8 h-8 transition-all duration-150 ${
                            star <= (hoveredRating || rating)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={config.placeholder}
                    rows={3}
                    maxLength={500}
                    className="text-sm placeholder:text-s w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                    {comment.length}/500
                  </p>
                </div>

                {/* Separate additional comments textarea (optional) */}
                <div>
                  <textarea
                    value={additionalComment}
                    onChange={(e) => setAdditionalComment(e.target.value)}
                    placeholder="Any additional comments/feedback? (optional)"
                    rows={2}
                    maxLength={500}
                    className="text-sm placeholder:text-s w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 resize-none"
                  />
                </div>

                <motion.button
                  type="submit"
                  disabled={isSubmitting || rating === 0}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-400 disabled:to-gray-400 text-white font-medium rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <FiSend className="w-4 h-4" />
                      Submit Feedback
                    </>
                  )}
                </motion.button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default FeedbackWidget;