// src/components/common/SessionTracker.jsx
import { useEffect, useRef } from 'react';
import Analytics from '../../lib/analytics';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../contexts/AuthContext';

/**
 * SessionTracker
 * - Starts a session only when the user is logged in (isAuthenticated && user).
 * - Tracks Session Start and Session End.
 * - Debounces visibilitychange to avoid counting tab switches as full sessions.
 * - Ignores tiny sessions (bounces) < MIN_VALID_SESSION_SECONDS.
 * - Updates people profile with last_session_* and increments total_time_seconds.
 */

const MIN_VALID_SESSION_SECONDS = 2; // ignore sessions shorter than this
const VISIBILITY_DEBOUNCE_MS = 5000; // wait before ending session on tab hidden

export default function SessionTracker() {
  const { isAuthenticated, user } = useAuth();
  const sessionIdRef = useRef(null);
  const startTsRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const hiddenTimerRef = useRef(null);

  const fmt = (totalSec) => {
    const sec = totalSec % 60;
    const mins = Math.floor((totalSec % 3600) / 60);
    const hrs = Math.floor(totalSec / 3600);
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (hrs === 0 && sec > 0) parts.push(`${sec}s`);
    return parts.join(' ').trim() || '0s';
  };

  useEffect(() => {
    // Only operate when user is logged in.
    if (!isAuthenticated || !user) {
      // If we had an active session and user just logged out, end it now.
      if (sessionIdRef.current && !sessionEndedRef.current) {
        // End with reason "logout_or_unauthenticated"
        const now = Date.now();
        const durSec = Math.round((now - (startTsRef.current || now)) / 1000);
        // Only record meaningful sessions
        if (durSec >= MIN_VALID_SESSION_SECONDS) {
          try {
            const distinct = Analytics.getDistinctId && Analytics.getDistinctId();
            Analytics.track('Session End', {
              timestamp: new Date().toISOString(),
              session_id: sessionIdRef.current,
              reason: 'logout_or_unauthenticated',
              user_id: user?.id || null,
              distinct_id: distinct || null,
              duration_seconds: durSec,
              duration_human: fmt(durSec),
            });
            // update people
            if (Analytics.peopleIncrement) {
              Analytics.peopleIncrement('total_time_seconds', durSec);
            } else if (window.mixpanel?.people?.increment) {
              window.mixpanel.people.increment('total_time_seconds', durSec);
            }
            if (Analytics.setUserProperties) {
              Analytics.setUserProperties({
                last_session_at: new Date().toISOString(),
                last_session_seconds: durSec,
                last_session_human: fmt(durSec),
              });
            } else if (window.mixpanel?.people?.set) {
              window.mixpanel.people.set({
                last_session_at: new Date().toISOString(),
                last_session_seconds: durSec,
                last_session_human: fmt(durSec),
              });
            }
          } catch (e) {
            console.warn('Session end on logout failed', e);
          }
        }
      }

      // cleanup refs & timers
      sessionIdRef.current = null;
      startTsRef.current = null;
      sessionEndedRef.current = false;
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
      return; // do nothing further if user is not authenticated
    }

    // ---------- FROM HERE: user is authenticated ----------
    // Initialize analytics (safe to call repeatedly)
    try { Analytics.init(); } catch (e) { /* ignore */ }

    // Attempt to alias anonymous id to user id and identify user in analytics
    try {
      const anonId = Analytics.getDistinctId && Analytics.getDistinctId();
      const userDistinctId = (user?.id?.toString()) || user?.email || null;
      if (anonId && userDistinctId && anonId !== userDistinctId) {
        // alias if available
        try { Analytics.alias && Analytics.alias(anonId, userDistinctId); } catch(e) { /* ignore */ }
      }
      if (userDistinctId) {
        try { Analytics.identify && Analytics.identify(userDistinctId); } catch(e) { /* ignore */ }
        // also set people properties for this user
        const safeProfile = {
          $email: user?.email,
          $name: user?.name,
          platform: 'Saral',
        };
        try {
          Analytics.setUserProperties && Analytics.setUserProperties(safeProfile);
        } catch (e) { /* ignore */ }
        try {
          if (window.mixpanel?.people?.set) {
            window.mixpanel.people.set({
              $email: user?.email,
              $name: user?.name,
              platform: 'Saral',
            });
          }
        } catch(e) { /* ignore */ }
      }
    } catch (e) {
      console.warn('identify/alias failed', e);
    }

    // If a session is already active, don't re-create it.
    if (sessionIdRef.current && !sessionEndedRef.current) {
      // already tracking
    } else {
      // start new session
      sessionIdRef.current = `sess_${uuidv4()}`;
      startTsRef.current = Date.now();
      sessionEndedRef.current = false;

      const distinct = (Analytics.getDistinctId && Analytics.getDistinctId()) || null;
      const userId = (user?.id?.toString()) || user?.email || null;

      try {
        Analytics.track('Session Start', {
          timestamp: new Date().toISOString(),
          session_id: sessionIdRef.current,
          user_id: userId,
          distinct_id: distinct,
          is_logged_in: true,
        });
      } catch (e) {
        console.warn('Session Start track failed', e);
      }
    }

    // helper: send session end (will be guarded by sessionEndedRef)
    const sendSessionEnd = (reason) => {
      if (sessionEndedRef.current) return;
      sessionEndedRef.current = true;

      const now = Date.now();
      const durSec = Math.round((now - (startTsRef.current || now)) / 1000);

      // ignore tiny bounces
      if (durSec < MIN_VALID_SESSION_SECONDS) {
        sessionIdRef.current = null;
        startTsRef.current = null;
        return;
      }

      const distinct2 = (Analytics.getDistinctId && Analytics.getDistinctId()) || null;
      const userId2 = (user?.id?.toString()) || user?.email || null;

      try {
        Analytics.track('Session End', {
          timestamp: new Date().toISOString(),
          session_id: sessionIdRef.current,
          reason,
          user_id: userId2,
          distinct_id: distinct2,
          duration_seconds: durSec,
          duration_human: fmt(durSec),
        });
      } catch (e) {
        console.warn('Session End track failed', e);
      }

      // update people totals (best-effort)
      try {
        if (Analytics.peopleIncrement) {
          Analytics.peopleIncrement('total_time_seconds', durSec);
        } else if (window.mixpanel?.people?.increment) {
          window.mixpanel.people.increment('total_time_seconds', durSec);
        }

        if (Analytics.setUserProperties) {
          Analytics.setUserProperties({
            last_session_at: new Date().toISOString(),
            last_session_seconds: durSec,
            last_session_human: fmt(durSec),
          });
        } else if (window.mixpanel?.people?.set) {
          window.mixpanel.people.set({
            last_session_at: new Date().toISOString(),
            last_session_seconds: durSec,
            last_session_human: fmt(durSec),
          });
        }
      } catch (e) {
        console.warn('Failed to update people profile with session duration', e);
      }

      // cleanup
      sessionIdRef.current = null;
      startTsRef.current = null;
    };

    // handle visibility change with debounce (avoid many short sessions when user switches tabs)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // start a timer; if user comes back quickly we cancel it
        if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = setTimeout(() => {
          sendSessionEnd('visibility_hidden_debounced');
          hiddenTimerRef.current = null;
        }, VISIBILITY_DEBOUNCE_MS);
      } else {
        // user returned — cancel any pending hidden timer
        if (hiddenTimerRef.current) {
          clearTimeout(hiddenTimerRef.current);
          hiddenTimerRef.current = null;
        }
      }
    };

    // beforeunload: try to end session synchronously (best-effort)
    const onBeforeUnload = () => {
      sendSessionEnd('beforeunload');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    // cleanup on unmount or when auth changes
    return () => {
      // ensure session end recorded when the effect unmounts (eg on logout)
      try {
        sendSessionEnd('component_unmount');
      } catch (e) { /* ignore */ }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  return null;
}
