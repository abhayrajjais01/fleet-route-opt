'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  MapPin,
  Bot,
  Layers,
  ShieldCheck,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileCheck2,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function HomePage() {
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    apiClient('/health')
      .then((data) => {
        setBackendHealth(data);
        setLoadingHealth(false);
      })
      .catch((err) => {
        setBackendHealth({ status: 'offline', error: err.message });
        setLoadingHealth(false);
      });
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero Banner */}
      <div className="p-8 rounded-2xl bg-gradient-to-r from-blue-950/60 via-command-card to-purple-950/40 border border-command-border relative overflow-hidden">
        <div className="max-w-3xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
            <Cpu className="w-3.5 h-3.5" />
            Parallel Full-Stack Engineering Platform
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            AI Fleet Route Optimizer Command Center
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Enterprise logistics optimization combining deterministic graph algorithms (DSA / VRPTW)
            with multi-agent generative AI (LangGraph) and verified RAG compliance grounding.
          </p>

          <div className="pt-2 flex items-center gap-4 text-xs font-mono">
            <span className="text-slate-400">Database Engine:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
              {loadingHealth ? 'Checking...' : backendHealth?.database?.dialect || 'SQLite local'}
            </span>
            <span className="text-slate-400">System Mode:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-400 border border-slate-700">
              {loadingHealth ? 'Checking...' : backendHealth?.environment || 'development'}
            </span>
          </div>
        </div>
      </div>

      {/* Two Parallel Tracks Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Track A: Manthan Nimodiya */}
        <div className="p-6 rounded-xl bg-command-surface border border-emerald-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-white text-base">Track A: Core & Operations</h2>
                <p className="text-xs text-emerald-400 font-mono">Lead: Manthan Nimodiya</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
              DSA & Map
            </span>
          </div>

          <p className="text-xs text-slate-300">
            Owns deterministic VRPTW optimization, spatial distance matrix calculations, Leaflet route visualization, drag-and-drop waypoint resequencing, and in-transit FSM telemetry.
          </p>

          <div className="space-y-2 pt-2 border-t border-command-border">
            <Link
              href="/dashboard"
              className="flex items-center justify-between p-2.5 rounded-lg bg-command-card/60 hover:bg-command-card border border-command-border text-xs text-slate-200 transition"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Live Dispatch Map Canvas</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-command-muted" />
            </Link>

            <Link
              href="/routes"
              className="flex items-center justify-between p-2.5 rounded-lg bg-command-card/60 hover:bg-command-card border border-command-border text-xs text-slate-200 transition"
            >
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>Deterministic VRPTW Solver</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-command-muted" />
            </Link>

            <Link
              href="/tracking"
              className="flex items-center justify-between p-2.5 rounded-lg bg-command-card/60 hover:bg-command-card border border-command-border text-xs text-slate-200 transition"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Driver Telemetry & Actions</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-command-muted" />
            </Link>
          </div>
        </div>

        {/* Track B: Abhayraj Jaiswal */}
        <div className="p-6 rounded-xl bg-command-surface border border-purple-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-white text-base">Track B: GenAI & Governance</h2>
                <p className="text-xs text-purple-400 font-mono">Lead: Abhayraj Jaiswal</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
              LangGraph & RAG
            </span>
          </div>

          <p className="text-xs text-slate-300">
            Owns the LangGraph multi-agent copilot, RAG logistics knowledge base, RBAC JWT security, human-in-the-loop action proposals, and executive operational KPI analytics.
          </p>

          <div className="space-y-2 pt-2 border-t border-command-border">
            <Link
              href="/copilot"
              className="flex items-center justify-between p-2.5 rounded-lg bg-command-card/60 hover:bg-command-card border border-command-border text-xs text-slate-200 transition"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-400" />
                <span>LangGraph Multi-Agent Copilot</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-command-muted" />
            </Link>

            <Link
              href="/compliance"
              className="flex items-center justify-between p-2.5 rounded-lg bg-command-card/60 hover:bg-command-card border border-command-border text-xs text-slate-200 transition"
            >
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-purple-400" />
                <span>RAG Compliance Knowledge Base</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-command-muted" />
            </Link>

            <Link
              href="/analytics"
              className="flex items-center justify-between p-2.5 rounded-lg bg-command-card/60 hover:bg-command-card border border-command-border text-xs text-slate-200 transition"
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span>Executive KPI Analytics Dashboard</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-command-muted" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
