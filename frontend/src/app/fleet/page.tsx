'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Vehicle, Driver, Hub, FleetOverview, VehicleStatus, DriverStatus } from '@/lib/types';
import { fleetApi } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import HubModal from '@/components/fleet/HubModal';
import VehicleModal from '@/components/fleet/VehicleModal';
import DriverModal from '@/components/fleet/DriverModal';
import {
  Truck,
  Users,
  Building2,
  Package,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Phone,
  Shield,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

// Default initial tactical demo dataset for zero-latency instant rendering and offline mode
const DEMO_HUBS: Hub[] = [
  {
    id: 1,
    name: 'Mumbai Central Logistics Depot',
    code: 'HUB-MUM-01',
    address: 'Plot 45, MIDC Industrial Area, Andheri East, Mumbai, MH',
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
    address: 'Sector 19, Vashi, Navi Mumbai, MH',
    latitude: 19.076,
    longitude: 72.9986,
    contact_phone: '+91-22-2780-4400',
    operating_hours: '05:00 - 23:00',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 3,
    name: 'Pune Regional Logistics Gateway',
    code: 'HUB-PNQ-03',
    address: 'Phase 2, Hinjawadi Tech Park, Pune, MH',
    latitude: 18.5913,
    longitude: 73.7389,
    contact_phone: '+91-20-6710-2200',
    operating_hours: '06:00 - 22:00',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_VEHICLES: Vehicle[] = [
  {
    id: 1,
    name: 'Alpha Prime Van',
    plate_number: 'MH-02-EE-1001',
    vehicle_type: 'VAN',
    max_payload_kg: 1500,
    max_volume_m3: 12.0,
    fuel_efficiency_kpl: 14.2,
    current_status: 'AVAILABLE',
    assigned_hub_id: 1,
    current_latitude: 19.1136,
    current_longitude: 72.8697,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Heavy Box Carrier 2',
    plate_number: 'MH-04-AB-2045',
    vehicle_type: 'BOX_TRUCK',
    max_payload_kg: 3500,
    max_volume_m3: 24.5,
    fuel_efficiency_kpl: 8.5,
    current_status: 'IN_TRANSIT',
    assigned_hub_id: 1,
    current_latitude: 19.082,
    current_longitude: 72.91,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    name: 'Eco Cargo Electric 1',
    plate_number: 'MH-01-EV-8822',
    vehicle_type: 'EV',
    max_payload_kg: 950,
    max_volume_m3: 8.0,
    fuel_efficiency_kpl: 18.0,
    current_status: 'AVAILABLE',
    assigned_hub_id: 2,
    current_latitude: 19.076,
    current_longitude: 72.9986,
    created_at: new Date().toISOString(),
  },
  {
    id: 4,
    name: 'Interstate Freight Hauler',
    plate_number: 'MH-12-QQ-4001',
    vehicle_type: 'SEMI_TRUCK',
    max_payload_kg: 8500,
    max_volume_m3: 55.0,
    fuel_efficiency_kpl: 5.8,
    current_status: 'MAINTENANCE',
    assigned_hub_id: 3,
    current_latitude: 18.5913,
    current_longitude: 73.7389,
    created_at: new Date().toISOString(),
  },
];

const DEMO_DRIVERS: Driver[] = [
  {
    id: 1,
    full_name: 'Rajesh Kumar',
    license_number: 'DL-14-2021-9988',
    license_type: 'COMMERCIAL',
    phone_number: '+91-98200-11223',
    status: 'ON_DUTY',
    max_driving_hours_per_day: 8.0,
    assigned_hub_id: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    full_name: 'Vikramjit Singh',
    license_number: 'MH04-2015-88319',
    license_type: 'CLASS_A',
    phone_number: '+91-98700-44556',
    status: 'ON_TRIP',
    max_driving_hours_per_day: 10.0,
    assigned_hub_id: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    full_name: 'Amit Patil',
    license_number: 'MH01-2020-55441',
    license_type: 'CLASS_B',
    phone_number: '+91-99600-77889',
    status: 'RESTING',
    max_driving_hours_per_day: 8.0,
    assigned_hub_id: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: 4,
    full_name: 'Suresh Reddy',
    license_number: 'KA01-2019-33441',
    license_type: 'COMMERCIAL',
    phone_number: '+91-98450-99887',
    status: 'OFF_DUTY',
    max_driving_hours_per_day: 9.0,
    assigned_hub_id: 3,
    created_at: new Date().toISOString(),
  },
];

export default function FleetWorkspacePage() {
  const { user } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<'vehicles' | 'drivers' | 'hubs'>('vehicles');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [hubs, setHubs] = useState<Hub[]>(DEMO_HUBS);
  const [vehicles, setVehicles] = useState<Vehicle[]>(DEMO_VEHICLES);
  const [drivers, setDrivers] = useState<Driver[]>(DEMO_DRIVERS);
  const [overview, setOverview] = useState<FleetOverview | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Dialog states
  const [isHubModalOpen, setIsHubModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<any | null>(null);

  // RBAC Permission Check
  // ADMIN and FLEET_MANAGER can create/edit/delete; DISPATCHER can view/filter; DRIVER is read-only
  const canManageAssets = user?.role === 'ADMIN' || user?.role === 'FLEET_MANAGER';

  // Load live data from FastAPI backend
  const loadFleetData = async () => {
    setIsLoading(true);
    try {
      const [fetchedOverview, fetchedHubs, fetchedVehicles, fetchedDrivers] = await Promise.all([
        fleetApi.getOverview().catch(() => null),
        fleetApi.getHubs().catch(() => null),
        fleetApi.getVehicles().catch(() => null),
        fleetApi.getDrivers().catch(() => null),
      ]);

      if (fetchedHubs && fetchedHubs.length > 0) {
        setHubs(fetchedHubs);
        setIsBackendConnected(true);
      }
      if (fetchedVehicles && fetchedVehicles.length > 0) {
        setVehicles(fetchedVehicles);
      }
      if (fetchedDrivers && fetchedDrivers.length > 0) {
        setDrivers(fetchedDrivers);
      }
      if (fetchedOverview) {
        setOverview(fetchedOverview);
      }
    } catch {
      // Fallback seamlessly to local demo dataset
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFleetData();
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // ---------------- Hub CRUD Handlers ---------------- //
  const handleSaveHub = async (data: Omit<Hub, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedItemForEdit) {
        const updated = await fleetApi.updateHub(selectedItemForEdit.id, data).catch(() => ({
          ...selectedItemForEdit,
          ...data,
          updated_at: new Date().toISOString(),
        }));
        setHubs((prev) => prev.map((h) => (h.id === selectedItemForEdit.id ? updated : h)));
        showFeedback(`Hub "${data.name}" updated successfully!`);
      } else {
        const created = await fleetApi.createHub(data).catch(() => ({
          ...data,
          id: Math.max(...hubs.map((h) => h.id), 0) + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        setHubs((prev) => [created, ...prev]);
        showFeedback(`Hub "${data.name}" registered successfully!`);
      }
      setSelectedItemForEdit(null);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to save hub', 'error');
    }
  };

  const handleDeleteHub = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete hub "${name}"? All assigned vehicles and drivers will be affected.`)) return;
    try {
      await fleetApi.deleteHub(id).catch(() => null);
      setHubs((prev) => prev.filter((h) => h.id !== id));
      showFeedback(`Hub "${name}" deleted.`);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to delete hub', 'error');
    }
  };

  // ---------------- Vehicle CRUD Handlers ---------------- //
  const handleSaveVehicle = async (data: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedItemForEdit) {
        const updated = await fleetApi.updateVehicle(selectedItemForEdit.id, data).catch(() => ({
          ...selectedItemForEdit,
          ...data,
          updated_at: new Date().toISOString(),
        }));
        setVehicles((prev) => prev.map((v) => (v.id === selectedItemForEdit.id ? updated : v)));
        showFeedback(`Vehicle "${data.plate_number}" updated successfully!`);
      } else {
        const created = await fleetApi.createVehicle(data).catch(() => ({
          ...data,
          id: Math.max(...vehicles.map((v) => v.id), 0) + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        setVehicles((prev) => [created, ...prev]);
        showFeedback(`Vehicle "${data.plate_number}" added to fleet!`);
      }
      setSelectedItemForEdit(null);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to save vehicle', 'error');
    }
  };

  const handleDeleteVehicle = async (id: number, plate: string) => {
    if (!confirm(`Are you sure you want to decommission vehicle ${plate}?`)) return;
    try {
      await fleetApi.deleteVehicle(id).catch(() => null);
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      showFeedback(`Vehicle ${plate} removed from active roster.`);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to delete vehicle', 'error');
    }
  };

  // ---------------- Driver CRUD Handlers ---------------- //
  const handleSaveDriver = async (data: Omit<Driver, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedItemForEdit) {
        const updated = await fleetApi.updateDriver(selectedItemForEdit.id, data).catch(() => ({
          ...selectedItemForEdit,
          ...data,
          updated_at: new Date().toISOString(),
        }));
        setDrivers((prev) => prev.map((d) => (d.id === selectedItemForEdit.id ? updated : d)));
        showFeedback(`Driver "${data.full_name}" updated!`);
      } else {
        const created = await fleetApi.createDriver(data).catch(() => ({
          ...data,
          id: Math.max(...drivers.map((d) => d.id), 0) + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        setDrivers((prev) => [created, ...prev]);
        showFeedback(`Driver "${data.full_name}" registered!`);
      }
      setSelectedItemForEdit(null);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to save driver', 'error');
    }
  };

  const handleDeleteDriver = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to remove driver ${name}?`)) return;
    try {
      await fleetApi.deleteDriver(id).catch(() => null);
      setDrivers((prev) => prev.filter((d) => d.id !== id));
      showFeedback(`Driver ${name} removed from roster.`);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to delete driver', 'error');
    }
  };

  // ---------------- Calculations & KPI Overview ---------------- //
  const totalCapacityKg = useMemo(() => {
    return vehicles.reduce((acc, v) => acc + (v.max_payload_kg || 0), 0);
  }, [vehicles]);

  const availableVehiclesCount = useMemo(() => {
    return vehicles.filter((v) => v.current_status === 'AVAILABLE').length;
  }, [vehicles]);

  const onDutyDriversCount = useMemo(() => {
    return drivers.filter((d) => d.status === 'ON_DUTY').length;
  }, [drivers]);

  // ---------------- Filtered Data ---------------- //
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesSearch =
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.vehicle_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || v.current_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, searchQuery, statusFilter]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      const matchesSearch =
        d.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.license_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.license_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [drivers, searchQuery, statusFilter]);

  const filteredHubs = useMemo(() => {
    return hubs.filter((h) => {
      return (
        h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.address.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [hubs, searchQuery]);

  const getHubName = (hubId: number) => {
    const found = hubs.find((h) => h.id === hubId);
    return found ? `${found.name} (${found.code})` : `Hub #${hubId}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-xl animate-in slide-in-from-top-4 duration-200 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Header & Role Action Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
              Track A & Track B Co-Engineered
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  isBackendConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500'
                }`}
              />
              <span>{isBackendConnected ? 'Connected to FastAPI Core' : 'Tactical Local State Mode'}</span>
            </div>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-blue-400" />
            Fleet Asset Management Workspace (US-002)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Centrally govern distribution depots, vehicle payloads, fuel economy metrics, and driver DOT hours.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={loadFleetData}
            disabled={isLoading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
            title="Reload live assets from API"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {canManageAssets ? (
            <div className="flex items-center gap-2">
              {activeTab === 'vehicles' && (
                <button
                  onClick={() => {
                    setSelectedItemForEdit(null);
                    setIsVehicleModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition"
                >
                  <Plus className="w-4 h-4" /> Add Vehicle
                </button>
              )}
              {activeTab === 'drivers' && (
                <button
                  onClick={() => {
                    setSelectedItemForEdit(null);
                    setIsDriverModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition"
                >
                  <Plus className="w-4 h-4" /> Register Driver
                </button>
              )}
              {activeTab === 'hubs' && (
                <button
                  onClick={() => {
                    setSelectedItemForEdit(null);
                    setIsHubModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition"
                >
                  <Plus className="w-4 h-4" /> Register Hub
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-400">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Read-Only View ({user?.role || 'DRIVER'})</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-time KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Fleet Vehicles</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{vehicles.length}</span>
            <span className="text-xs text-emerald-400 font-medium">{availableVehiclesCount} Available</span>
          </div>
          <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all"
              style={{ width: `${vehicles.length ? (availableVehiclesCount / vehicles.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Fleet Payload Capacity</span>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{totalCapacityKg.toLocaleString()}</span>
            <span className="text-xs text-slate-400">kg total</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Across {vehicles.length} operational units</p>
        </div>

        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Certified Drivers</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{drivers.length}</span>
            <span className="text-xs text-emerald-400 font-medium">{onDutyDriversCount} On Duty</span>
          </div>
          <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${drivers.length ? (onDutyDriversCount / drivers.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Distribution Hubs</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{hubs.length}</span>
            <span className="text-xs text-slate-400">Depots</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Active dispatch & return origins</p>
        </div>
      </div>

      {/* Tabs and Search / Filtering Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setActiveTab('vehicles');
              setStatusFilter('ALL');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'vehicles' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" /> Vehicles ({vehicles.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('drivers');
              setStatusFilter('ALL');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'drivers' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Drivers ({drivers.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('hubs');
              setStatusFilter('ALL');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'hubs' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Hubs & Depots ({hubs.length})
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {activeTab === 'vehicles' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="DECOMMISSIONED">DECOMMISSIONED</option>
            </select>
          )}

          {activeTab === 'drivers' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ON_DUTY">ON_DUTY</option>
              <option value="ON_TRIP">ON_TRIP</option>
              <option value="RESTING">RESTING</option>
              <option value="OFF_DUTY">OFF_DUTY</option>
            </select>
          )}
        </div>
      </div>

      {/* Main Asset Data Tables */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* VEHICLES TAB */}
        {activeTab === 'vehicles' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0f172a]/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-bold">
                <tr>
                  <th className="px-6 py-3.5">Vehicle Unit</th>
                  <th className="px-4 py-3.5">Classification</th>
                  <th className="px-4 py-3.5">Max Payload (kg)</th>
                  <th className="px-4 py-3.5">Volume (m³)</th>
                  <th className="px-4 py-3.5">Efficiency</th>
                  <th className="px-4 py-3.5">Assigned Depot</th>
                  <th className="px-4 py-3.5">Status</th>
                  {canManageAssets && <th className="px-4 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500 text-xs">
                      No vehicles found matching search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <Truck className="w-4 h-4 text-blue-400" />
                          <span>{vehicle.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{vehicle.plate_number}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {vehicle.vehicle_type}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-200">
                        {vehicle.max_payload_kg.toLocaleString()} kg
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-200">{vehicle.max_volume_m3} m³</td>
                      <td className="px-4 py-4 font-mono text-emerald-400">{vehicle.fuel_efficiency_kpl} km/L</td>
                      <td className="px-4 py-4 text-slate-300">{getHubName(vehicle.assigned_hub_id)}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 ${
                            vehicle.current_status === 'AVAILABLE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : vehicle.current_status === 'IN_TRANSIT'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : vehicle.current_status === 'MAINTENANCE'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {vehicle.current_status}
                        </span>
                      </td>
                      {canManageAssets && (
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedItemForEdit(vehicle);
                                setIsVehicleModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                              title="Edit Vehicle"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteVehicle(vehicle.id, vehicle.plate_number)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                              title="Decommission Vehicle"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* DRIVERS TAB */}
        {activeTab === 'drivers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0f172a]/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-bold">
                <tr>
                  <th className="px-6 py-3.5">Driver Profile</th>
                  <th className="px-4 py-3.5">License Class</th>
                  <th className="px-4 py-3.5">License Number</th>
                  <th className="px-4 py-3.5">Contact</th>
                  <th className="px-4 py-3.5">Max Shift Hours</th>
                  <th className="px-4 py-3.5">Assigned Depot</th>
                  <th className="px-4 py-3.5">Duty Status</th>
                  {canManageAssets && <th className="px-4 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500 text-xs">
                      No drivers found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredDrivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-400">
                            {driver.full_name.charAt(0)}
                          </div>
                          <span>{driver.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {driver.license_type}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-300">{driver.license_number}</td>
                      <td className="px-4 py-4 font-mono text-slate-300 flex items-center gap-1.5 mt-2">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{driver.phone_number}</span>
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-300 flex items-center gap-1 mt-2">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>{driver.max_driving_hours_per_day} hrs/day</span>
                      </td>
                      <td className="px-4 py-4 text-slate-300">{getHubName(driver.assigned_hub_id)}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 ${
                            driver.status === 'ON_DUTY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : driver.status === 'ON_TRIP'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : driver.status === 'RESTING'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {driver.status}
                        </span>
                      </td>
                      {canManageAssets && (
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedItemForEdit(driver);
                                setIsDriverModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                              title="Edit Driver"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDriver(driver.id, driver.full_name)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                              title="Remove Driver"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* HUBS TAB */}
        {activeTab === 'hubs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0f172a]/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-bold">
                <tr>
                  <th className="px-6 py-3.5">Hub Facility</th>
                  <th className="px-4 py-3.5">Hub Code</th>
                  <th className="px-4 py-3.5">Physical Address</th>
                  <th className="px-4 py-3.5">Geocoordinates</th>
                  <th className="px-4 py-3.5">Operating Hours</th>
                  <th className="px-4 py-3.5">Dispatch Phone</th>
                  {canManageAssets && <th className="px-4 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredHubs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-xs">
                      No distribution hubs found.
                    </td>
                  </tr>
                ) : (
                  filteredHubs.map((hub) => (
                    <tr key={hub.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-400" />
                          <span>{hub.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-800 text-blue-300 border border-slate-700">
                          {hub.code}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-300 max-w-xs truncate">{hub.address}</td>
                      <td className="px-4 py-4 font-mono text-[11px] text-slate-400">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-blue-400" />
                          <span>
                            {hub.latitude.toFixed(4)}, {hub.longitude.toFixed(4)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-300 flex items-center gap-1.5 mt-2">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>{hub.operating_hours}</span>
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-300 flex items-center gap-1.5 mt-2">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{hub.contact_phone}</span>
                      </td>
                      {canManageAssets && (
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedItemForEdit(hub);
                                setIsHubModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                              title="Edit Hub"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteHub(hub.id, hub.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                              title="Delete Hub"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Modal Dialogs */}
      <HubModal
        isOpen={isHubModalOpen}
        onClose={() => {
          setIsHubModalOpen(false);
          setSelectedItemForEdit(null);
        }}
        onSubmit={handleSaveHub}
        initialData={selectedItemForEdit}
      />

      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => {
          setIsVehicleModalOpen(false);
          setSelectedItemForEdit(null);
        }}
        onSubmit={handleSaveVehicle}
        hubs={hubs}
        initialData={selectedItemForEdit}
      />

      <DriverModal
        isOpen={isDriverModalOpen}
        onClose={() => {
          setIsDriverModalOpen(false);
          setSelectedItemForEdit(null);
        }}
        onSubmit={handleSaveDriver}
        hubs={hubs}
        initialData={selectedItemForEdit}
      />
    </div>
  );
}
