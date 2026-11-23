// ─── BASEMAP ──────────────────────────────────────────────────────────────────
// Standard OpenStreetMap tiles (free, no API key) - the same road data the road router follows, so drawn routes
// line up with the streets underneath. A light CSS filter (.fleet-basemap in index.css) softens the colours so
// routes and markers stand out while road names stay readable.
import L from 'leaflet'

export function addBasemap(map: L.Map) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'fleet-basemap',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
}
