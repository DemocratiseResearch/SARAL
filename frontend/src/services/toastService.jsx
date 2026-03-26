import toast from 'react-hot-toast';
import React from 'react';
import { FiX } from 'react-icons/fi';

const DEMO_MODE = true; // Toggle this for demos

// Store the last toast ID to replace it with the new one
let lastToastId = null;

const positiveErrorMessages = [
  "Something went wrong, we are on it! Let's try again.",
  // "Something went wrong, but don't fret — let's give it another shot!",
  // "Oops! That didn't work as expected. Ready to try again?",
  "Hmm, hit a small snag. No worries — let's give it another go!",
  // "That didn't quite work out. Let's try that again!",
  "Quick hiccup there! Please try again.",
  // "Not quite right this time. Let's give it another shot!",
  // "Encountered a little bump. Let's try once more!",
  // "That didn't go as planned. Shall we try again?",
];

const getRandomPositiveMessage = () => {
  const randomIndex = Math.floor(Math.random() * positiveErrorMessages.length);
  return positiveErrorMessages[randomIndex];
};

const dismissPreviousToast = () => {
  // Remove all toasts completely to ensure only one shows
  toast.remove();
  lastToastId = null;
};

// Custom toast component with close button
const ToastWithClose = ({ message, toastId, type = 'success' }) => (
  <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg shadow-lg ${
    type === 'error' ? 'bg-white border border-red-200' :
    type === 'loading' ? 'bg-white border border-blue-200' :
    'bg-white border border-green-200'
  }`}>
    <span className={`text-sm font-medium max-w-xs overflow-hidden text-ellipsis ${
      type === 'error' ? 'text-black' :
      type === 'loading' ? 'text-blue-600' :
      'text-green-600'
    }`}>
      {message}
    </span>
    <button
      onClick={() => {
        toast.dismiss(toastId);
        lastToastId = null;
      }}
      className={`flex-shrink-0 p-1 rounded transition-colors ${
        type === 'error' ? 'text-black hover:bg-gray-100' :
        type === 'loading' ? 'text-blue-600 hover:bg-blue-50' :
        'text-green-600 hover:bg-green-50'
      }`}
      aria-label="Close notification"
      type="button"
    >
      <FiX className="w-5 h-5" />
    </button>
  </div>
);

const toastService = {
  success: (message, options = {}) => {
    dismissPreviousToast();
    const toastId = toast.custom((t) => (
      <ToastWithClose message={message} toastId={t.id} type="success" />
    ), { 
      duration: Infinity,
      position: 'top-right',
      ...options 
    });
    lastToastId = toastId;
    return toastId;
  },
  error: (message, options = {}) => {
    dismissPreviousToast();
    const errorMessage = DEMO_MODE ? getRandomPositiveMessage() : message;
    const toastId = toast.custom((t) => (
      <ToastWithClose message={errorMessage} toastId={t.id} type="error" />
    ), { 
      duration: Infinity,
      position: 'top-right',
      ...options 
    });
    lastToastId = toastId;
    return toastId;
  },
  loading: (message, options = {}) => {
    dismissPreviousToast();
    const toastId = toast.custom((t) => (
      <ToastWithClose message={message} toastId={t.id} type="loading" />
    ), { 
      duration: Infinity,
      position: 'top-right',
      ...options 
    });
    lastToastId = toastId;
    return toastId;
  },
  promise: (promise, messages, options = {}) => {
    dismissPreviousToast();
    if (DEMO_MODE) {
      const demoMessages = {
        ...messages,
        error: getRandomPositiveMessage(),
      };
      const toastId = toast.custom((t) => (
        <ToastWithClose message={demoMessages.loading} toastId={t.id} type="loading" />
      ), { 
        duration: Infinity,
        position: 'top-right',
        ...options 
      });
      lastToastId = toastId;

      return promise
        .then((res) => {
          toast.dismiss(toastId);
          const successToastId = toast.custom((t) => (
            <ToastWithClose message={demoMessages.success} toastId={t.id} type="success" />
          ), { duration: Infinity, position: 'top-right' });
          lastToastId = successToastId;
          return res;
        })
        .catch((err) => {
          toast.dismiss(toastId);
          const errorToastId = toast.custom((t) => (
            <ToastWithClose message={demoMessages.error} toastId={t.id} type="error" />
          ), { duration: Infinity, position: 'top-right' });
          lastToastId = errorToastId;
          throw err;
        });
    } else {
      const toastId = toast.custom((t) => (
        <ToastWithClose message={messages.loading} toastId={t.id} type="loading" />
      ), { 
        duration: Infinity,
        position: 'top-right',
        ...options 
      });
      lastToastId = toastId;

      return promise
        .then((res) => {
          toast.dismiss(toastId);
          const successToastId = toast.custom((t) => (
            <ToastWithClose message={messages.success} toastId={t.id} type="success" />
          ), { duration: Infinity, position: 'top-right' });
          lastToastId = successToastId;
          return res;
        })
        .catch((err) => {
          toast.dismiss(toastId);
          const errorToastId = toast.custom((t) => (
            <ToastWithClose message={messages.error} toastId={t.id} type="error" />
          ), { duration: Infinity, position: 'top-right' });
          lastToastId = errorToastId;
          throw err;
        });
    }
  },
  custom: (message, options = {}) => {
    dismissPreviousToast();
    const toastId = toast.custom((t) => (
      <ToastWithClose message={message} toastId={t.id} type="success" />
    ), { 
      duration: Infinity,
      position: 'top-right',
      ...options 
    });
    lastToastId = toastId;
    return toastId;
  },

  dismissAll: () => {
    lastToastId = null;
    return toast.remove();
  },

  dismiss: (toastId) => {
    if (lastToastId === toastId) {
      lastToastId = null;
    }
    return toast.dismiss(toastId);
  },

  remove: (toastId) => {
    if (lastToastId === toastId) {
      lastToastId = null;
    }
    return toast.remove(toastId);
  },
};

export default toastService;
export const isDemoMode = () => DEMO_MODE;
