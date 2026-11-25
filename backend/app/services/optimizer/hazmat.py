"""
hazmat.py - Dangerous-goods rules for route planning (Track A: Manthan Nimodiya)

Encodes SOP-HZ-001 so the solver, ETA engine and planners apply the same rules:
  §5 Segregation: incompatible classes never share a vehicle -
       Class 1 (explosives) with any other class;
       Class 5.1 (oxidizers) with Class 3 (flammable liquids) or Class 4.1 (flammable solids);
       Class 8 (corrosives) with Class 6.1 (toxic substances).
     "The route optimizer treats hazmat segregation as a hard constraint."
  §2 / §3 A vehicle carrying any hazmat needs a hazmat-endorsed driver; 454 kg or more is a placarded load.

Hazard classes are UN class strings ("3", "8", "5.1", "2.1", ...). Divisions matter only where the SOP names
them (4.1, 5.1, 6.1); otherwise the main class is used.
"""

from __future__ import annotations

from typing import Iterable, Optional

PLACARD_KG = 454.0
_NAMED_DIVISIONS = {"4.1", "5.1", "6.1"}
_INCOMPATIBLE = [({"5.1"}, {"3", "4.1"}), ({"8"}, {"6.1"})]


def normalise(hazard_class: Optional[str]) -> Optional[str]:
    """'5.1' -> '5.1', '2.1' -> '2', ' 3 ' -> '3', '' / None -> None."""
    if not hazard_class or not str(hazard_class).strip():
        return None
    c = str(hazard_class).strip()
    return c if c in _NAMED_DIVISIONS else c.split(".")[0]


def segregation_conflict(classes: Iterable[Optional[str]]) -> Optional[str]:
    """Why these hazard classes cannot share one vehicle (SOP-HZ-001 §5), or None if they can."""
    present = {c for c in (normalise(x) for x in classes) if c}
    if "1" in present and len(present) > 1:
        return f"Class 1 explosives cannot be co-loaded with Class {', '.join(sorted(present - {'1'}))} (SOP-HZ-001 §5)"
    for a, b in _INCOMPATIBLE:
        if present & a and present & b:
            return f"Class {'/'.join(sorted(present & a))} cannot share a vehicle with Class {'/'.join(sorted(present & b))} (SOP-HZ-001 §5)"
    return None


def needs_endorsed_driver(classes: Iterable[Optional[str]]) -> bool:
    """Any hazmat on board requires a driver with a hazardous-goods endorsement (SOP-HZ-001 §2)."""
    return any(normalise(c) for c in classes)
