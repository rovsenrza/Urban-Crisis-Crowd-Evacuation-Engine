"""Composition root: the only place where adapters are chosen and wired."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import Engine

from .adapters.db.repositories import UnitOfWork, UowFactory
from .adapters.db.seed import seed_database
from .adapters.db.session import (
    create_schema,
    drop_schema,
    ensure_schema,
    make_engine,
    make_session_factory,
)
from .adapters.eventbus.inprocess import InProcessEventBus
from .adapters.notifications.channels import LogNotifier, NotificationDispatcher
from .adapters.routing.factory import build_resilient_routing
from .config import Settings
from .domain.alerts import RuleRegistry, load_builtin_rules
from .domain.hazards import HazardRegistry, hazards
from .domain.models import RoadGraph
from .domain.events import RoadStatusChanged, SystemReset
from .domain.ports import Clock, EventBus, RoutingProvider
from .realtime.bridge import RealtimeBridge
from .realtime.manager import ConnectionManager
from .services.alert_decision import AlertDecisionService
from .services.alert_engine import AlertEngine
from .services.clock import SystemClock
from .services.rate_limit import SlidingWindowLimiter
from .services.roads_cache import RoadsCache
from .services.sos_guard import SosGuard
from .services.dashboard import DashboardService
from .services.evacuation import EvacuationService
from .services.infrastructure import AssemblyService, BrigadeService, RoadService
from .services.reroute import RerouteService
from .services.scenarios import ScenarioRunner
from .services.simulation import SimulationService
from .services.sos import SOSService


@dataclass
class Container:
    settings: Settings
    engine: Engine
    uow: UowFactory
    bus: EventBus
    clock: Clock
    routing: RoutingProvider
    limiter: SlidingWindowLimiter
    sos_guard: SosGuard
    roads_cache: RoadsCache
    hazards: HazardRegistry
    rules: RuleRegistry
    connections: ConnectionManager
    sos: SOSService
    evacuation: EvacuationService
    reroute: RerouteService
    alert_engine: AlertEngine
    decisions: AlertDecisionService
    roads: RoadService
    assembly: AssemblyService
    brigades: BrigadeService
    simulation: SimulationService
    scenarios: ScenarioRunner
    dashboard: DashboardService


def build_container(settings: Settings, clock: Clock | None = None,
                    bus: EventBus | None = None,
                    routing: RoutingProvider | None = None) -> Container:
    clock = clock or SystemClock()
    bus = bus or InProcessEventBus()  # swap for a Redis/Kafka bus here

    engine = make_engine(settings.database_url)
    ensure_schema(engine)
    session_factory = make_session_factory(engine)
    if settings.seed_on_start:
        with session_factory() as session:
            seed_database(session)

    def uow() -> UnitOfWork:
        return UnitOfWork(session_factory)

    def reset_database() -> None:
        drop_schema(engine)
        create_schema(engine)
        with session_factory() as session:
            seed_database(session)

    if routing is None:
        with uow() as work:
            graph = RoadGraph(work.roads.nodes(), work.roads.edges())
        routing = build_resilient_routing(settings, graph, clock)

    limiter = SlidingWindowLimiter(clock)
    roads_cache = RoadsCache(uow)
    bus.subscribe(RoadStatusChanged, roads_cache.on_event)
    bus.subscribe(SystemReset, roads_cache.on_event)
    rules = load_builtin_rules()
    connections = ConnectionManager()

    sos = SOSService(uow, bus, clock, settings, hazards)
    evacuation = EvacuationService(uow, routing, settings, clock)
    reroute = RerouteService(uow, bus, evacuation, settings, clock)
    alert_engine = AlertEngine(uow, bus, clock, settings, rules)
    decisions = AlertDecisionService(uow, bus, routing, settings, clock)
    roads = RoadService(uow, bus, clock)
    assembly = AssemblyService(uow, bus, clock)
    brigades = BrigadeService(uow, bus, clock, settings)
    simulation = SimulationService(uow, bus, clock, hazards, sos, assembly, roads, reset_database)
    scenarios = ScenarioRunner(simulation, bus, clock)

    # Bus subscriptions: the only coupling between the modules.
    RealtimeBridge(connections).attach(bus)
    alert_engine.attach(bus)
    reroute.attach(bus)
    NotificationDispatcher([LogNotifier()]).attach(bus)

    return Container(
        settings=settings, engine=engine, uow=uow, bus=bus, clock=clock, routing=routing,
        limiter=limiter, sos_guard=SosGuard(limiter, settings, clock),
        hazards=hazards, rules=rules, connections=connections, sos=sos, evacuation=evacuation,
        reroute=reroute, alert_engine=alert_engine, decisions=decisions, roads=roads,
        assembly=assembly, brigades=brigades, simulation=simulation, scenarios=scenarios,
        dashboard=DashboardService(uow, roads_cache), roads_cache=roads_cache,
    )
