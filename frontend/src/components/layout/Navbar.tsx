'use client';

import React from 'react';
import Link from 'next/link';
import { Truck, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'DISPATCHER':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'DRIVER':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'FLEET_MANAGER':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <header className="h-16 bg-command-surface border-b border-command-border px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
          <Truck className="w-5 h-5" />
        </div>
        <div>
          <Link href="/" className="text-lg font-bold tracking-wide text-white flex items-center gap-2">
            AI FLEET OPTIMIZER
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              v0.1.0
            </span>
          </Link>
          <p className="text-xs text-command-muted">VRPTW Optimization & Multi-Agent Dispatch</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold text-white">{user.full_name}</p>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${getRoleBadgeColor(
                  user.role
                )}`}
              >
                {user.role}
              </span>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In / Demo</span>
          </Link>
        )}
      </div>
    </header>
  );
}
