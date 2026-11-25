// ─── DANGEROUS GOODS (mirrors backend/app/services/optimizer/hazmat.py, SOP-HZ-001) ───────────────────────
// §5 segregation: Class 1 with anything; 5.1 with 3 or 4.1; 8 with 6.1. §2: any hazmat needs an endorsed driver.
import type { Driver, Shipment } from './types'

const NAMED_DIVISIONS = new Set(['4.1', '5.1', '6.1'])
const INCOMPATIBLE: [string[], string[]][] = [[['5.1'], ['3', '4.1']], [['8'], ['6.1']]]

export function normalise(c?: string | null): string | null {
  const v = (c ?? '').trim()
  if (!v) return null
  return NAMED_DIVISIONS.has(v) ? v : v.split('.')[0]
}

export function segregationConflict(classes: (string | null | undefined)[]): string | null {
  const present = new Set(classes.map(normalise).filter((c): c is string => !!c))
  if (present.has('1') && present.size > 1) return `Class 1 explosives cannot share a vehicle with other hazard classes (SOP-HZ-001 §5)`
  for (const [a, b] of INCOMPATIBLE) {
    const x = a.filter(c => present.has(c)), y = b.filter(c => present.has(c))
    if (x.length && y.length) return `Class ${x.join('/')} cannot share a vehicle with Class ${y.join('/')} (SOP-HZ-001 §5)`
  }
  return null
}

export const hazardClasses = (stops: Shipment[]) => [...new Set(stops.map(s => normalise(s.hazard_class)).filter((c): c is string => !!c))]

/** Why this driver may not carry these stops, or null (SOP-HZ-001 §2). */
export function endorsementProblem(d: Driver, stops: Shipment[]): string | null {
  return hazardClasses(stops).length && !d.hazmat_endorsed ? 'no hazmat endorsement' : null
}
