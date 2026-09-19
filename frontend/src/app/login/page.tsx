'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Compass,
  Radio,
  Layers,
  Mail,
  Lock,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  KeyRound,
  ShieldCheck,
  Cpu,
  LockKeyhole,
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
  const [showPassword, setShowPassword] = useState(false);

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
        setSuccessMsg('Session authenticated. Redirecting to Command Center...');
        setTimeout(() => router.push('/'), 700);
      } else {
        await register(email, password, fullName, role);
        setSuccessMsg('Operator registered successfully. Initializing session...');
        setTimeout(() => router.push('/'), 700);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoClick = async (demoRole: UserRole) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await quickSwitchDemo(demoRole);
      setSuccessMsg(`Authenticated as verified ${demoRole}. Redirecting...`);
      setTimeout(() => router.push('/'), 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch demo account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 sm:py-8 space-y-6">
      {/* Active Session Notification Banner */}
      {user && (
        <div className="p-4 rounded-2xl bg-[#0f1d2a] border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-sm">
              {user.role[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">{user.full_name}</p>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                  ACTIVE SESSION
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {user.email} • Role: <span className="text-emerald-300 font-bold">{user.role}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => router.push('/')}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition"
            >
              <span>Command Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition border border-white/[0.06]"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main Dual-Column Enterprise Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Platform Trust & Telemetry Overview */}
        <div className="lg:col-span-5 p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-[#0e1628] to-[#0a0f1d] border border-white/[0.08] shadow-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>ENTERPRISE IDENTITY GATEWAY</span>
            </div>

            <h2 className="text-2xl font-black text-white tracking-tight font-sans">
              FleetOpt Security & Access Governance
            </h2>

            <p className="text-xs text-slate-400 leading-relaxed">
              Cryptographically signed JSON Web Tokens (JWT) enforcing zero-trust role-based access control (RBAC) across spatial dispatch, VRPTW heuristics, and GenAI agent tool calling.
            </p>

            <div className="space-y-3 pt-4 border-t border-white/[0.06]">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                  <LockKeyhole className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Granular Role Permissions</p>
                  <p className="text-[11px] text-slate-400">Strict separation of duties across Dispatchers, Drivers, Fleet Managers, and Administrators.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">SOC-2 & Audit-Ready</p>
                  <p className="text-[11px] text-slate-400">Immutable audit logs tracking driver actions, waypoint overrides, and dispatch decisions.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0 mt-0.5">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Copilot Guardrails</p>
                  <p className="text-[11px] text-slate-400">LangGraph agent tool executions require human verification based on caller permissions.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#070b14]/80 border border-white/[0.05] text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Auth Service: Active</span>
            </span>
            <span className="text-slate-500">SHA-256 / HS256</span>
          </div>
        </div>

        {/* Right Column: 1-Click Role Verification + Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1-Click Verified Operator Roles (NO EMOJIS) */}
          <div className="p-6 rounded-2xl bg-[#0f1728]/80 border border-white/[0.08] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-xs font-mono uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Verified Operator Personas (1-Click Switch)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Track B Security</span>
            </div>

            <p className="text-xs text-slate-400">
              Instantly issue cryptographic JWT credentials to evaluate role-gated platform features.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* ADMIN */}
              <button
                type="button"
                onClick={() => handleDemoClick('ADMIN')}
                disabled={loading}
                className="p-3.5 rounded-xl bg-[#0c1322] hover:bg-[#141f36] border border-blue-500/30 hover:border-blue-500/60 text-left transition group space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-blue-500/20 text-blue-400">
                      <Shield className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-blue-400">ADMINISTRATOR</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition" />
                </div>
                <p className="text-[11px] font-mono text-slate-300">admin@fleetopt.io</p>
                <p className="text-[10px] text-slate-500">System config, user RBAC & analytics</p>
              </button>

              {/* DISPATCHER */}
              <button
                type="button"
                onClick={() => handleDemoClick('DISPATCHER')}
                disabled={loading}
                className="p-3.5 rounded-xl bg-[#0c1322] hover:bg-[#141f36] border border-emerald-500/30 hover:border-emerald-500/60 text-left transition group space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-emerald-500/20 text-emerald-400">
                      <Compass className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-emerald-400">DISPATCHER</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-emerald-400 transition" />
                </div>
                <p className="text-[11px] font-mono text-slate-300">dispatcher@fleetopt.io</p>
                <p className="text-[10px] text-slate-500">Routes, Live Map & Copilot dispatch</p>
              </button>

              {/* DRIVER */}
              <button
                type="button"
                onClick={() => handleDemoClick('DRIVER')}
                disabled={loading}
                className="p-3.5 rounded-xl bg-[#0c1322] hover:bg-[#141f36] border border-amber-500/30 hover:border-amber-500/60 text-left transition group space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
                      <Radio className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-amber-400">COMMERCIAL DRIVER</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 transition" />
                </div>
                <p className="text-[11px] font-mono text-slate-300">driver@fleetopt.io</p>
                <p className="text-[10px] text-slate-500">Assigned trips & delivery confirmations</p>
              </button>

              {/* FLEET MANAGER */}
              <button
                type="button"
                onClick={() => handleDemoClick('FLEET_MANAGER')}
                disabled={loading}
                className="p-3.5 rounded-xl bg-[#0c1322] hover:bg-[#141f36] border border-purple-500/30 hover:border-purple-500/60 text-left transition group space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-purple-500/20 text-purple-400">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-purple-400">FLEET MANAGER</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-purple-400 transition" />
                </div>
                <p className="text-[11px] font-mono text-slate-300">manager@fleetopt.io</p>
                <p className="text-[10px] text-slate-500">Vehicles, Drivers & Depots CRUD roster</p>
              </button>
            </div>
          </div>

          {/* Credentials Form Box */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#0f1728]/80 border border-white/[0.08] shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-bold text-white">
                  {mode === 'login' ? 'Operator Sign In' : 'Register Operator Account'}
                </h3>
                <p className="text-xs text-slate-400">
                  {mode === 'login'
                    ? 'Authenticate using assigned enterprise credentials'
                    : 'Provision a new operator profile with designated RBAC privileges'}
                </p>
              </div>

              {/* Mode Switch Pills */}
              <div className="flex items-center bg-[#090e18] p-1 rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    mode === 'login' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    mode === 'register' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Register
                </button>
              </div>
            </div>

            {/* Error / Success Feedback */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Full Operator Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Sarah Jenkins"
                        className="w-full bg-[#090e18] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Designated Privilege Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full bg-[#090e18] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                    >
                      <option value="DISPATCHER">DISPATCHER (Routes, Live Map & Copilot)</option>
                      <option value="DRIVER">DRIVER (Assigned Trips & Telemetry)</option>
                      <option value="FLEET_MANAGER">FLEET_MANAGER (Asset Management CRUD)</option>
                      <option value="ADMIN">ADMIN (Full Governance & Security)</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@fleetopt.io"
                    className="w-full bg-[#090e18] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#090e18] border border-white/[0.08] rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-2.5 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Token...</span>
                  </span>
                ) : mode === 'login' ? (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Sign In to Console</span>
                  </>
                ) : (
                  <>
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Create Operator Profile</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
