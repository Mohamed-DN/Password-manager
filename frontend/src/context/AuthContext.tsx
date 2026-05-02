import React, { createContext, useState, useContext, useEffect } from 'react';
import { AuthState } from '../types';

interface AuthContextType extends AuthState {
  login: (token: string, user: string, fullName: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>({
    user: localStorage.getItem('user'),
    token: localStorage.getItem('token'),
    fullName: localStorage.getItem('fullName'),
  });

  const login = (token: string, user: string, fullName: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', user);
    localStorage.setItem('fullName', fullName);
    setAuth({ token, user, fullName });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('fullName');
    setAuth({ token: null, user: null, fullName: null });
  };

  const isAuthenticated = !!auth.token;

  return (
    <AuthContext.Provider value={{ ...auth, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
