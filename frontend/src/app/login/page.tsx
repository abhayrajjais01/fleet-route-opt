'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyRound,
  Mail,
  Lock,
  User as UserIcon,
  ShieldCheck,
  Truck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { UserRole } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, register, logout, quickSwitchDemo } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('DISPATCHER');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        setSuccessMsg('Authentication successful! Redirecting...');
        setTimeout(() => router.push('/'), 800);
      } else {
        await register(email, password, fullName, role);
        setSuccessMsg('Account registered successfully! Redirecting...');
        setTimeout(() => router.push('/'), 800);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoClick = async (demoRole: UserRole) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await quickSwitchDemo(demoRole);
      setSuccessMsg(`Logged in as Demo ${demoRole}!`);
      setTimeout(() => router.push('/'), 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch demo account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Active User Banner if already logged in */}
      {user && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              {user.role[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Active Session: {user.full_name}</p>
              <p className="text-xs text-emerald-400 font-mono">
                {user.email} • Role: {user.role}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
            >
              Go to Command Center <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Quick Role Switcher Showcase */}
      <div className="p-6 rounded-2xl bg-command-surface border border-command-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>1-Click Demo Role Switcher (Pre-Seeded Accounts)</span>
          </div>
          <span className="text-[11px] font-mono text-command-muted">Track B: RBAC Verification</span>
        </div>

        <p className="text-xs text-slate-400">
          Click any persona below to authenticate instantly with JWT tokens and test role-restricted permissions.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => handleDemoClick('ADMIN')}
            disabled={loading}
            className="p-3 rounded-xl bg-command-card/80 hover:bg-command-card border border-blue-500/30 hover:border-blue-500/60 text-left transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400">👑 ADMIN</span>
              <ArrowRight className="w-3 h-3 text-command-muted group-hover:text-blue-400 transition" />
            </div>
            <p className="text-[11px] text-slate-300">admin@fleetopt.io</p>
            <p className="text-[10px] text-command-muted">Full system config & analytics</p>
          </button>

          <button
            onClick={() => handleDemoClick('DISPATCHER')}
            disabled={loading}
            className="p-3 rounded-xl bg-command-card/80 hover:bg-command-card border border-emerald-500/30 hover:border-emerald-500/60 text-left transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">🚛 DISPATCHER</span>
              <ArrowRight className="w-3 h-3 text-command-muted group-hover:text-emerald-400 transition" />
            </div>
            <p className="text-[11px] text-slate-300">dispatcher@fleetopt.io</p>
            <p className="text-[10px] text-command-muted">Routes, Map & AI Copilot</p>
          </button>

          <button
            onClick={() => handleDemoClick('DRIVER')}
            disabled={loading}
            className="p-3 rounded-xl bg-command-card/80 hover:bg-command-card border border-amber-500/30 hover:border-amber-500/60 text-left transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400">🚚 DRIVER</span>
              <ArrowRight className="w-3 h-3 text-command-muted group-hover:text-amber-400 transition" />
            </div>
            <p className="text-[11px] text-slate-300">driver@fleetopt.io</p>
            <p className="text-[10px] text-command-muted">Assigned trips & actions</p>
          </button>

          <button
            onClick={() => handleDemoClick('FLEET_MANAGER')}
            disabled={loading}
            className="p-3 rounded-xl bg-command-card/80 hover:bg-command-card border border-purple-500/30 hover:border-purple-500/60 text-left transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-400">📋 MANAGER</span>
              <ArrowRight className="w-3 h-3 text-command-muted group-hover:text-purple-400 transition" />
            </div>
            <p className="text-[11px] text-slate-300">manager@fleetopt.io</p>
            <p className="text-[10px] text-command-muted">Vehicles & Drivers CRUD</p>
          </button>
        </div>
      </div>

      {/* Main Form */}
      <div className="max-w-md mx-auto p-8 rounded-2xl bg-command-surface border border-command-border shadow-2xl space-y-6">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {mode === 'login' ? 'Operational Sign In' : 'Register Operator Account'}
          </h2>
          <p className="text-xs text-command-muted">
            {mode === 'login'
              ? 'Enter credentials to access the fleet dispatch platform'
              : 'Create a new operator account with role privileges'}
          </p>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-command-muted" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Dispatcher"
                    className="w-full bg-command-card border border-command-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <p className="text-[10px] text-command-muted mt-1">Minimum 2 characters</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full bg-command-card border border-command-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="DISPATCHER">Dispatcher (Routes, Map, Copilot)</option>
                  <option value="DRIVER">Driver (Active Trips, Stop Updates)</option>
                  <option value="FLEET_MANAGER">Fleet Manager (Asset Management)</option>
                  <option value="ADMIN">Administrator (Full Access)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-2.5 text-command-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@fleetopt.io"
                className="w-full bg-command-card border border-command-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-2.5 text-command-muted" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-command-card border border-command-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            {mode === 'register' && (
              <p className="text-[10px] text-command-muted mt-1">Minimum 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In to Command Center' : 'Create Account'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-command-border">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setErrorMsg(null);
            }}
            className="text-xs text-blue-400 hover:underline"
          >
            {mode === 'login'
              ? "Don't have an operator account? Register here"
              : 'Already have credentials? Sign in here'}
          </button>
        </div>
      </div>
    </div>
  );
}
