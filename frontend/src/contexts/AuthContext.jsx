// frontend/src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { apiService } from '../services/api';
import Analytics from '../lib/analytics';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));

  // initialize analytics once
  useEffect(() => {
    Analytics.init();
  }, []);

  // Set up API interceptor for auth headers
  useEffect(() => {
    const interceptor = apiService.interceptors.request.use((config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    }, (error) => Promise.reject(error));

    return () => apiService.interceptors.request.eject(interceptor);
  }, [token]);

  const identifyInMixpanel = useCallback((distinctId, profile = {}) => {
    try {
      const anonId = Analytics.getDistinctId();
      if (anonId && anonId !== distinctId) {
        Analytics.alias(anonId, distinctId);
      }
      Analytics.identify(distinctId);
      const safeProfile = {
        $email: profile.email,
        $name: profile.name,
        platform: 'Saral',
      };
      Analytics.setUserProperties(safeProfile);
    } catch (e) {
      console.warn('identifyInMixpanel error', e);
    }
  }, []);

  const logout = useCallback(async ({ silent = false } = {}) => {
    try {
      await apiService.auth?.logout?.();
    } catch (error) {
      console.warn('Backend logout failed:', error);
    } finally {
      if (!silent) {
        Analytics.track('User Logged Out', { page: window.location.pathname });
      }
      Analytics.reset();
      setToken(null);
      setUser(null);
      localStorage.removeItem('auth_token');
    }
  }, []);

  const verifyToken = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get('/auth/verify');
      const serverUser = response.data.user;
      setUser(serverUser);

      const distinctId = serverUser?.id?.toString() || serverUser?.email || null;
      if (distinctId) identifyInMixpanel(distinctId, {
        email: serverUser.email,
        name: serverUser.name
      });

    } catch (error) {
      console.error('Token verification failed:', error);
      logout({ silent: true });
    } finally {
      setLoading(false);
    }
  }, [identifyInMixpanel, logout]);

  // Check authentication status on app load or token change
  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      setLoading(false);
    }
  }, [token, verifyToken]);

  const loginWithGoogle = async (googleToken) => {
    try {
      setLoading(true);

      let decoded = null;
      try {
        decoded = jwtDecode(googleToken);
      } catch (e) {
        // ignore decode errors
      }

      const response = await apiService.post('/auth/google/login', {
        token: googleToken
      });

      const { access_token, user: serverUser } = response.data;

      setToken(access_token);
      setUser(serverUser);
      localStorage.setItem('auth_token', access_token);

      const distinctId = serverUser?.id?.toString() || decoded?.sub || serverUser?.email || null;
      if (distinctId) {
        identifyInMixpanel(distinctId, {
          email: serverUser?.email || decoded?.email,
          name: serverUser?.name || decoded?.name
        });
      }

      Analytics.track('User Logged In', {
        method: 'google',
        flow: serverUser?.preferred_flow || null,
        page: window.location.pathname
      });

      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      Analytics.track('User Login Failed', {
        error: error?.response?.data || error?.message,
        page: window.location.pathname
      });
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed'
      };
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    token,
    loading,
    loginWithGoogle,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
