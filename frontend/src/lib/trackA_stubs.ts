/**
 * trackA_stubs.ts - Track A Typed Mock & Stub Interfaces (Weeks 7 to 10)
 * Allows Track B components (Mobile Driver Cockpit, Copilot Drawer, Policy Agent)
 * to interact with Track A interfaces cleanly without waiting on Track A PRs.
 */

export interface RoutePolylineSegment {
  vehicleId: number
  colorHex: string
  points: [number, number][]
  totalKm: number
  totalDurationMinutes: number
}

export interface SplitManifestView {
  vehicleId: number
  plateNumber: string
  driverName: string
  capacityUsedPct: number
  stopsCount: number
  activeLegIndex: number
  polylines: RoutePolylineSegment[]
}

export interface ResequenceResult {
  resequenced: boolean
  newOrder: number[]
  distanceDeltaKm: number
  slaBreachesDetected: number
  breachedStopIds: number[]
}

export interface DownstreamEtaRecalculation {
  stopId: number
  originalEtaMin: number
  predictedEtaMin: number
  delayDeltaMin: number
  slaBreach: boolean
}

/** Mock calculator calculating downstream ripple delays */
export function calculateRippleEtas(
  delayMinutes: number,
  stops: { id: number; eta: number; windowEndMin: number }[]
): DownstreamEtaRecalculation[] {
  return stops.map(s => {
    const predicted = s.eta + delayMinutes
    return {
      stopId: s.id,
      originalEtaMin: s.eta,
      predictedEtaMin: predicted,
      delayDeltaMin: delayMinutes,
      slaBreach: predicted > s.windowEndMin,
    }
  })
}

