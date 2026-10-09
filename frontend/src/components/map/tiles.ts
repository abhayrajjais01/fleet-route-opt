// ─── BASEMAP ──────────────────────────────────────────────────────────────────
// Standard OpenStreetMap tiles (free, no API key), muted with a CSS filter (.fleet-basemap in index.css)
// so routes and markers carry the colour rather than the streets.
import L from 'leaflet'

export function addBasemap(map: L.Map) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'fleet-basemap',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
}
