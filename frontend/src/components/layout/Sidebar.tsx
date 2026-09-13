'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MapPin,
  Route as RouteIcon,
  Package,
  Radio,
  KeyRound,
  Layers,
  Bot,
  FileCheck2,
  BarChart3,
  Home,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  track: 'Track A' | 'Track B' | 'Shared';
  lead: string;
}

const navItems: NavItem[] = [
  { name: 'Command Center', href: '/', icon: Home, track: 'Shared', lead: 'Overview' },
  // Track A (Manthan)
  { name: 'Live Dispatch Map', href: '/dashboard', icon: MapPin, track: 'Track A', lead: 'Manthan' },
  { name: 'Routes & Solver', href: '/routes', icon: RouteIcon, track: 'Track A', lead: 'Manthan' },
  { name: 'Shipment Orders', href: '/shipments', icon: Package, track: 'Track A', lead: 'Manthan' },
  { name: 'Driver Telemetry', href: '/tracking', icon: Radio, track: 'Track A', lead: 'Manthan' },
  // Track B (Abhayraj)
  { name: 'Auth & Roles', href: '/login', icon: KeyRound, track: 'Track B', lead: 'Abhayraj' },
  { name: 'Fleet Assets (CRUD)', href: '/fleet', icon: Layers, track: 'Track B', lead: 'Abhayraj' },
  { name: 'AI Copilot (LangGraph)', href: '/copilot', icon: Bot, track: 'Track B', lead: 'Abhayraj' },
  { name: 'RAG Compliance', href: '/compliance', icon: FileCheck2, track: 'Track B', lead: 'Abhayraj' },
  { name: 'Operational KPIs', href: '/analytics', icon: BarChart3, track: 'Track B', lead: 'Abhayraj' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-command-surface border-r border-command-border flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16">
      <div className="p-4 space-y-6 overflow-y-auto">
        <div>
          <p className="px-3 text-[11px] font-semibold tracking-wider text-command-muted uppercase mb-2">
            Platform Navigation
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-medium'
                      : 'text-slate-300 hover:bg-command-card hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-command-muted'}`} />
                    <span>{item.name}</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      item.track === 'Track A'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : item.track === 'Track B'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.lead}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="p-4 border-t border-command-border bg-command-bg/40">
        <div className="text-xs space-y-1">
          <div className="flex items-center justify-between text-command-muted">
            <span>Track A (Core)</span>
            <span className="text-emerald-400 font-mono">Manthan</span>
          </div>
          <div className="flex items-center justify-between text-command-muted">
            <span>Track B (AI)</span>
            <span className="text-purple-400 font-mono">Abhayraj</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
