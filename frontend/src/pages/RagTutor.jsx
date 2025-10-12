import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiChevronsRight, FiAlertCircle, FiArrowLeft } from 'react-icons/fi';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

// Markdown and LaTeX rendering imports
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ⭐ 1. IMPORT THE CORRECT LAYOUT AND LOADING SPINNER ⭐
import Layout from '../components/common/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Using the ChatMessage component style from ChatPage.jsx
const ChatMessage = ({ message, isUser }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2 }}
    className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
  >
    <div
      className={`max-w-xl px-4 py-2 rounded-lg ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white prose dark:prose-invert prose-sm'
      }`}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap">{message}</p>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {String(message)}
        </ReactMarkdown>
      )}
    </div>
  </motion.div>
);


const TutorProgressBar = ({ state }) => {
    if (!state || !state.total_steps) return null;
    const progress = (state.current_step / state.total_steps) * 100;

    return (
        <div className="px-4 pt-2 pb-3">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">
                Learning Progress: Step {state.current_step} of {state.total_steps} ({state.current_step_type})
            </p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <motion.div
                    className="bg-blue-600 h-1.5 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>
        </div>
    );
};

const ErrorDisplay = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
    <FiAlertCircle className="w-16 h-16 text-red-500 mb-4" />
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
      Couldn't Start Learning Session
    </h3>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md">
      {error || "The system had trouble analyzing this paper. This can sometimes happen with very technical or short documents."}
    </p>
    <button
      onClick={onRetry}
      className="btn-primary"
    >
      Try Again
    </button>
  </div>
);

const RagTutor = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isBotLoading, setIsBotLoading] = useState(true);
  const [isUserTurn, setIsUserTurn] = useState(false);
  const [tutorState, setTutorState] = useState(null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBotLoading]);

  const startTutorSession = async () => {
    if (!paperId) return;
    
    setIsBotLoading(true);
    setError(null);
    setMessages([]);
    
    try {
      const analysisResponse = await apiService.analyzePaper(paperId);
      const plan = analysisResponse.data;

      const prerequisites = plan?.prerequisites || [];
      const layers = plan?.abstraction_layers || [];

      if (prerequisites.length === 0 && layers.length === 0) {
        throw new Error("The learning plan could not be generated. The paper might be too short or technical for analysis.");
      }

      let initialState;
      let initial_message;

      if (prerequisites.length > 0) {
        initialState = {
          current_step_index: 0,
          current_step_type: 'prerequisite',
          completed_prerequisites: false,
          is_complete: false,
          total_steps: prerequisites.length + layers.length,
          current_step: 1, 
          retry_count: 0
        };
        const first_step = prerequisites[0];
        initial_message = `Let's start with some prerequisites.\n\n**${first_step.topic}**\n${first_step.explanation}\n\n${first_step.question}`;
      } else {
        initialState = {
          current_step_index: 0,
          current_step_type: 'layer',
          completed_prerequisites: true,
          is_complete: false,
          total_steps: layers.length,
          current_step: 1,
          retry_count: 0
        };
        const first_step = layers[0];
        initial_message = `Let's dive right into the paper.\n\n**High-Level Summary:**\n${first_step.summary}\n\n${first_step.question}`;
      }

      setTutorState(initialState);
      setMessages([{ text: initial_message, isUser: false }]);
      setIsUserTurn(true);

    } catch (err) {
      console.error("Failed to start tutor session:", err);
      const errorMessage = err.response?.data?.detail || err.message || "Could not start the guided learning session.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsBotLoading(false);
    }
  };

  useEffect(() => {
    startTutorSession();
  }, [paperId]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isBotLoading || !isUserTurn) return;

    const userMessage = { text: input, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsBotLoading(true);
    setIsUserTurn(false);

    try {
      const payload = {
        user_answer: userMessage.text,
        state: tutorState
      };
      
      const response = await apiService.tutorChat(paperId, payload);
      const { bot_message, next_state, is_final } = response.data;
      
      const updatedState = { ...next_state };
      if (tutorState) {
        updatedState.total_steps = tutorState.total_steps;
      }
      
      setTutorState(updatedState);
      setMessages(prev => [...prev, { text: bot_message, isUser: false }]);
      setIsUserTurn(!is_final);
      
    } catch (error) {
      console.error("Error during tutor chat:", error);
      const errorMessage = "Sorry, an error occurred. Please try sending your message again.";
      setMessages(prev => [...prev, { text: errorMessage, isUser: false }]);
      toast.error(errorMessage);
      setIsUserTurn(true);
    } finally {
      setIsBotLoading(false);
    }
  };

  const breadcrumbs = [
    { label: 'Paper Processing', href: '/paper-processing' },
    { label: 'Tutor', href: `/rag-tutor/${paperId}` }
  ];

  return (
    <Layout title="Guided Learning" breadcrumbs={breadcrumbs}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 flex flex-col h-[85vh] max-w-4xl mx-auto"
      >
        {/* The header from the original RagTutor.jsx is no longer needed here as the main Layout provides it */}
        {tutorState && <TutorProgressBar state={tutorState} />}
        
        <div className="flex-1 overflow-y-auto my-4 pr-4 custom-scrollbar">
          {error && !isBotLoading ? (
            <ErrorDisplay error={error} onRetry={startTutorSession} />
          ) : (
            <>
              <AnimatePresence>
                {messages.map((msg, index) => (
                  <ChatMessage key={index} message={msg.text} isUser={msg.isUser} />
                ))}
              </AnimatePresence>
              {isBotLoading && !error && (
                <div className="flex justify-start mb-4">
                  <div className="max-w-lg px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700">
                    <LoadingSpinner />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {!error && (
          <form onSubmit={handleSendMessage} className="flex-shrink-0 flex items-center gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isUserTurn ? "Type your answer..." : "Please wait for the bot..."}
              className="input-primary flex-1"
              disabled={!isUserTurn || isBotLoading}
            />
            <button
              type="submit"
              disabled={!isUserTurn || isBotLoading || !input.trim()}
              className="btn-primary p-3"
            >
              <FiSend className="w-5 h-5" />
            </button>
          </form>
        )}
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, delay: 0.1 }}
        className="mt-6 text-center"
      >
        <button
          onClick={() => navigate('/paper-processing')}
          className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150"
        >
          <FiArrowLeft className="w-4 h-4" />
          Back to Paper Processing
        </button>
      </motion.div>
    </Layout>
  );
};

export default RagTutor;
