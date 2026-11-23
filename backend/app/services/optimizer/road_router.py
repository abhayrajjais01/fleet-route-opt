"""
road_router.py - Road-Network Routing via OSRM (Track A: Manthan Nimodiya)

The distance engine (distance_matrix.py) estimates road distance from straight-line distance, which is good
enough to rank options but draws routes as straight lines across buildings, creeks and the harbour. This
module asks OSRM (Open Source Routing Machine, running on OpenStreetMap road data) for the real driving path:

    road_route([(lat, lon), ...], vehicle_type) -> RoadRoute(legs=[RoadLeg(km, minutes, path), ...], source)

- Distance and geometry come from the actual road network.
- Time uses our calibrated Indian-traffic speed model (city traffic -> highway, heavier vehicles slower) on the
  real road distance, and is never faster than OSRM's free-flow time. OSRM's car profile assumes empty roads,
  which is far too optimistic for a loaded truck in Mumbai.
- Fetching, caching, timeouts and the circuit breaker live in osrm_client.py.
- If OSRM is unreachable or slow, every leg falls back to the estimate with a straight-line path and
  `source="estimate"`, so maps and ETAs keep working offline (and in tests).

"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence, Tuple

from app.services.optimizer import osrm_client
from app.services.optimizer.distance_matrix import haversine_km, road_distance_km, road_minutes, travel_minutes

PATH_PRECISION = 5           # ~1 m; keeps the payload small
SNAP_WARN_M = 300            # a point more than this far from any road is flagged

LatLon = Tuple[float, float]


@dataclass(frozen=True)
class RoadLeg:
    km: float
    minutes: float
    path: List[LatLon]       # road geometry from this leg's start to its end, as (lat, lon)


@dataclass(frozen=True)
class RoadRoute:
    legs: List[RoadLeg]
    source: str              # "osrm" (real roads) or "estimate" (straight-line fallback)
    snap_m: List[float]      # how far each input point is from the nearest road, in metres (osrm only)

    @property
    def km(self) -> float:
        return sum(l.km for l in self.legs)

    @property
    def minutes(self) -> float:
        return sum(l.minutes for l in self.legs)


def _estimate(points: Sequence[LatLon], vehicle_type: str) -> RoadRoute:
    legs = [
        RoadLeg(km=road_distance_km(*a, *b), minutes=travel_minutes(*a, *b, vehicle_type), path=[a, b])
        for a, b in zip(points, points[1:])
    ]
    return RoadRoute(legs=legs, source="estimate", snap_m=[])


def _leg_path(leg: dict) -> List[LatLon]:
    path: List[LatLon] = []
    for step in leg.get("steps", []):
        for lon, lat in step["geometry"]["coordinates"]:
            p = (round(lat, PATH_PRECISION), round(lon, PATH_PRECISION))
            if not path or path[-1] != p:
                path.append(p)
    return path


def road_route(points: Sequence[LatLon], vehicle_type: str = "VAN") -> RoadRoute:
    """Real road legs between consecutive points (A->B, B->C, ...), or the estimate if OSRM is unavailable."""
    pts = [(float(lat), float(lon)) for lat, lon in points]
    if len(pts) < 2:
        return RoadRoute(legs=[], source="estimate", snap_m=[])
    try:
        data = osrm_client.route(osrm_client.make_key(pts))
    except osrm_client.OsrmUnavailable:
        return _estimate(pts, vehicle_type)

    legs: List[RoadLeg] = []
    for (a, b), leg in zip(zip(pts, pts[1:]), data["routes"][0]["legs"]):
        km = leg["distance"] / 1000.0
        minutes = float(road_minutes(km, haversine_km(*a, *b), leg["duration"] / 60.0, vehicle_type))
        path = _leg_path(leg) or [a, b]
        # Start and end the drawn path exactly at the stop, not at the snapped road point.
        legs.append(RoadLeg(km=km, minutes=minutes, path=[a, *path, b]))
    snap = [float(w.get("distance", 0.0)) for w in data.get("waypoints", [])]
    return RoadRoute(legs=legs, source="osrm", snap_m=snap)


def cache_clear() -> None:
    osrm_client.reset()


# ==================== Turn-by-turn directions ==================== #
COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
MAX_STEPS_PER_LEG = 8
SHORT_LINK_KM = 1.0       # a renamed stretch shorter than this (flyover, bridge) is folded into the road it continues


def _compass(deg: float) -> str:
    return COMPASS[int(((deg % 360) + 22.5) // 45) % 8]


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd"}.get(n, f"{n}th")


def _refs(step: dict) -> set:
    return {r.strip() for r in (step.get("ref") or "").split(";") if r.strip()}


def _norm(label: str) -> str:
    """Spelling-insensitive key: "Sion-Panvel Highway" and "Sion Panvel Highway" are the same road."""
    return "".join(ch for ch in label.lower() if ch.isalnum())


def _label(step: dict) -> str:
    name, refs = (step.get("name") or "").strip(), sorted(_refs(step))
    parts = [p.strip() for p in name.split(" - ") if p.strip()]
    if len(parts) > 2 or len(name) > 48:
        name = parts[0] if parts else name[:48]   # OSM joins every local name of a road; the first is the signed one
    if name and refs:
        return f"{name} ({refs[0]})"
    return name or (refs[0] if refs else "")


def _phrase(step: dict) -> str:
    m = step.get("maneuver", {})
    kind, mod = m.get("type", ""), (m.get("modifier") or "").replace("slight ", "")
    side = mod if mod in ("left", "right") else ""
    if kind == "depart":
        return f"Head {_compass(m.get('bearing_after', 0))}"
    if kind in ("roundabout", "rotary"):
        return f"At the roundabout, take the {_ordinal(int(m.get('exit') or 1))} exit"
    if kind == "fork":
        return f"Keep {side or 'straight'}"
    if kind == "merge":
        return "Merge"
    if kind == "on ramp":
        return "Take the ramp"
    if kind == "off ramp":
        return f"Take the exit{' on the ' + side if side else ''}"
    if kind in ("new name", "continue") or mod == "straight":
        return "Continue"
    if mod == "uturn":
        return "Make a U-turn"
    if (m.get("modifier") or "").startswith("slight"):
        return f"Bear {side}"
    if (m.get("modifier") or "").startswith("sharp"):
        return f"Turn sharp {side}"
    return f"Turn {side}" if side else "Continue"


def _distance(km: float) -> str:
    return f"{km:.1f} km" if km >= 1 else f"{max(50, round(km * 1000, -1)):.0f} m"


def leg_directions(leg: dict) -> List[str]:
    """Condensed, driver-friendly directions for one OSRM leg (needs steps=true)."""
    merged: List[dict] = []   # {"phrase", "label", "refs", "km"}
    for st in leg.get("steps", []):
        kind = st.get("maneuver", {}).get("type", "")
        km = st.get("distance", 0.0) / 1000.0
        if kind == "arrive":
            continue
        label, refs = _label(st), _refs(st)
        if merged:
            prev = merged[-1]
            same_road = bool(label and prev["label"] and _norm(label.split(" (")[0]) == _norm(prev["label"].split(" (")[0])) \
                or bool(refs and refs & prev["refs"])
            roundabout_exit = kind.startswith("exit ")
            unnamed = not label
            short_rename = kind in ("new name", "continue") and km < SHORT_LINK_KM
            if same_road or roundabout_exit or unnamed or short_rename:
                prev["km"] += km
                if roundabout_exit and label:
                    prev["label"] = label
                prev["refs"] |= refs
                continue
        merged.append({"phrase": _phrase(st), "label": label, "refs": set(refs), "km": km})

    lines = [f"{m['phrase']}{' onto ' + m['label'] if m['label'] and not m['phrase'].startswith('Head') else ''}"
             f"{' on ' + m['label'] if m['label'] and m['phrase'].startswith('Head') else ''} for {_distance(m['km'])}"
             for m in merged]
    if len(lines) > MAX_STEPS_PER_LEG:
        rest = sum(m["km"] for m in merged[MAX_STEPS_PER_LEG - 1:])
        lines = lines[:MAX_STEPS_PER_LEG - 1] + [f"Then follow the route for {_distance(rest)}"]
    return lines


def road_directions(points: Sequence[LatLon]) -> List[List[str]] | None:
    """Turn-by-turn directions for each leg (A->B, B->C, ...), or None when the road network is unavailable."""
    pts = [(float(lat), float(lon)) for lat, lon in points]
    if len(pts) < 2:
        return None
    try:
        data = osrm_client.route(osrm_client.make_key(pts))
    except osrm_client.OsrmUnavailable:
        return None
    return [leg_directions(leg) for leg in data["routes"][0]["legs"]]
