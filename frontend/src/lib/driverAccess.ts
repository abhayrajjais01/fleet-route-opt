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

/**
 * Uses the user list when this session has it (admins); otherwise the account state the backend reports on the
 * driver itself (account_active), so dispatchers and fleet managers see the same answer.
 */
export function appAccess(d: Driver, users: User[]): AppAccess {
  const u = accountFor(d, users)
  if (u) return u.is_active ? 'active' : 'deactivated'
  if (d.account_active === true) return 'active'
  if (d.account_active === false) return 'deactivated'
  return 'none'
}

/** The login email to show for a driver, if any. */
export function accountEmail(d: Driver, users: User[]): string | null {
  return accountFor(d, users)?.email ?? d.account_email ?? null
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
