// ─── DELIVERY LOCALITIES (sample data) ───────────────────────────────────────
// Real commercial localities around the demo hubs, so sample orders sit on streets the road router can reach
// (random offsets around a hub land in creeks and the harbour around Mumbai).
export interface Place { area: string; city: string; lat: number; lon: number }

export const PLACES: Place[] = [
  // Mumbai (western suburbs and central)
  { area: 'Andheri West', city: 'Mumbai', lat: 19.1364, lon: 72.8296 },
  { area: 'Powai', city: 'Mumbai', lat: 19.1176, lon: 72.9060 },
  { area: 'Bandra Kurla Complex', city: 'Mumbai', lat: 19.0660, lon: 72.8650 },
  { area: 'Goregaon East', city: 'Mumbai', lat: 19.1736, lon: 72.8605 },
  { area: 'Vile Parle East', city: 'Mumbai', lat: 19.0990, lon: 72.8490 },
  { area: 'Kalina, Santacruz East', city: 'Mumbai', lat: 19.0790, lon: 72.8640 },
  { area: 'Ghatkopar West', city: 'Mumbai', lat: 19.0996, lon: 72.9163 },
  { area: 'Jogeshwari East', city: 'Mumbai', lat: 19.1360, lon: 72.8600 },
  { area: 'Malad West', city: 'Mumbai', lat: 19.1730, lon: 72.8360 },
  { area: 'Kurla West', city: 'Mumbai', lat: 19.0866, lon: 72.8890 },
  // Navi Mumbai
  { area: 'Vashi Sector 30', city: 'Navi Mumbai', lat: 19.0659, lon: 72.9985 },
  { area: 'Nerul', city: 'Navi Mumbai', lat: 19.0330, lon: 73.0180 },
  { area: 'CBD Belapur', city: 'Navi Mumbai', lat: 19.0235, lon: 73.0400 },
  { area: 'Kharghar', city: 'Navi Mumbai', lat: 19.0470, lon: 73.0700 },
  { area: 'Airoli', city: 'Navi Mumbai', lat: 19.1550, lon: 72.9980 },
  { area: 'Ghansoli', city: 'Navi Mumbai', lat: 19.1210, lon: 73.0040 },
  { area: 'Kopar Khairane', city: 'Navi Mumbai', lat: 19.1030, lon: 73.0100 },
  { area: 'Sanpada', city: 'Navi Mumbai', lat: 19.0630, lon: 73.0090 },
  { area: 'Turbhe MIDC', city: 'Navi Mumbai', lat: 19.0800, lon: 73.0200 },
  { area: 'Seawoods', city: 'Navi Mumbai', lat: 19.0190, lon: 73.0190 },
  // Pune (west)
  { area: 'Wakad', city: 'Pune', lat: 18.5990, lon: 73.7620 },
  { area: 'Baner', city: 'Pune', lat: 18.5590, lon: 73.7860 },
  { area: 'Aundh', city: 'Pune', lat: 18.5580, lon: 73.8070 },
  { area: 'Pimple Saudagar', city: 'Pune', lat: 18.5980, lon: 73.8000 },
  { area: 'Balewadi', city: 'Pune', lat: 18.5760, lon: 73.7740 },
  { area: 'Pashan', city: 'Pune', lat: 18.5370, lon: 73.7980 },
  { area: 'Kothrud', city: 'Pune', lat: 18.5074, lon: 73.8077 },
  { area: 'Pimpri', city: 'Pune', lat: 18.6270, lon: 73.8000 },
  { area: 'Ravet', city: 'Pune', lat: 18.6450, lon: 73.7450 },
  { area: 'Tathawade', city: 'Pune', lat: 18.6200, lon: 73.7500 },
]

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180))

/** `n` distinct localities near the hub (within 25 km), in random order; empty if the hub is elsewhere. */
export function placesNear(hub: { latitude: number; longitude: number }, n: number): Place[] {
  const near = PLACES.filter(p => km(p, { lat: hub.latitude, lon: hub.longitude }) <= 25)
  for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [near[i], near[j]] = [near[j], near[i]] }
  return near.slice(0, n)
}
