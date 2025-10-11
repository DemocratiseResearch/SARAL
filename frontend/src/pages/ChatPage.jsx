import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSend, FiArrowLeft } from 'react-icons/fi';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import Layout from '../components/common/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatMessage = ({ message, isUser }) => (
  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
    <div
      className={`max-w-lg px-4 py-2 rounded-lg ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white prose dark:prose-invert prose-sm'
      }`}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap">{message}</p>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({node, children, ...props}) => <h1 className="text-xl font-bold mb-2" {...props}>{children}</h1>,
            h2: ({node, children, ...props}) => <h2 className="text-lg font-semibold mb-2" {...props}>{children}</h2>,
            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal list-inside" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc list-inside" {...props} />,
            li: ({node, ...props}) => <li className="mb-1" {...props} />,
            code: ({node, inline, ...props}) => 
              inline ? (
                <code className="bg-gray-300 dark:bg-gray-600 px-1 rounded text-sm" {...props} />
              ) : (
                <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded my-2 overflow-x-auto">
                  <code className="text-sm" {...props} />
                </pre>
              )
          }}
        >
          {String(message)}
        </ReactMarkdown>
      )}
    </div>
  </div>
);

const ChatPage = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const chatHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    try {
      const response = await apiService.askQuestion(paperId, input, chatHistory);
      const aiMessage = { role: 'ai', content: response.data.answer };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error asking question:', error);
      toast.error('Failed to get a response from the AI.');
       const aiMessage = { role: 'ai', content: "Sorry, I couldn't get a response. Please try again." };
       setMessages((prev) => [...prev, aiMessage]);
    } finally {
      setLoading(false);
    }
  };
  
  const breadcrumbs = [{ label: 'Chat', href: `/chat/${paperId}` }];

  return (
    <Layout title="Interactive Chat" breadcrumbs={breadcrumbs}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 flex flex-col h-[70vh]"
      >
        <div className="flex-1 overflow-y-auto mb-4 pr-4 custom-scrollbar">
          {messages.map((msg, index) => (
            <ChatMessage key={index} message={msg.content} isUser={msg.role === 'user'} />
          ))}
          {/* ⭐️ FIX: Handle loading state separately to avoid object rendering ⭐️ */}
          {loading && (
            <div className="flex justify-start mb-4">
              <div className="max-w-lg px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700">
                <LoadingSpinner />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the paper..."
            className="input-primary flex-1"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="btn-primary p-3"
          >
            <FiSend className="w-5 h-5" />
          </button>
        </form>
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
            Back to Upload
          </button>
        </motion.div>
    </Layout>
  );
};

export default ChatPage;

