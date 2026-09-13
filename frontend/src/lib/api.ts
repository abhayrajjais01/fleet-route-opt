// ============================================================================
// API CLIENT UTILITY: Axios / Fetch wrapper with automatic JWT token attachment
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('fleet_token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config: RequestInit = {
    ...options,
    headers,
  };

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, config);

  if (!response.ok) {
    let errorDetail = 'API request failed';
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorJson.message || errorDetail;
    } catch {
      errorDetail = `${response.status} ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  return response.json() as Promise<T>;
}

// ----------------------------------------------------------------------------
// FLEET ASSET MANAGEMENT API METHODS (US-002)
// ----------------------------------------------------------------------------
import type { Hub, Vehicle, Driver, FleetOverview } from './types';

export const fleetApi = {
  // Overview
  getOverview: () => apiClient<FleetOverview>('/fleet/overview'),

  // Hubs
  getHubs: () => apiClient<Hub[]>('/fleet/hubs'),
  getHub: (id: number) => apiClient<Hub>(`/fleet/hubs/${id}`),
  createHub: (data: Omit<Hub, 'id' | 'created_at' | 'updated_at'>) =>
    apiClient<Hub>('/fleet/hubs', { method: 'POST', body: JSON.stringify(data) }),
  updateHub: (id: number, data: Partial<Hub>) =>
    apiClient<Hub>(`/fleet/hubs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHub: (id: number) => apiClient<{ message: string }>(`/fleet/hubs/${id}`, { method: 'DELETE' }),

  // Vehicles
  getVehicles: (status?: string, hubId?: number) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (hubId) params.append('hub_id', hubId.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient<Vehicle[]>(`/fleet/vehicles${query}`);
  },
  getVehicle: (id: number) => apiClient<Vehicle>(`/fleet/vehicles/${id}`),
  createVehicle: (data: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>) =>
    apiClient<Vehicle>('/fleet/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  updateVehicle: (id: number, data: Partial<Vehicle>) =>
    apiClient<Vehicle>(`/fleet/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVehicle: (id: number) =>
    apiClient<{ message: string }>(`/fleet/vehicles/${id}`, { method: 'DELETE' }),

  // Drivers
  getDrivers: (status?: string, hubId?: number) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (hubId) params.append('hub_id', hubId.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient<Driver[]>(`/fleet/drivers${query}`);
  },
  getDriver: (id: number) => apiClient<Driver>(`/fleet/drivers/${id}`),
  createDriver: (data: Omit<Driver, 'id' | 'created_at' | 'updated_at'>) =>
    apiClient<Driver>('/fleet/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id: number, data: Partial<Driver>) =>
    apiClient<Driver>(`/fleet/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDriver: (id: number) =>
    apiClient<{ message: string }>(`/fleet/drivers/${id}`, { method: 'DELETE' }),
};
