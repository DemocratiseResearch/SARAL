// TtsPickerModal.jsx
import { AnimatePresence, motion } from "framer-motion";

export default function TtsPickerModal({ open, onClose, onPick }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          {/* card */}
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            className="relative z-10 w-full max-w-sm rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Select TTS Engine
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose which TTS to use for the video.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onPick("bhashini")}
                className="px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 font-medium"
              >
                Bhashini
              </button>
              <button
                onClick={() => onPick("sarvam")}
                className="px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Sarvam
              </button>
            </div>

            <button
              onClick={onClose}
              className="mt-4 w-full text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
