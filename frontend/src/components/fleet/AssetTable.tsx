'use client';

import React from 'react';
import { Vehicle, Driver, Hub } from '@/lib/types';

interface AssetTableProps {
  activeTab: 'vehicles' | 'drivers' | 'hubs';
  vehicles: Vehicle[];
  drivers: Driver[];
  hubs: Hub[];
  onDelete: (id: number, type: 'vehicles' | 'drivers' | 'hubs') => void;
}

export default function AssetTable({
  activeTab,
  vehicles,
  drivers,
  hubs,
  onDelete,
}: AssetTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
      case 'ON_DUTY':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'IN_TRANSIT':
      case 'ON_TRIP':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'MAINTENANCE':
      case 'RESTING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'DECOMMISSIONED':
      case 'OFF_DUTY':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/60">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-950/80 text-gray-400 uppercase tracking-wider text-[11px] border-b border-gray-800">
          {activeTab === 'vehicles' && (
            <tr>
              <th className="px-4 py-3">Vehicle Name</th>
              <th className="px-4 py-3">Plate Number</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Payload (kg)</th>
              <th className="px-4 py-3">Volume (m³)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          )}
          {activeTab === 'drivers' && (
            <tr>
              <th className="px-4 py-3">Driver Name</th>
              <th className="px-4 py-3">License Number</th>
              <th className="px-4 py-3">License Type</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Max Hours</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          )}
          {activeTab === 'hubs' && (
            <tr>
              <th className="px-4 py-3">Hub Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Coordinates</th>
              <th className="px-4 py-3">Operating Hours</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-gray-800 text-gray-300">
          {activeTab === 'vehicles' &&
            vehicles.map((v) => (
              <tr key={v.id} className="hover:bg-gray-800/40 transition">
                <td className="px-4 py-3 font-medium text-white">{v.name}</td>
                <td className="px-4 py-3 font-mono text-gray-400">{v.plate_number}</td>
                <td className="px-4 py-3">{v.vehicle_type}</td>
                <td className="px-4 py-3">{v.max_payload_kg} kg</td>
                <td className="px-4 py-3">{v.max_volume_m3} m³</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-mono ${getStatusBadge(v.current_status)}`}>
                    {v.current_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(v.id, 'vehicles')}
                    className="text-gray-500 hover:text-rose-400 transition"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

          {activeTab === 'drivers' &&
            drivers.map((d) => (
              <tr key={d.id} className="hover:bg-gray-800/40 transition">
                <td className="px-4 py-3 font-medium text-white">{d.full_name}</td>
                <td className="px-4 py-3 font-mono text-gray-400">{d.license_number}</td>
                <td className="px-4 py-3">{d.license_type}</td>
                <td className="px-4 py-3">{d.phone_number}</td>
                <td className="px-4 py-3">{d.max_driving_hours_per_day} hrs/day</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-mono ${getStatusBadge(d.status)}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(d.id, 'drivers')}
                    className="text-gray-500 hover:text-rose-400 transition"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

          {activeTab === 'hubs' &&
            hubs.map((h) => (
              <tr key={h.id} className="hover:bg-gray-800/40 transition">
                <td className="px-4 py-3 font-mono font-semibold text-blue-400">{h.code}</td>
                <td className="px-4 py-3 font-medium text-white">{h.name}</td>
                <td className="px-4 py-3 text-gray-400">{h.address}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-gray-400">
                  {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-gray-400">{h.operating_hours}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(h.id, 'hubs')}
                    className="text-gray-500 hover:text-rose-400 transition"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
