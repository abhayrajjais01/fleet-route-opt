'use client';

import React, { useState } from 'react';
import { Vehicle, Driver, Hub, FleetOverview } from '@/lib/types';
import AssetTable from '@/components/fleet/AssetTable';
import VehicleModal from '@/components/fleet/VehicleModal';
import DriverModal from '@/components/fleet/DriverModal';
import HubModal from '@/components/fleet/HubModal';
import { useAuth } from '@/lib/authContext';

export default function FleetPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'vehicles' | 'drivers' | 'hubs'>('vehicles');
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isHubModalOpen, setIsHubModalOpen] = useState(false);

  // Initial Sample Fleet Data for Interactive UI
  const [hubs, setHubs] = useState<Hub[]>([
    {
      id: 1,
      name: 'Central Logistics Hub A',
      code: 'HUB-MUM-01',
      address: 'Plot 45, MIDC Industrial Area, Andheri East, Mumbai',
      latitude: 19.1136,
      longitude: 72.8697,
      contact_phone: '+91-22-2820-1100',
      operating_hours: '06:00 - 22:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Navi Mumbai Distribution Center',
      code: 'HUB-NV-02',
      address: 'Sector 19, Vashi, Navi Mumbai',
      latitude: 19.0760,
      longitude: 72.9986,
      contact_phone: '+91-22-2780-4400',
      operating_hours: '05:00 - 23:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    {
      id: 1,
      name: 'Delivery Van Alpha',
      plate_number: 'MH-02-EE-1001',
      vehicle_type: 'VAN',
      max_payload_kg: 1200,
      max_volume_m3: 10.5,
      fuel_efficiency_kpl: 14.0,
      current_status: 'AVAILABLE',
      assigned_hub_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Heavy Box Truck Beta',
      plate_number: 'MH-04-AB-2045',
      vehicle_type: 'BOX_TRUCK',
      max_payload_kg: 3500,
      max_volume_m3: 24.0,
      fuel_efficiency_kpl: 8.5,
      current_status: 'IN_TRANSIT',
      assigned_hub_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      name: 'Eco Electric Carrier 1',
      plate_number: 'MH-01-EV-8822',
      vehicle_type: 'EV',
      max_payload_kg: 900,
      max_volume_m3: 8.0,
      fuel_efficiency_kpl: 18.0,
      current_status: 'AVAILABLE',
      assigned_hub_id: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const [drivers, setDrivers] = useState<Driver[]>([
    {
      id: 1,
      full_name: 'Rajesh Kumar',
      license_number: 'MH02-2018-00918',
      license_type: 'COMMERCIAL',
      phone_number: '+91-98200-11223',
      status: 'ON_DUTY',
      max_driving_hours_per_day: 8.0,
      assigned_hub_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      full_name: 'Vikram Singh',
      license_number: 'MH04-2015-88319',
      license_type: 'CLASS_A',
      phone_number: '+91-98700-44556',
      status: 'ON_TRIP',
      max_driving_hours_per_day: 10.0,
      assigned_hub_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      full_name: 'Amit Patil',
      license_number: 'MH01-2020-55441',
      license_type: 'CLASS_B',
      phone_number: '+91-99600-77889',
      status: 'OFF_DUTY',
      max_driving_hours_per_day: 8.0,
      assigned_hub_id: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // Handlers
  const handleAddVehicle = async (data: any) => {
    const newVehicle: Vehicle = {
      ...data,
      id: vehicles.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setVehicles([newVehicle, ...vehicles]);
  };

  const handleAddDriver = async (data: any) => {
    const newDriver: Driver = {
      ...data,
      id: drivers.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setDrivers([newDriver, ...drivers]);
  };

  const handleAddHub = async (data: any) => {
    const newHub: Hub = {
      ...data,
      id: hubs.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setHubs([newHub, ...hubs]);
  };

  const handleDelete = (id: number, type: 'vehicles' | 'drivers' | 'hubs') => {
    if (type === 'vehicles') setVehicles(vehicles.filter((v) => v.id !== id));
    if (type === 'drivers') setDrivers(drivers.filter((d) => d.id !== id));
    if (type === 'hubs') setHubs(hubs.filter((h) => h.id !== id));
  };

  const totalPayload = vehicles.reduce((acc, v) => acc + v.max_payload_kg, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Fleet Asset Directory (US-002)
          </h1>
          <p className="text-xs text-gray-400">
            Manage distribution depots, delivery vehicles, and driver rosters with operational constraints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'vehicles' && (
            <button
              onClick={() => setIsVehicleModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition"
            >
              + Add Vehicle
            </button>
          )}
          {activeTab === 'drivers' && (
            <button
              onClick={() => setIsDriverModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition"
            >
              + Register Driver
            </button>
          )}
          {activeTab === 'hubs' && (
            <button
              onClick={() => setIsHubModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition"
            >
              + Create Hub
            </button>
          )}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-1">
          <span className="text-xs text-gray-400">Total Fleet Vehicles</span>
          <div className="text-2xl font-bold text-white">{vehicles.length}</div>
          <span className="text-[10px] text-emerald-400 font-mono">
            {vehicles.filter((v) => v.current_status === 'AVAILABLE').length} Available
          </span>
        </div>

        <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-1">
          <span className="text-xs text-gray-400">Active Drivers</span>
          <div className="text-2xl font-bold text-white">{drivers.length}</div>
          <span className="text-[10px] text-blue-400 font-mono">
            {drivers.filter((d) => d.status === 'ON_DUTY').length} On Duty
          </span>
        </div>

        <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-1">
          <span className="text-xs text-gray-400">Distribution Hubs</span>
          <div className="text-2xl font-bold text-white">{hubs.length}</div>
          <span className="text-[10px] text-purple-400 font-mono">2 Operational Regions</span>
        </div>

        <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-1">
          <span className="text-xs text-gray-400">Total Payload Capacity</span>
          <div className="text-2xl font-bold text-white">{totalPayload.toLocaleString()} kg</div>
          <span className="text-[10px] text-amber-400 font-mono">Max Load Threshold</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 gap-6 text-sm">
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`pb-3 font-semibold transition border-b-2 ${
            activeTab === 'vehicles'
              ? 'text-blue-400 border-blue-500'
              : 'text-gray-400 border-transparent hover:text-gray-200'
          }`}
        >
          Vehicles ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('drivers')}
          className={`pb-3 font-semibold transition border-b-2 ${
            activeTab === 'drivers'
              ? 'text-blue-400 border-blue-500'
              : 'text-gray-400 border-transparent hover:text-gray-200'
          }`}
        >
          Drivers ({drivers.length})
        </button>
        <button
          onClick={() => setActiveTab('hubs')}
          className={`pb-3 font-semibold transition border-b-2 ${
            activeTab === 'hubs'
              ? 'text-blue-400 border-blue-500'
              : 'text-gray-400 border-transparent hover:text-gray-200'
          }`}
        >
          Hubs & Depots ({hubs.length})
        </button>
      </div>

      {/* Asset Table */}
      <AssetTable
        activeTab={activeTab}
        vehicles={vehicles}
        drivers={drivers}
        hubs={hubs}
        onDelete={handleDelete}
      />

      {/* Modals */}
      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        hubs={hubs}
        onSubmit={handleAddVehicle}
      />
      <DriverModal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
        hubs={hubs}
        onSubmit={handleAddDriver}
      />
      <HubModal
        isOpen={isHubModalOpen}
        onClose={() => setIsHubModalOpen(false)}
        onSubmit={handleAddHub}
      />
    </div>
  );
}
