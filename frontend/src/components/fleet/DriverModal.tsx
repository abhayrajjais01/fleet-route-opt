'use client';

import React, { useState } from 'react';
import { Driver, DriverStatus, LicenseType, Hub } from '@/lib/types';
import { X, UserCheck, ShieldCheck, Phone, Clock, AlertCircle } from 'lucide-react';

interface DriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (driverData: Omit<Driver, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  hubs: Hub[];
  initialData?: Driver | null;
}

export default function DriverModal({
  isOpen,
  onClose,
  onSubmit,
  hubs,
  initialData,
}: DriverModalProps) {
  const [fullName, setFullName] = useState(initialData?.full_name || '');
  const [licenseNumber, setLicenseNumber] = useState(initialData?.license_number || '');
  const [licenseType, setLicenseType] = useState<LicenseType>(initialData?.license_type || 'COMMERCIAL');
  const [phoneNumber, setPhoneNumber] = useState(initialData?.phone_number || '+91-98200-11223');
  const [status, setStatus] = useState<DriverStatus>(initialData?.status || 'ON_DUTY');
  const [maxHours, setMaxHours] = useState(initialData?.max_driving_hours_per_day?.toString() || '8.0');
  const [assignedHubId, setAssignedHubId] = useState<string>(
    initialData?.assigned_hub_id?.toString() || (hubs[0]?.id?.toString() ?? '1')
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hours = parseFloat(maxHours);
    const hubId = parseInt(assignedHubId, 10);

    if (isNaN(hours) || hours <= 0 || hours > 14) {
      setError('Max driving hours must be between 1 and 14 hours per SOP regulations');
      return;
    }
    if (isNaN(hubId)) {
      setError('Please select an assigned distribution hub');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        full_name: fullName,
        license_number: licenseNumber.toUpperCase(),
        license_type: licenseType,
        phone_number: phoneNumber,
        status,
        max_driving_hours_per_day: hours,
        assigned_hub_id: hubId,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save driver');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111827] border border-slate-700/60 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0f172a]/60">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialData ? 'Edit Driver Profile' : 'Register Certified Driver'}
              </h2>
              <p className="text-xs text-slate-400">Manage DOT hours, commercial licenses, and hub allocation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">License Number</label>
              <input
                type="text"
                required
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. DL-14-2021-9988"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> License Class
              </label>
              <select
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value as LicenseType)}
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="COMMERCIAL">Commercial Heavy Vehicle</option>
                <option value="CLASS_A">Class A Commercial</option>
                <option value="CLASS_B">Class B Medium Vehicle</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Hub</label>
              <select
                value={assignedHubId}
                onChange={(e) => setAssignedHubId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
              >
                {hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name} ({hub.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-emerald-400" /> Direct Phone Number
              </label>
              <input
                type="text"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91-98200-11223"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Max Duty Hours / Day
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="14"
                required
                value={maxHours}
                onChange={(e) => setMaxHours(e.target.value)}
                placeholder="8.0"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Current Duty Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DriverStatus)}
              className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="ON_DUTY">ON_DUTY (Available for Route Assignment)</option>
              <option value="ON_TRIP">ON_TRIP (Currently Navigating Stops)</option>
              <option value="RESTING">RESTING (Mandatory DOT Rest Break)</option>
              <option value="OFF_DUTY">OFF_DUTY (Shift Completed)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition"
            >
              {isSubmitting ? 'Saving Driver...' : initialData ? 'Update Driver' : 'Register Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
