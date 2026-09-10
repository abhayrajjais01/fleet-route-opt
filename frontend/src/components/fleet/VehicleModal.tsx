'use client';

import React, { useState } from 'react';
import { VehicleType, VehicleStatus, Hub } from '@/lib/types';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  hubs: Hub[];
  onSubmit: (data: any) => Promise<void>;
}

export default function VehicleModal({ isOpen, onClose, hubs, onSubmit }: VehicleModalProps) {
  const [name, setName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('VAN');
  const [maxPayload, setMaxPayload] = useState(1500);
  const [maxVolume, setMaxVolume] = useState(12.0);
  const [fuelEfficiency, setFuelEfficiency] = useState(12.5);
  const [assignedHubId, setAssignedHubId] = useState(hubs[0]?.id || 1);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name,
      plate_number: plateNumber,
      vehicle_type: vehicleType,
      max_payload_kg: Number(maxPayload),
      max_volume_m3: Number(maxVolume),
      fuel_efficiency_kpl: Number(fuelEfficiency),
      current_status: 'AVAILABLE',
      assigned_hub_id: Number(assignedHubId),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <h3 className="font-bold text-white text-base">Add New Delivery Vehicle</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-400 mb-1">Vehicle Name / Label</label>
            <input
              type="text"
              required
              placeholder="e.g. Ford Transit #104"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-gray-400 mb-1">License Plate Number</label>
            <input
              type="text"
              required
              placeholder="e.g. MH-12-AB-9876"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white uppercase font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-gray-400 mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="VAN">Van</option>
                <option value="BOX_TRUCK">Box Truck</option>
                <option value="SEMI_TRUCK">Semi Truck</option>
                <option value="EV">Electric Van (EV)</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Assigned Depot Hub</label>
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

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-gray-400 mb-1">Payload (kg)</label>
              <input
                type="number"
                required
                value={maxPayload}
                onChange={(e) => setMaxPayload(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Volume (m³)</label>
              <input
                type="number"
                step="0.1"
                required
                value={maxVolume}
                onChange={(e) => setMaxVolume(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Fuel (km/l)</label>
              <input
                type="number"
                step="0.1"
                required
                value={fuelEfficiency}
                onChange={(e) => setFuelEfficiency(Number(e.target.value))}
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
              Save Vehicle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
