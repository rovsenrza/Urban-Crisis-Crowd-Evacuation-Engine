"""Routing provider selection by configuration.

To add a provider: implement `RoutingProvider` and register a builder here.
"""
from __future__ import annotations

from typing import Callable

from ...config import Settings
from ...domain.models import RoadGraph
from ...domain.ports import Clock, RoutingProvider
from .osrm import OSRMRoutingProvider
from .resilient import ResilientRoutingProvider, StaticMatrixProvider
from .simulated import SimulatedRoutingProvider

ProviderBuilder = Callable[[Settings, RoadGraph], RoutingProvider]

PROVIDERS: dict[str, ProviderBuilder] = {
    "simulated": lambda settings, graph: SimulatedRoutingProvider(graph),
    "osrm": lambda settings, graph: OSRMRoutingProvider(
        settings.osrm_base_url, settings.osrm_profile, settings.osrm_timeout_s
    ),
}


def build_routing_provider(settings: Settings, graph: RoadGraph) -> RoutingProvider:
    try:
        return PROVIDERS[settings.routing_provider](settings, graph)
    except KeyError as exc:
        known = ", ".join(PROVIDERS)
        raise ValueError(
            f"Unknown ROUTING_PROVIDER '{settings.routing_provider}' (known: {known})"
        ) from exc


# Providers that call a service outside this process and therefore need a breaker.
EXTERNAL_PROVIDERS = {"osrm"}


def build_resilient_routing(settings: Settings, graph: RoadGraph, clock: Clock) -> RoutingProvider:
    """The configured provider; an external one is wrapped in a circuit breaker
    with the local road graph and a static matrix as fallbacks."""
    if settings.routing_provider not in EXTERNAL_PROVIDERS:
        return build_routing_provider(settings, graph)
    primary = OSRMRoutingProvider(settings.osrm_base_url, settings.osrm_profile,
                                  settings.osrm_timeout_s, raise_on_failure=True)
    return ResilientRoutingProvider(
        primary,
        local=SimulatedRoutingProvider(graph),
        clock=clock,
        failure_threshold=settings.routing_breaker_failures,
        reset_s=settings.routing_breaker_reset_s,
        static=StaticMatrixProvider(settings.routing_static_detour),
    )
