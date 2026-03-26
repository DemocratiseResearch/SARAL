// src/lib/analytics.js
import mixpanel from 'mixpanel-browser';

const TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN || '';

let _initialized = false;
let _identifiedId = null; // guard to avoid repeated identify calls in dev/hmr

const isProd =  import.meta.env.MODE === 'production';
const isHMR = typeof module !== 'undefined' && module.hot;

/**
 * NOTE:
 * - In development or during HMR we disable persistence to avoid localStorage locking
 *   issues that the mixpanel SDK uses internally.
 * - We also use a global guard on window so HMR re-executions don't re-init.
 */
const Analytics = {
  init() {
    if (!TOKEN) {
      console.warn(
        'Mixpanel token is not set (REACT_APP_MIXPANEL_TOKEN). Analytics disabled.'
      );
      _initialized = false;
      return;
    }

    // global guard to avoid re-init on HMR / multiple bundles
    if (typeof window !== 'undefined' && window.__MIXPANEL_INITIALIZED) {
      _initialized = true;
      return;
    }

    if (_initialized) return;

    try {
      const opts = {};

      // In dev/HMR: skip persistence (avoid localStorage locks). In prod keep defaults.
      if (!isProd || isHMR) {
        // disable_persistence is supported by mixpanel-browser to avoid localStorage usage
        opts.disable_persistence = true;
        // also keep debug true in non-prod for easier tracing
        opts.debug = true;
      } else {
        // production defaults: explicit persistence can be left to mixpanel default
        opts.persistence = 'localStorage';
        opts.debug = false;
      }

      mixpanel.init(TOKEN, opts);

      // mark initialized globally so HMR doesn't re-init
      if (typeof window !== 'undefined') window.__MIXPANEL_INITIALIZED = true;

      _initialized = true;
      console.debug('[analytics] mixpanel initialized', { isProd, isHMR });
    } catch (e) {
      console.warn('mixpanel.init failed', e);
      _initialized = false;
    }
  },

  _isReady() {
    return _initialized && mixpanel && typeof mixpanel.track === 'function';
  },

  /**
   * Idempotent identify: only calls identify once for a given id.
   * Protects against StrictMode double-invoke and HMR remounts.
   */
  identify(distinctId) {
    if (!this._isReady() || !distinctId) return;
    try {
      if (_identifiedId === distinctId) return;
      _identifiedId = distinctId;
      mixpanel.identify(distinctId);
    } catch (e) {
      console.warn('mixpanel.identify failed', e);
    }
  },

  /**
   * alias: ensure we don't alias identical ids; wrap in try/catch.
   */
  alias(oldId, newId) {
    if (!this._isReady() || !oldId || !newId || oldId === newId) return;
    try {
      mixpanel.alias(newId, oldId);
    } catch (e) {
      console.warn('mixpanel.alias failed', e);
    }
  },

  setUserProperties(properties = {}) {
    if (!this._isReady()) return;
    try {
      if (mixpanel.people) mixpanel.people.set(properties);
      mixpanel.register(properties);
    } catch (e) {
      console.warn('mixpanel.setUserProperties failed', e);
    }
  },

  setUserOnce(properties = {}) {
    if (!this._isReady()) return;
    try {
      if (mixpanel.people && mixpanel.people.set_once) {
        mixpanel.people.set_once(properties);
      }
    } catch (e) {
      console.warn('mixpanel.setUserOnce failed', e);
    }
  },

  /**
   * Safe track: logs but never throws.
   */
  track(eventName, props = {}) {
    if (!this._isReady()) {
      // optionally buffer events in dev if you want, but skip for now
      // console.debug('Analytics.track skipped (not initialized):', eventName, props);
      return;
    }
    try {
      mixpanel.track(eventName, props);
    } catch (e) {
      console.warn('mixpanel.track failed', e);
    }
  },

  timeEvent(eventName) {
    if (!this._isReady()) return;
    try {
      if (mixpanel.time_event) mixpanel.time_event(eventName);
    } catch (e) { /* ignore */ }
  },

  reset() {
    try {
      mixpanel.reset && mixpanel.reset();
      _initialized = false;
      _identifiedId = null;
      if (typeof window !== 'undefined') window.__MIXPANEL_INITIALIZED = false;
    } catch (e) {
      console.warn('mixpanel.reset failed', e);
    }
  },

  getDistinctId() {
    try {
      return (mixpanel && mixpanel.get_distinct_id && mixpanel.get_distinct_id()) || null;
    } catch {
      return null;
    }
  },

  optOut() {
    try {
      mixpanel.opt_out_tracking && mixpanel.opt_out_tracking();
    } catch (e) {
      console.warn('mixpanel.opt_out_tracking failed', e);
    }
  },

  optIn() {
    try {
      mixpanel.opt_in_tracking && mixpanel.opt_in_tracking();
    } catch (e) {
      console.warn('mixpanel.opt_in_tracking failed', e);
    }
  },

  // expose for tests/debug
  _internal_isInitialized() {
    return _initialized;
  }
};

export default Analytics;
