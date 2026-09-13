'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, AuthTokens } from './types';
import { apiClient } from './api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  quickSwitchDemo: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('fleet_token');
    if (savedToken) {
      setToken(savedToken);
      apiClient<User>('/auth/me')
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          // Token expired or invalid
          localStorage.removeItem('fleet_token');
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiClient<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem('fleet_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, fullName: string, role: UserRole = 'DISPATCHER') => {
    const data = await apiClient<AuthTokens>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        role,
      }),
    });

    localStorage.setItem('fleet_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('fleet_token');
    setToken(null);
    setUser(null);
  };

  const quickSwitchDemo = async (role: UserRole) => {
    // Automatically seed accounts if not present
    try {
      await apiClient('/auth/seed-demo-users', { method: 'POST' });
    } catch {
      // Seed already exists or offline
    }

    const emailMap: Record<UserRole, string> = {
      ADMIN: 'admin@fleetopt.io',
      DISPATCHER: 'dispatcher@fleetopt.io',
      DRIVER: 'driver@fleetopt.io',
      FLEET_MANAGER: 'manager@fleetopt.io',
    };

    await login(emailMap[role], 'password123');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        quickSwitchDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
