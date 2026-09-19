/**
 * api.ts - Centralized HTTP Fetch Client Utility & Fleet API Handlers
 * 
 * Provides:
 * 1. `apiClient<T>`: Async fetch wrapper that automatically reads the JWT token from `localStorage`
 *    and attaches the `Authorization: Bearer <token>` header to all backend HTTP requests.
 * 2. `fleetApi`: Strongly typed API helper methods for Hubs, Vehicles, Drivers, and Overview metrics.
 */

import type { Hub, Vehicle, Driver, FleetOverview } from './types';

// Base backend URL resolution: uses environment variable NEXT_PUBLIC_API_URL or defaults to localhost FastAPI
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

/**
 * Generic `apiClient` wrapper for making HTTP requests to the FastAPI backend.
 * Handles header injection, error parsing, and JSON deserialization.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Retrieve signed JWT token from localStorage if running client-side in the browser
  const token = typeof window !== 'undefined' ? localStorage.getItem('fleet_token') : null;

  // Construct request headers with Content-Type and optional Bearer auth token
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config: RequestInit = {
    ...options,
    headers,
  };

  // Build full URL endpoint
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, config);

  // Handle non-2xx HTTP responses and extract detailed error messages from FastAPI
  if (!response.ok) {
    let errorDetail = 'API request failed';
    try {
      const errorJson = await response.json();
      if (Array.isArray(errorJson.detail)) {
        // Formats Pydantic validation array errors into readable bullet points
        errorDetail = errorJson.detail
          .map((item: any) => {
            const field = item.loc ? item.loc[item.loc.length - 1] : '';
            const fieldName = field ? field.charAt(0).toUpperCase() + String(field).slice(1).replace('_', ' ') : '';
            return fieldName ? `${fieldName}: ${item.msg}` : item.msg;
          })
          .join(' • ');
      } else if (typeof errorJson.detail === 'string') {
        errorDetail = errorJson.detail;
      } else if (errorJson.message) {
        errorDetail = errorJson.message;
      }
    } catch {
      errorDetail = `${response.status} ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  return response.json() as Promise<T>;
}

// ----------------------------------------------------------------------------
// STRONGLY TYPED FLEET API SERVICE METHODS
// ----------------------------------------------------------------------------
export const fleetApi = {
  // Aggregate Metrics Overview
  getOverview: () => apiClient<FleetOverview>('/fleet/overview'),

  // Distribution Hub CRUD Methods
  getHubs: () => apiClient<Hub[]>('/fleet/hubs'),
  getHub: (id: number) => apiClient<Hub>(`/fleet/hubs/${id}`),
  createHub: (data: Omit<Hub, 'id' | 'created_at' | 'updated_at'>) =>
    apiClient<Hub>('/fleet/hubs', { method: 'POST', body: JSON.stringify(data) }),
  updateHub: (id: number, data: Partial<Hub>) =>
    apiClient<Hub>(`/fleet/hubs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHub: (id: number) => apiClient<{ message: string }>(`/fleet/hubs/${id}`, { method: 'DELETE' }),

  // Fleet Delivery Vehicle CRUD Methods
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

  // Certified Driver CRUD Methods
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
