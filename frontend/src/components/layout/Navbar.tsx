'use client';

import React from 'react';
import Link from 'next/link';
import { Truck, ShieldCheck, Activity, BrainCircuit } from 'lucide-react';

export default function Navbar() {
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
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Backend API: Online
        </div>

        <div className="text-xs text-command-muted border-l border-command-border pl-4 flex items-center gap-2">
          <span>Active Track:</span>
          <span className="text-slate-300 font-mono">Parallel Dev Mode</span>
        </div>
      </div>
    </header>
  );
}
