// Replace ProcessingStatus with this component
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingSpinner from '../common/LoadingSpinner';

const TOTAL_DURATION_SECONDS = 100; // 1 minute 40 seconds

const STEP_SEQUENCES = {
  // sequences use the rephrased text above (friendly + concise)
  video: [
    'Extracting text from the PDF',
    'Generating the script',
    'Designing slides from the content',
    'Converting script to audio',
    'Rendering the final video'
  ],
  reel: [
    'Extracting text from the PDF',
    'Creating the dialogue',
    'Generating the audio narration',
    'Rendering the final short video'
  ],
  podcast: [
    'Extracting text from the PDF',
    'Creating the dialogue',
    'Generating the audio narration',
    'Rendering the final short video'
  ],
  importing: [
    'Fetching paper',
    'Parsing metadata',
    'Extracting figures'
  ],
  processing: [
    'Analyzing document',
    'Extracting content'
  ]
};

const ProcessingStatus = ({ mode = 'processing', pendingAction = null }) => {
  const steps = useMemo(() => STEP_SEQUENCES[mode] || STEP_SEQUENCES.processing, [mode]);

  // compute how long each step should be
  const stepDuration = useMemo(() => {
    if (!steps || steps.length === 0) return 5;
    return TOTAL_DURATION_SECONDS / steps.length;
  }, [steps]);

  const [index, setIndex] = useState(0);
  const [elapsedInStep, setElapsedInStep] = useState(0);

  useEffect(() => {
    // when mode changes, reset
    setIndex(0);
    setElapsedInStep(0);
  }, [mode, pendingAction]);

  useEffect(() => {
    let mounted = true;
    let rafId = null;
    let start = performance.now();

    // we will update elapsed in step using requestAnimationFrame for smooth progress
    const tick = (now) => {
      if (!mounted) return;
      const totalElapsedMs = now - start;
      const elapsedSec = totalElapsedMs / 1000;
      setElapsedInStep(elapsedSec);

      // if current step done, move to next
      if (elapsedSec >= stepDuration) {
        start = performance.now();
        setIndex((i) => {
          const next = i + 1;
          // if finished all steps, keep last step (UI still shows "Rendering..." etc.)
          if (next >= steps.length) {
            // stop advancing; keep showing last step but keep progress at 100%
            return steps.length - 1;
          }
          return next;
        });
        setElapsedInStep(0);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [stepDuration, steps.length]);

  // compute global progress %
  const completedSteps = index;
  const perStepPct = 1 / steps.length;
  const stepProgress = Math.min(1, elapsedInStep / stepDuration);
  const overallProgress = Math.min(1, completedSteps * perStepPct + stepProgress * perStepPct);

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-100 dark:border-yellow-800 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <LoadingSpinner size="sm" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">
              {/* main sentence: current step */}
              {steps[index]}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-300">
              {/* show step X of Y and ETA */}
              {index + 1}/{steps.length} • ETA {Math.max(0, Math.ceil((TOTAL_DURATION_SECONDS * (1 - overallProgress))))}s
            </div>
          </div>

          {/* progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded mt-2 overflow-hidden">
            <motion.div
              className="h-full bg-gray-900 dark:bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress * 100}%` }}
              transition={{ ease: 'linear', duration: 0.3 }}
            />
          </div>

          {/* small subtext showing upcoming step */}
          <div className="text-xs text-gray-600 dark:text-gray-300 mt-2">
            Next: {index + 1 < steps.length ? steps[index + 1] : 'Finishing up...'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStatus;