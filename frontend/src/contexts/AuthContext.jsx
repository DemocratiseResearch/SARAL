// src/contexts/AuthContext.jsx
// Authentication disabled for local use
import React, { createContext, useContext, useState } from 'react';
// import api from '../services/api';  // Commented out for local use

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // Authentication disabled for local use - always authenticated
  const [user] = useState({ name: 'Local User', email: 'local@example.com' });
  const [loading] = useState(false);
  const [token] = useState('local-dev-token');

  // All authentication functions disabled for local use
  // useEffect(() => {
  //   const interceptor = api.interceptors.request.use((config) => {
  //     if (token) {
  //       config.headers.Authorization = `Bearer ${token}`;
  //     }
  //     return config;
  //   });
  //   return () => api.interceptors.request.eject(interceptor);
  // }, [token]);

  // useEffect(() => {
  //   if (token) {
  //     verifyToken();
  //   } else {
  //     setLoading(false);
  //   }
  // }, []);

  // const verifyToken = async () => {
  //   try {
  //     const response = await api.get('/auth/verify');
  //     setUser(response.data.user);
  //   } catch (error) {
  //     console.error('Token verification failed:', error);
  //     logout();
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const loginWithGoogle = async (googleToken) => {
    // Login disabled for local use - always successful
    console.log('Login attempted - authentication disabled for local use');
    return { success: true };
  };

  const logout = () => {
    // Logout disabled for local use
    console.log('Logout attempted - authentication disabled for local use');
  };

  const value = {
    user,
    token,
    loading,
    loginWithGoogle,
    logout,
    isAuthenticated: true  // Always authenticated for local use
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
    );
};
