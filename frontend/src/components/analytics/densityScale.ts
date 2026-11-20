// Colour classes for the delivery density heatmap (Week 13 · Track B). Kept apart from the map so the
// legend can render without loading Leaflet.
/** Five classes from the validated sequential blue ramp (steps 150, 300, 450, 550, 700). */
export const DENSITY_STEPS = ['#b7d3f6', '#6da7ec', '#2a78d6', '#1c5cab', '#0d366b']

/** Class i holds cells with more than i/5 and at most (i+1)/5 of the busiest cell's deliveries. */
export function densityClass(stops: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(DENSITY_STEPS.length - 1, Math.ceil((stops / max) * DENSITY_STEPS.length) - 1))
}

/** Legend entries: the delivery-count range of each class that can hold at least one whole number. */
export function densityBreaks(max: number): { color: string; label: string }[] {
  const n = DENSITY_STEPS.length
  return DENSITY_STEPS.flatMap((color, i) => {
    const lo = Math.floor((max * i) / n) + 1
    const hi = Math.floor((max * (i + 1)) / n)
    if (lo > hi) return []
    return [{ color, label: lo === hi ? `${hi}` : `${lo}–${hi}` }]
  })
}
