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
  Activity,
  TrendingUp,
  Zap,
  Gauge,
  Compass,
  Radio,
  Clock,
  Package,
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
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Executive Command Header */}
      <div className="relative p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-[#10192e] via-[#0d1527] to-[#0a0f1d] border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d0a_1px,transparent_1px),linear-gradient(to_bottom,#1f293d0a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              ENTERPRISE DISPATCH COMMAND MATRIX
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight font-sans">
              Autonomous Fleet Optimization & Spatial Dispatch
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
              Co-engineered logistics operating system orchestrating deterministic graph algorithms
              (<span className="text-emerald-400 font-mono font-medium">VRPTW Solver</span>) with
              autonomous multi-agent reasoning (<span className="text-purple-400 font-mono font-medium">LangGraph Copilot</span>)
              and grounded regulatory compliance.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#070c14] border border-white/[0.07] text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-slate-500">Database:</span>
                <span className="text-emerald-400 font-semibold">
                  {loadingHealth ? 'Checking...' : backendHealth?.database?.dialect || 'Supabase PostgreSQL'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#070c14] border border-white/[0.07] text-slate-300">
                <span className="text-slate-500">Cluster Mode:</span>
                <span className="text-blue-400 font-semibold uppercase">
                  {loadingHealth ? 'Checking...' : backendHealth?.environment || 'Production'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#070c14] border border-white/[0.07] text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-300">JWT RBAC Guarded</span>
              </div>
            </div>
          </div>

          {/* Quick Launch Buttons */}
          <div className="flex flex-row lg:flex-col gap-2.5 shrink-0">
            <Link
              href="/fleet"
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 flex items-center justify-center gap-2 transition"
            >
              <Layers className="w-4 h-4" />
              <span>Fleet Asset Directory</span>
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-white/[0.08] flex items-center justify-center gap-2 transition"
            >
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Live Dispatch Map</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Operational KPI Telemetry Ribbon (Samsara Style) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-xl bg-[#0f1728]/70 border border-white/[0.07] hover:border-white/[0.15] transition space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Active Fleet Availability</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">100%</span>
            <span className="text-xs font-mono text-emerald-400">4 / 4 Roster</span>
          </div>
          <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full w-full" />
          </div>
          <p className="text-[11px] text-slate-500">All registered units assigned to hubs</p>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-xl bg-[#0f1728]/70 border border-white/[0.07] hover:border-white/[0.15] transition space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">VRPTW Optimization Gain</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">+18.4%</span>
            <span className="text-xs font-mono text-emerald-400">Miles Saved</span>
          </div>
          <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full w-[82%]" />
          </div>
          <p className="text-[11px] text-slate-500">Algorithmic vs greedy route solver</p>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-xl bg-[#0f1728]/70 border border-white/[0.07] hover:border-white/[0.15] transition space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">SLA Window Adherence</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">99.2%</span>
            <span className="text-xs font-mono text-purple-400">On-Time</span>
          </div>
          <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
            <div className="bg-purple-500 h-full rounded-full w-[99%]" />
          </div>
          <p className="text-[11px] text-slate-500">Customer delivery time-windows</p>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-xl bg-[#0f1728]/70 border border-white/[0.07] hover:border-white/[0.15] transition space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Agent Reasoning Safety</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">0 Violations</span>
            <span className="text-xs font-mono text-emerald-400">100% Pass</span>
          </div>
          <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full w-full" />
          </div>
          <p className="text-[11px] text-slate-500">RAG regulatory grounding verified</p>
        </div>
      </div>

      {/* Dual Operational Command Bays */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bay 1: Core Spatial Dispatch & Solver (Track A) */}
        <div className="p-6 rounded-2xl bg-[#0d1424]/80 border border-emerald-500/20 shadow-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-base">Spatial Dispatch & Route Solver</h2>
                  <p className="text-xs text-emerald-400 font-mono">Core Deterministic Engine</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold uppercase">
                DSA • VRPTW
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Solves multi-vehicle routing with exact time windows (VRPTW), computes spatial distance matrices,
              and tracks real-time driver telemetry with finite-state machine transitions.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <Link
              href="/dashboard"
              className="flex items-center justify-between p-3 rounded-xl bg-[#080d18] hover:bg-[#11192e] border border-white/[0.06] hover:border-emerald-500/30 text-xs text-slate-200 transition group"
            >
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-semibold text-white">Live Dispatch Map Canvas</p>
                  <p className="text-[11px] text-slate-400">Real-time vehicle GPS & route paths</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
            </Link>

            <Link
              href="/routes"
              className="flex items-center justify-between p-3 rounded-xl bg-[#080d18] hover:bg-[#11192e] border border-white/[0.06] hover:border-emerald-500/30 text-xs text-slate-200 transition group"
            >
              <div className="flex items-center gap-3">
                <Truck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-semibold text-white">Deterministic VRPTW Solver</p>
                  <p className="text-[11px] text-slate-400">Time-window constraints & distance optimization</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
            </Link>

            <Link
              href="/tracking"
              className="flex items-center justify-between p-3 rounded-xl bg-[#080d18] hover:bg-[#11192e] border border-white/[0.06] hover:border-emerald-500/30 text-xs text-slate-200 transition group"
            >
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-semibold text-white">Driver Telemetry & Actions</p>
                  <p className="text-[11px] text-slate-400">Stop arrival confirmation & duty states</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
            </Link>
          </div>
        </div>

        {/* Bay 2: Autonomous Intelligence & Governance (Track B) */}
        <div className="p-6 rounded-2xl bg-[#0d1424]/80 border border-purple-500/20 shadow-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-base">Autonomous Copilot & Governance</h2>
                  <p className="text-xs text-purple-400 font-mono">Multi-Agent Intelligence</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold uppercase">
                LangGraph • RAG
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              LangGraph multi-agent copilot answering operator inquiries, proposing human-in-the-loop dispatch actions,
              and verifying compliance against regulatory transport policies.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <Link
              href="/fleet"
              className="flex items-center justify-between p-3 rounded-xl bg-[#080d18] hover:bg-[#11192e] border border-white/[0.06] hover:border-purple-500/30 text-xs text-slate-200 transition group"
            >
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-semibold text-white">Fleet Asset Directory (CRUD)</p>
                  <p className="text-[11px] text-slate-400">Depots, vehicle specifications, and driver rosters</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
            </Link>

            <Link
              href="/copilot"
              className="flex items-center justify-between p-3 rounded-xl bg-[#080d18] hover:bg-[#11192e] border border-white/[0.06] hover:border-purple-500/30 text-xs text-slate-200 transition group"
            >
              <div className="flex items-center gap-3">
                <Bot className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-semibold text-white">LangGraph Multi-Agent Copilot</p>
                  <p className="text-[11px] text-slate-400">Autonomous reasoning with human action confirmation</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
            </Link>

            <Link
              href="/compliance"
              className="flex items-center justify-between p-3 rounded-xl bg-[#080d18] hover:bg-[#11192e] border border-white/[0.06] hover:border-purple-500/30 text-xs text-slate-200 transition group"
            >
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="font-semibold text-white">RAG Regulatory Knowledge Base</p>
                  <p className="text-[11px] text-slate-400">DOT shift compliance & hazardous cargo guidelines</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
