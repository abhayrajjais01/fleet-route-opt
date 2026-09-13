'use client';

import React, { useState } from 'react';
import { Vehicle, VehicleType, VehicleStatus, Hub } from '@/lib/types';
import { X, Truck, Gauge, Fuel, PackageCheck, AlertCircle } from 'lucide-react';

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
  const [name, setName] = useState(initialData?.name || '');
  const [plateNumber, setPlateNumber] = useState(initialData?.plate_number || '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(initialData?.vehicle_type || 'VAN');
  const [maxPayloadKg, setMaxPayloadKg] = useState(initialData?.max_payload_kg?.toString() || '1500');
  const [maxVolumeM3, setMaxVolumeM3] = useState(initialData?.max_volume_m3?.toString() || '12.0');
  const [fuelEfficiencyKpl, setFuelEfficiencyKpl] = useState(
    initialData?.fuel_efficiency_kpl?.toString() || '13.5'
  );
  const [status, setStatus] = useState<VehicleStatus>(initialData?.current_status || 'AVAILABLE');
  const [assignedHubId, setAssignedHubId] = useState<string>(
    initialData?.assigned_hub_id?.toString() || (hubs[0]?.id?.toString() ?? '1')
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = parseFloat(maxPayloadKg);
    const volume = parseFloat(maxVolumeM3);
    const fuel = parseFloat(fuelEfficiencyKpl);
    const hubId = parseInt(assignedHubId, 10);

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
      setError('Please select a valid assigned distribution hub');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name,
        plate_number: plateNumber.toUpperCase(),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111827] border border-slate-700/60 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0f172a]/60">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialData ? 'Edit Fleet Vehicle' : 'Register New Fleet Vehicle'}
              </h2>
              <p className="text-xs text-slate-400">Manage payload limits, volume, and depot allocation</p>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">Vehicle Nickname / Unit</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Delivery Van Alpha 1"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">License Plate Number</label>
              <input
                type="text"
                required
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="e.g. MH-12-QQ-4001"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Vehicle Classification</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="VAN">Light Delivery Van</option>
                <option value="BOX_TRUCK">Medium Box Truck</option>
                <option value="SEMI_TRUCK">Heavy Semi-Truck</option>
                <option value="EV">Electric Cargo Vehicle (EV)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Hub / Depot</label>
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <PackageCheck className="w-3.5 h-3.5 text-blue-400" /> Max Payload (kg)
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={maxPayloadKg}
                onChange={(e) => setMaxPayloadKg(e.target.value)}
                placeholder="1500"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-purple-400" /> Max Volume (m³)
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={maxVolumeM3}
                onChange={(e) => setMaxVolumeM3(e.target.value)}
                placeholder="12.0"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Fuel className="w-3.5 h-3.5 text-emerald-400" /> Efficiency (km/L)
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={fuelEfficiencyKpl}
                onChange={(e) => setFuelEfficiencyKpl(e.target.value)}
                placeholder="13.5"
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Operational Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VehicleStatus)}
              className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="AVAILABLE">AVAILABLE (Ready for Dispatch)</option>
              <option value="IN_TRANSIT">IN_TRANSIT (Currently on Route)</option>
              <option value="MAINTENANCE">MAINTENANCE (Under Inspection)</option>
              <option value="DECOMMISSIONED">DECOMMISSIONED (Out of Service)</option>
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
              {isSubmitting ? 'Saving Vehicle...' : initialData ? 'Update Vehicle' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
