// ─── TIME-OF-DAY TRAFFIC (mirrors backend/app/services/optimizer/traffic.py) ──
// Rush hours slow every leg. Leg times from the backend are midday "base" times; these helpers turn them into
// the time for an actual departure using the same time-dependent speed model as the backend (Ichoua,
// Gendreau & Potvin): within each period the truck covers distance at 1/factor speed, so leaving later can
// never mean arriving earlier.
const DAY = 1440
export const PROFILE: [number, number][] = [
  [0, 0.8],      // 00:00 night
  [360, 0.95],   // 06:00 early morning
  [480, 1.3],    // 08:00 morning peak
  [660, 1.0],    // 11:00 midday (base)
  [1020, 1.4],   // 17:00 evening peak
  [1260, 0.9],   // 21:00 late evening
]

function periodIndex(minute: number): number {
  const m = ((minute % DAY) + DAY) % DAY
  let i = 0
  while (i + 1 < PROFILE.length && PROFILE[i + 1][0] <= m) i++
  return i
}

export const factorAt = (minute: number) => PROFILE[periodIndex(minute)][1]

function periodEnd(minute: number): number {
  const dayStart = Math.floor(minute / DAY) * DAY
  const i = periodIndex(minute)
  return dayStart + (i + 1 < PROFILE.length ? PROFILE[i + 1][0] : DAY)
}

/** Minutes to drive a leg whose midday time is `base`, leaving at clock minute `depart`. */
export function travelTime(base: number, depart: number): number {
  if (!(base > 0) || !Number.isFinite(depart)) return Math.max(0, base || 0)
  let t = depart, remaining = base
  for (let guard = 0; guard < 64; guard++) {
    const f = factorAt(t), end = periodEnd(t), coverable = (end - t) / f
    if (remaining <= coverable) return t + remaining * f - depart
    remaining -= coverable
    t = end
  }
  return t + remaining * factorAt(t) - depart
}

/** Base minutes of driving covered between clock minutes t0 and t1 (inverse of travelTime). */
export function baseCovered(t0: number, t1: number): number {
  let t = t0, covered = 0
  for (let guard = 0; guard < 64 && t < t1; guard++) {
    const end = Math.min(periodEnd(t), t1)
    covered += (end - t) / factorAt(t)
    t = end
  }
  return covered
}
