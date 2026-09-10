'use client';

import React, { useState } from 'react';
import { LicenseType, DriverStatus, Hub } from '@/lib/types';

interface DriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  hubs: Hub[];
  onSubmit: (data: any) => Promise<void>;
}

export default function DriverModal({ isOpen, onClose, hubs, onSubmit }: DriverModalProps) {
  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseType, setLicenseType] = useState<LicenseType>('COMMERCIAL');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [maxHours, setMaxHours] = useState(8.0);
  const [assignedHubId, setAssignedHubId] = useState(hubs[0]?.id || 1);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      full_name: fullName,
      license_number: licenseNumber,
      license_type: licenseType,
      phone_number: phoneNumber,
      status: 'ON_DUTY',
      max_driving_hours_per_day: Number(maxHours),
      assigned_hub_id: Number(assignedHubId),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <h3 className="font-bold text-white text-base">Register Certified Driver</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-400 mb-1">Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Alex Henderson"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-gray-400 mb-1">License Number</label>
            <input
              type="text"
              required
              placeholder="e.g. DL-9988-2024"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white uppercase font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-gray-400 mb-1">License Category</label>
              <select
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value as LicenseType)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="COMMERCIAL">Commercial (CDL)</option>
                <option value="CLASS_A">Class A (Heavy / Semi)</option>
                <option value="CLASS_B">Class B (Medium / Box)</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Assigned Hub</label>
              <select
                value={assignedHubId}
                onChange={(e) => setAssignedHubId(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.code} - {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-gray-400 mb-1">Phone Number</label>
              <input
                type="text"
                required
                placeholder="+1-555-0192"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Max Hours / Day</label>
              <input
                type="number"
                step="0.5"
                required
                value={maxHours}
                onChange={(e) => setMaxHours(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition"
            >
              Register Driver
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
