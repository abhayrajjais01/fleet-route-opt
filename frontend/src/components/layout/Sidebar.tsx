'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MapPin,
  Route as RouteIcon,
  Package,
  Radio,
  KeyRound,
  Layers,
  Bot,
  FileCheck2,
  BarChart3,
  Database,
  Cpu,
  ChevronRight,
} from 'lucide-react';

interface NavSection {
  title: string;
  items: {
    name: string;
    href: string;
    icon: React.ElementType;
    badge?: string;
    badgeColor?: string;
  }[];
}

const navSections: NavSection[] = [
  {
    title: 'DISPATCH & REAL-TIME',
    items: [
      { name: 'Command Center', href: '/', icon: LayoutDashboard },
      { name: 'Live Dispatch Map', href: '/dashboard', icon: MapPin, badge: 'Live', badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
      { name: 'Routes & VRPTW Solver', href: '/routes', icon: RouteIcon },
      { name: 'Shipment Orders', href: '/shipments', icon: Package },
      { name: 'Driver Telemetry', href: '/tracking', icon: Radio },
    ],
  },
  {
    title: 'AI & INTELLIGENCE',
    items: [
      { name: 'AI Copilot (LangGraph)', href: '/copilot', icon: Bot, badge: 'GenAI', badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
      { name: 'RAG Compliance Base', href: '/compliance', icon: FileCheck2 },
      { name: 'Operational KPIs', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'FLEET & GOVERNANCE',
    items: [
      { name: 'Fleet Asset Directory', href: '/fleet', icon: Layers, badge: 'CRUD', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
      { name: 'Operator Access & RBAC', href: '/login', icon: KeyRound },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0a0f1a] border-r border-white/[0.07] flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 z-30 select-none">
      <div className="p-3.5 space-y-6 overflow-y-auto">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            <p className="px-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase font-mono">
              {section.title}
            </p>
            <nav className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 relative ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-300'
                        }`}
                      />
                      <span>{item.name}</span>
                    </div>

                    {item.badge ? (
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : (
                      <ChevronRight
                        className={`w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity ${
                          isActive ? 'opacity-100 text-blue-400' : ''
                        }`}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Engineering Architecture Status Card */}
      <div className="p-3 border-t border-white/[0.07] bg-[#070b13]/80 space-y-2">
        <div className="p-2.5 rounded-xl bg-[#0f1728]/80 border border-white/[0.05] space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Data Engine</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-semibold">PostgreSQL</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Cpu className="w-3 h-3 text-purple-400" />
              <span>Copilot Engine</span>
            </span>
            <span className="text-[10px] font-mono text-purple-400 font-semibold">LangGraph 0.2</span>
          </div>
        </div>

        <div className="px-2 pt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>CO-ENGINEERED</span>
          <span className="text-slate-400">Track A & Track B</span>
        </div>
      </div>
    </aside>
  );
}
