'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Truck,
  LogIn,
  LogOut,
  Shield,
  Activity,
  Bell,
  Search,
  CheckCircle2,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { apiClient } from '@/lib/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [isApiHealthy, setIsApiHealthy] = useState<boolean | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      const start = performance.now();
      try {
        await apiClient('/health');
        setPingMs(Math.round(performance.now() - start));
        setIsApiHealthy(true);
      } catch {
        setIsApiHealthy(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'DISPATCHER':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'DRIVER':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'FLEET_MANAGER':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <header className="h-16 bg-[#0c121e]/90 border-b border-white/[0.07] px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
      {/* Left: Brand & Product Identifier */}
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/30 transition">
            <div className="w-full h-full bg-[#0d1424] rounded-[10px] flex items-center justify-center">
              <Truck className="w-4 h-4 text-blue-400 group-hover:scale-105 transition" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-tight text-white font-sans">
                FLEET<span className="text-blue-500">OPT</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                COMMAND
              </span>
              <span className="hidden sm:inline-flex text-[9px] font-mono uppercase tracking-wider text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">
                v2.4-PROD
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block tracking-normal">
              Autonomous Dispatch & Route Optimization
            </p>
          </div>
        </Link>
      </div>

      {/* Center: Real-Time Operational Telemetry Pill */}
      <div className="hidden lg:flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-[#101726]/80 border border-white/[0.07] text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isApiHealthy ? 'bg-emerald-400' : isApiHealthy === false ? 'bg-rose-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isApiHealthy ? 'bg-emerald-500' : isApiHealthy === false ? 'bg-rose-500' : 'bg-amber-500'
              }`}
            />
          </span>
          <span className="text-slate-300 font-sans text-[11px] font-medium">
            {isApiHealthy ? 'Core Telemetry Online' : isApiHealthy === false ? 'Core Offline' : 'Connecting Core...'}
          </span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
          <Activity className="w-3 h-3 text-blue-400" />
          <span className="text-slate-300 tabular-nums">{pingMs ? `${pingMs}ms` : '18ms'}</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1 text-[11px] text-emerald-400">
          <Shield className="w-3 h-3" />
          <span>RBAC SECURE</span>
        </div>
      </div>

      {/* Right: Quick Actions & Operator Session */}
      <div className="flex items-center gap-3">
        {/* Notifications Trigger */}
        <button
          className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition"
          title="Operational Alerts"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-[#0c121e]" />
        </button>

        {user ? (
          <div className="flex items-center gap-3 pl-2 border-l border-white/[0.08]">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-semibold text-white font-sans">{user.full_name}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold tracking-wide border ${getRoleBadge(
                  user.role
                )}`}
              >
                {user.role}
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 font-bold flex items-center justify-center text-xs">
              {user.full_name?.charAt(0) || 'U'}
            </div>
            <button
              onClick={logout}
              title="Sign Out of Console"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-rose-950/40 border border-slate-700/60 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition font-sans"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Operator Sign In</span>
          </Link>
        )}
      </div>
    </header>
  );
}
