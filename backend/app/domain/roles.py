"""Citizen roles and what each role changes in the system.

A role is declared by the (still anonymous) citizen in the app. Its policy
decides the SOS priority and the routing profile. To add a role: one enum
member + one `ROLE_POLICIES` entry (plus i18n labels on the frontend).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, IntEnum


class CitizenRole(str, Enum):
    STANDARD = "standard"
    # Person with reduced mobility / in need of special care ("Prioritet SOS").
    MOBILITY_IMPAIRED = "mobility_impaired"


class SOSPriority(IntEnum):
    """Lower number = handled first."""

    CRITICAL = 1
    NORMAL = 3


@dataclass(frozen=True)
class RolePolicy:
    sos_priority: SOSPriority
    # Route only over barrier-free roads to barrier-free assembly points.
    accessible_route: bool


ROLE_POLICIES: dict[CitizenRole, RolePolicy] = {
    CitizenRole.STANDARD: RolePolicy(SOSPriority.NORMAL, accessible_route=False),
    CitizenRole.MOBILITY_IMPAIRED: RolePolicy(SOSPriority.CRITICAL, accessible_route=True),
}


def policy_for(role: CitizenRole | str | None) -> RolePolicy:
    """Policy of a role; unknown or missing roles behave as STANDARD."""
    try:
        return ROLE_POLICIES[CitizenRole(role)]
    except (ValueError, KeyError):
        return ROLE_POLICIES[CitizenRole.STANDARD]


def normalize_role(role: CitizenRole | str | None) -> CitizenRole:
    try:
        return CitizenRole(role)
    except ValueError:
        return CitizenRole.STANDARD
