'use client';

/**
 * VehicleModal.tsx - Interactive Modal Form for Fleet Vehicle Enrolment & Editing
 * 
 * Features:
 * 1. Dual mode: Enrolling new fleet vehicles or editing existing vehicle specifications.
 * 2. Grouped fieldsets: Asset Identification, Capacities & Telemetrics (with unit addons kg, m³, km/L), and Depot Assignment.
 * 3. Client-side input validation and error feedback before submitting payload to FastAPI backend.
 */

import React, { useState, useEffect } from 'react';
import { Vehicle, VehicleType, VehicleStatus, Hub } from '@/lib/types';
import { X, Truck, AlertCircle } from 'lucide-react';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (vehicleData: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  hubs: Hub[];
  initialData?: Vehicle | null;
}

export default function VehicleModal({
  isOpen,
  onClose,
  onSubmit,
  hubs,
  initialData,
}: VehicleModalProps) {
  // Form State
  const [name, setName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('VAN');
  const [maxPayloadKg, setMaxPayloadKg] = useState('1500');
  const [maxVolumeM3, setMaxVolumeM3] = useState('12.0');
  const [fuelEfficiencyKpl, setFuelEfficiencyKpl] = useState('13.5');
  const [status, setStatus] = useState<VehicleStatus>('AVAILABLE');
  const [assignedHubId, setAssignedHubId] = useState<string>('1');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form state when modal opens or initialData prop changes
  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setPlateNumber(initialData.plate_number);
      setVehicleType(initialData.vehicle_type);
      setMaxPayloadKg(initialData.max_payload_kg.toString());
      setMaxVolumeM3(initialData.max_volume_m3.toString());
      setFuelEfficiencyKpl(initialData.fuel_efficiency_kpl.toString());
      setStatus(initialData.current_status);
      setAssignedHubId(initialData.assigned_hub_id.toString());
    } else {
      setName('');
      setPlateNumber('');
      setVehicleType('VAN');
      setMaxPayloadKg('1500');
      setMaxVolumeM3('12.0');
      setFuelEfficiencyKpl('13.5');
      setStatus('AVAILABLE');
      setAssignedHubId(hubs[0]?.id?.toString() || '1');
    }
    setError(null);
  }, [initialData, hubs, isOpen]);

  if (!isOpen) return null;

  // Form Submission & Validation Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = parseFloat(maxPayloadKg);
    const volume = parseFloat(maxVolumeM3);
    const fuel = parseFloat(fuelEfficiencyKpl);
    const hubId = parseInt(assignedHubId, 10);

    // Validate metrics before sending request
    if (isNaN(payload) || payload <= 0) {
      setError('Payload capacity must be a positive number');
      return;
    }
    if (isNaN(volume) || volume <= 0) {
      setError('Volume capacity must be a positive number');
      return;
    }
    if (isNaN(fuel) || fuel <= 0) {
      setError('Fuel efficiency must be a positive number');
      return;
    }
    if (isNaN(hubId)) {
      setError('Please select a valid distribution hub');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name,
        plate_number: plateNumber.toUpperCase().trim(),
        vehicle_type: vehicleType,
        max_payload_kg: payload,
        max_volume_m3: volume,
        fuel_efficiency_kpl: fuel,
        current_status: status,
        assigned_hub_id: hubId,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save vehicle');
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
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                {initialData ? 'Edit Fleet Vehicle' : 'Register New Fleet Asset'}
              </h2>
              <p className="text-xs text-slate-400">Manage payload ratings, spatial volume, and hub assignment</p>
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Group 1: Asset Identification */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Asset Identification
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Vehicle Label / Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alpha Prime Van"
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">License Plate Number</label>
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder="MH-02-EE-1001"
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-blue-400 font-mono font-bold uppercase placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Classification Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="VAN">Light Cargo Van (Urban Express)</option>
                <option value="BOX_TRUCK">Medium Box Truck (Commercial Courier)</option>
                <option value="EV">Electric Cargo EV (Zero Emission)</option>
                <option value="SEMI_TRUCK">Heavy Semi-Trailer (Interstate Linehaul)</option>
              </select>
            </div>
          </div>

          {/* Group 2: Capacities & Metrics */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Capacities & Telemetrics
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Max Payload</label>
                <div className="relative">
                  <input
                    type="number"
                    step="50"
                    required
                    value={maxPayloadKg}
                    onChange={(e) => setMaxPayloadKg(e.target.value)}
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-3 pr-8 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                  <span className="absolute right-2.5 top-2 text-[11px] text-slate-500 font-mono">kg</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Vol. Capacity</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={maxVolumeM3}
                    onChange={(e) => setMaxVolumeM3(e.target.value)}
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-3 pr-8 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                  <span className="absolute right-2.5 top-2 text-[11px] text-slate-500 font-mono">m³</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Fuel Economy</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={fuelEfficiencyKpl}
                    onChange={(e) => setFuelEfficiencyKpl(e.target.value)}
                    className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl pl-3 pr-11 py-2 text-xs text-emerald-400 font-mono font-semibold focus:outline-none focus:border-blue-500 transition"
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-slate-500 font-mono">km/L</span>
                </div>
              </div>
            </div>
          </div>

          {/* Group 3: Allocation & Status */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Operational Assignment
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Distribution Hub</label>
                <select
                  value={assignedHubId}
                  onChange={(e) => setAssignedHubId(e.target.value)}
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id.toString()}>
                      {hub.name} ({hub.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Initial Duty Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                  className="w-full bg-[#080d18] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="AVAILABLE">AVAILABLE (Ready for Dispatch)</option>
                  <option value="IN_TRANSIT">IN_TRANSIT (On Active Route)</option>
                  <option value="MAINTENANCE">MAINTENANCE (Shop Inspection)</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED (Out of Service)</option>
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
                  <span>Saving Unit...</span>
                </>
              ) : initialData ? (
                'Update Vehicle'
              ) : (
                'Enlist Vehicle'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
