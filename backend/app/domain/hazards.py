"""Extensible hazard-type registry.

Adding a hazard = one `hazards.register(...)` call (plus an i18n label on the
frontend). Nothing else in the system enumerates hazard types.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HazardType:
    code: str
    label: str  # default (Azerbaijani) label; the UI may override it via i18n
    color: str  # marker colour on the operator map
    icon: str


class HazardRegistry:
    def __init__(self) -> None:
        self._items: dict[str, HazardType] = {}

    def register(self, hazard: HazardType) -> HazardType:
        self._items[hazard.code] = hazard
        return hazard

    def get(self, code: str) -> HazardType | None:
        return self._items.get(code)

    def __contains__(self, code: object) -> bool:
        return code in self._items

    def all(self) -> list[HazardType]:
        return list(self._items.values())

    def codes(self) -> list[str]:
        return list(self._items)


hazards = HazardRegistry()
hazards.register(HazardType("fire", "Yanğın", "#e8590c", "🔥"))
hazards.register(HazardType("collapse", "Uçqun", "#7048e8", "🏚️"))
hazards.register(HazardType("flood", "Daşqın", "#1c7ed6", "🌊"))
hazards.register(HazardType("medical", "Tibbi yardım", "#e03131", "➕"))
