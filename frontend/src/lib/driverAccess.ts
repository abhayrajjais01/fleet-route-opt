// ─── DRIVER APP ACCESS ────────────────────────────────────────────────────────
// A driver is one person with two records: a login account (User, role DRIVER) and a driver profile (Driver:
// licence, hub, legal hours), linked by Driver.user_id (mirrors backend drivers.user_id → users.id).
// Every screen asks this one helper whether a driver can use the driver app, so they never disagree.
import type { Driver, User } from './types'

export type AppAccess = 'active' | 'deactivated' | 'none'

/** The DRIVER account linked to a driver profile, if any. */
export function accountFor(d: Driver, users: User[]): User | null {
  return d.user_id != null ? users.find(u => u.id === d.user_id && u.role === 'DRIVER') ?? null : null
}

export function appAccess(d: Driver, users: User[]): AppAccess {
  const u = accountFor(d, users)
  return !u ? 'none' : u.is_active ? 'active' : 'deactivated'
}

/** The driver profile linked to an account, if any. */
export function profileFor(u: User, drivers: Driver[]): Driver | null {
  return u.role === 'DRIVER' ? drivers.find(d => d.user_id === u.id) ?? null : null
}

export const ACCESS_NOTE: Record<AppAccess, string> = {
  active: 'Has the driver app',
  none: 'No app login: won\'t see the route on their phone',
  deactivated: 'Account deactivated: cannot be assigned',
}
