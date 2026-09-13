'use client';

import React from 'react';
import { useAuth } from '@/lib/authContext';
import { UserRole } from '@/lib/types';

export default function UserBadge() {
  const { user, switchRole, logout } = useAuth();

  if (!user) return null;

  const roleColors: Record<UserRole, string> = {
    ADMIN: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    FLEET_MANAGER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    DISPATCHER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    DRIVER: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
      <div className="flex flex-col text-right">
        <span className="text-xs font-semibold text-gray-200">{user.full_name}</span>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-mono ${roleColors[user.role]}`}>
          {user.role}
        </span>
      </div>
      
      {/* Quick Role Switcher for Viva Demo */}
      <select
        value={user.role}
        onChange={(e) => switchRole(e.target.value as UserRole)}
        className="bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
      >
        <option value="ADMIN">Admin</option>
        <option value="FLEET_MANAGER">Fleet Manager</option>
        <option value="DISPATCHER">Dispatcher</option>
        <option value="DRIVER">Driver</option>
      </select>

      <button
        onClick={logout}
        className="text-xs text-gray-400 hover:text-rose-400 transition ml-1"
        title="Logout"
      >
        Sign Out
      </button>
    </div>
  );
}
