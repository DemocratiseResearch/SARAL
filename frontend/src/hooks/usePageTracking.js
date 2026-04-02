// src/hooks/usePageTracking.js
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Analytics from '../lib/analytics';

export default function usePageTracking() {
  const location = useLocation();
  const currentPath = location.pathname + location.search;
  const timerRef = useRef(null);
  const eventName = `Page View: ${currentPath}`;

  useEffect(() => {
    // start timer for this page view
    Analytics.timeEvent(eventName);
    Analytics.track('Page View', {
      path: currentPath,
      title: document.title,
      referrer: document.referrer,
      // Let Mixpanel attach client IP -> geo if allowed
    });

    return () => {
      // on unmount (route change), send the tracked event
      // mixpanel.time_event measures duration; but send a final event for extra props
      Analytics.track('Page Unload', {
        path: currentPath,
        title: document.title,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);
}
