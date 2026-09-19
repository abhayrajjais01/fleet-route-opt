'use client';

import React, { useState, useEffect } from 'react';
import { Driver, DriverStatus, LicenseType, Hub } from '@/lib/types';
import { X, UserCheck, ShieldCheck, Phone, Clock, AlertCircle, Building2 } from 'lucide-react';

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
  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseType, setLicenseType] = useState<LicenseType>('COMMERCIAL');
  const [phoneNumber, setPhoneNumber] = useState('+91-98200-11223');
  const [status, setStatus] = useState<DriverStatus>('ON_DUTY');
  const [maxHours, setMaxHours] = useState('8.0');
  const [assignedHubId, setAssignedHubId] = useState<string>('1');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFullName(initialData.full_name);
      setLicenseNumber(initialData.license_number);
      setLicenseType(initialData.license_type);
      setPhoneNumber(initialData.phone_number);
      setStatus(initialData.status);
      setMaxHours(initialData.max_driving_hours_per_day.toString());
      setAssignedHubId(initialData.assigned_hub_id.toString());
    } else {
      setFullName('');
      setLicenseNumber('');
      setLicenseType('COMMERCIAL');
      setPhoneNumber('+91-98200-11223');
      setStatus('ON_DUTY');
      setMaxHours('8.0');
      setAssignedHubId(hubs[0]?.id?.toString() || '1');
    }
    setError(null);
  }, [initialData, hubs, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hours = parseFloat(maxHours);
    const hubId = parseInt(assignedHubId, 10);

    if (isNaN(hours) || hours <= 0 || hours > 14) {
      setError('Max driving hours must be between 1 and 14 hours per DOT regulations');
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
        license_number: licenseNumber.toUpperCase().trim(),
        license_type: licenseType,
        phone_number: phoneNumber.trim(),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0f1728] border border-white/[0.1] rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#0a0f1d]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                {initialData ? 'Edit Driver Record' : 'Register Certified Driver'}
              </h2>
              <p className="text-xs text-slate-400">Manage DOT hours, commercial licenses, and hub allocation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Group 1: Profile & Contact */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Profile & Contact
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Rajesh Kumar"
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Phone</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91-98200-11223"
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Group 2: Commercial Licensing */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Commercial Licensing
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">License Number</label>
                <input
                  type="text"
                  required
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="DL-14-2021-9988"
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-blue-400 font-mono font-bold uppercase placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">License Class</label>
                <select
                  value={licenseType}
                  onChange={(e) => setLicenseType(e.target.value as LicenseType)}
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="COMMERCIAL">COMMERCIAL (Standard Transport)</option>
                  <option value="CLASS_A">CLASS_A (Heavy Combination / Articulated)</option>
                  <option value="CLASS_B">CLASS_B (Heavy Straight / Box Trucks)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Group 3: Shift Limit & Allocation */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Shift Regulations & Depot Assignment
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Max Daily Hours</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="14"
                    required
                    value={maxHours}
                    onChange={(e) => setMaxHours(e.target.value)}
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-3 pr-14 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-slate-500 font-mono">hrs/day</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Hub</label>
                <select
                  value={assignedHubId}
                  onChange={(e) => setAssignedHubId(e.target.value)}
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id.toString()}>
                      {hub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Duty Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DriverStatus)}
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="ON_DUTY">ON_DUTY</option>
                  <option value="ON_TRIP">ON_TRIP</option>
                  <option value="RESTING">RESTING</option>
                  <option value="OFF_DUTY">OFF_DUTY</option>
                </select>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/25 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Driver...</span>
                </>
              ) : initialData ? (
                'Update Driver'
              ) : (
                'Enlist Driver'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
