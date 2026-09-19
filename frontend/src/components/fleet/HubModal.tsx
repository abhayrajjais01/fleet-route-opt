'use client';

import React, { useState, useEffect } from 'react';
import { Hub } from '@/lib/types';
import { X, Building2, MapPin, Phone, Clock, AlertCircle } from 'lucide-react';

interface HubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (hubData: Omit<Hub, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  initialData?: Hub | null;
}

export default function HubModal({ isOpen, onClose, onSubmit, initialData }: HubModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('19.1136');
  const [longitude, setLongitude] = useState('72.8697');
  const [contactPhone, setContactPhone] = useState('+91-22-2820-1100');
  const [operatingHours, setOperatingHours] = useState('06:00 - 22:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setCode(initialData.code);
      setAddress(initialData.address);
      setLatitude(initialData.latitude.toString());
      setLongitude(initialData.longitude.toString());
      setContactPhone(initialData.contact_phone);
      setOperatingHours(initialData.operating_hours);
    } else {
      setName('');
      setCode('');
      setAddress('');
      setLatitude('19.1136');
      setLongitude('72.8697');
      setContactPhone('+91-22-2820-1100');
      setOperatingHours('06:00 - 22:00');
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be a valid coordinate between -90 and 90');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError('Longitude must be a valid coordinate between -180 and 180');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name,
        code: code.toUpperCase().trim(),
        address: address.trim(),
        latitude: lat,
        longitude: lng,
        contact_phone: contactPhone.trim(),
        operating_hours: operatingHours.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save distribution hub');
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
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                {initialData ? 'Edit Distribution Facility' : 'Register New Logistics Hub'}
              </h2>
              <p className="text-xs text-slate-400">Dispatch origin, cross-docking waypoint, and return depot</p>
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
          {/* Group 1: Identification */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Depot Identification
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Hub Facility Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mumbai Central Logistics Depot"
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Facility Code</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="HUB-MUM-01"
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-blue-400 font-mono font-bold uppercase placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Physical Street Address</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Plot 45, MIDC Industrial Area, Andheri East, Mumbai, MH"
                className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Group 2: Geocoordinates */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Spatial Geocoordinates
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Latitude</label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 absolute left-3 top-2.5 text-blue-400" />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Longitude</label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 absolute left-3 top-2.5 text-blue-400" />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Group 3: Operations & Dispatch Contact */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Operations & Schedule
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Operating Window</label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 absolute left-3 top-2.5 text-amber-400" />
                  <input
                    type="text"
                    required
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    placeholder="06:00 - 22:00"
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Dispatch Phone</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-2.5 text-emerald-400" />
                  <input
                    type="text"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91-22-2820-1100"
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
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
                  <span>Saving Facility...</span>
                </>
              ) : initialData ? (
                'Update Facility'
              ) : (
                'Enlist Facility'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
