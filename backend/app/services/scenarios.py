"""Scripted demo scenarios, run as a background task.

A scenario is a list of steps; each step performs actions through the
`SimulationService` and returns a message code + parameters. The code lets
clients show the progress text in their own language; the Azerbaijani text in
`MESSAGES` is the default (used by the CLI and as a fallback).
To add a scenario: write a builder function and register it in `SCENARIOS`.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from ..domain.errors import Conflict, NotFound
from ..domain.events import ScenarioProgress
from ..domain.ports import Clock, EventBus
from ..domain.roles import CitizenRole
from .simulation import SimulationService

log = logging.getLogger(__name__)

MESSAGES: dict[str, str] = {
    "first_signals": "Zəlzələ! Yasamalda ilk 3 SOS siqnalı (həd: 4, hələ həyəcan yoxdur)",
    "roads_damaged": "Yollar zədələndi: {count} yol bağlandı, marşrutlar yenilənir",
    "cluster_alert": "Yasamalda SOS sayı 5-ə çatdı → QIRMIZI həyəcan (Qayda A: SOS klasteri)",
    "priority_sos": "Prioritet SOS (№1): hərəkət məhdudiyyətli vətəndaş Yasamalda yardım çağırır",
    "point_filling": "«{point}» sürətlə dolur: 80%",
    "point_reroute": "«{point}» 91% → vətəndaşlar başqa nöqtəyə yönləndirilir",
    "point_critical": "«{point}» 96% → QIRMIZI həyəcan (Qayda B: həddən artıq dolma)",
    "border_cluster": "Nəsimi–Nərimanov sərhədində 500 m radiusda 4 SOS → QIRMIZI həyəcan (Qayda A)",
    "roads_restored": "Yollar bərpa olundu: {count} yol yenidən açıldı",
    "done": "Ssenari başa çatdı",
    "stopped": "Ssenari dayandırıldı",
    "failed": "Ssenari xəta ilə dayandı",
}


@dataclass
class StepResult:
    code: str
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def message(self) -> str:
        return MESSAGES.get(self.code, self.code).format(**self.params)


StepAction = Callable[[SimulationService, dict[str, Any]], Awaitable[StepResult]]


@dataclass
class ScenarioStep:
    action: StepAction
    pause_s: float  # wait after the step (scaled by the run speed)


@dataclass
class Scenario:
    name: str
    title: str
    steps: list[ScenarioStep]


def earthquake_scenario() -> Scenario:
    """"Zəlzələ ssenarisi": every feature in about two minutes."""

    async def first_signals(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        await sim.random_sos("yasamal", 3, "collapse")
        return StepResult("first_signals")

    async def roads_damaged(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        closed = await sim.close_demo_roads(3)
        return StepResult("roads_damaged", {"count": len(closed)})

    async def cluster_alert(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        await sim.random_sos("yasamal", 1, "collapse")
        await sim.random_sos("yasamal", 1, "fire")
        return StepResult("cluster_alert")

    async def priority_sos(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        await sim.random_sos("yasamal", 1, "medical", role=CitizenRole.MOBILITY_IMPAIRED)
        return StepResult("priority_sos")

    async def point_filling(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        point = sim.pick_demo_point("yasamal")
        state["point_id"], state["point_name"] = point.id, point.name
        await sim.step_occupancy(point.id, occupancy_pct=80)
        return StepResult("point_filling", {"point": point.name})

    async def point_reroute(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        await sim.step_occupancy(state["point_id"], occupancy_pct=91)
        return StepResult("point_reroute", {"point": state["point_name"]})

    async def point_critical(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        await sim.step_occupancy(state["point_id"], occupancy_pct=96)
        return StepResult("point_critical", {"point": state["point_name"]})

    async def border_cluster(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        await sim.cross_zone_cluster("nesimi", "nerimanov", 4, "fire")
        return StepResult("border_cluster")

    async def roads_restored(sim: SimulationService, state: dict[str, Any]) -> StepResult:
        opened = await sim.open_all_roads()
        return StepResult("roads_restored", {"count": len(opened)})

    return Scenario(
        name="earthquake",
        title="Zəlzələ ssenarisi",
        steps=[
            ScenarioStep(first_signals, 10),
            ScenarioStep(roads_damaged, 12),
            ScenarioStep(cluster_alert, 18),
            ScenarioStep(priority_sos, 8),
            ScenarioStep(point_filling, 6),
            ScenarioStep(point_reroute, 14),
            ScenarioStep(point_critical, 18),
            ScenarioStep(border_cluster, 18),
            ScenarioStep(roads_restored, 6),
        ],
    )


SCENARIOS: dict[str, Callable[[], Scenario]] = {"earthquake": earthquake_scenario}


class ScenarioRunner:
    RESET_PAUSE_S = 3.0  # lets clients reload state before the first step

    def __init__(self, sim: SimulationService, bus: EventBus, clock: Clock) -> None:
        self._sim, self._bus, self._clock = sim, bus, clock
        self._task: asyncio.Task[None] | None = None
        self._status: dict[str, Any] = {"running": False, "scenario": None, "step": 0,
                                        "total": 0, "message": "", "code": "", "params": {}}

    def status(self) -> dict[str, Any]:
        return dict(self._status)

    def available(self) -> list[dict[str, str]]:
        return [{"name": s.name, "title": s.title} for s in (build() for build in SCENARIOS.values())]

    async def start(self, name: str, speed: float = 1.0, reset: bool = True,
                    wait: bool = False) -> dict[str, Any]:
        if name not in SCENARIOS:
            raise NotFound(f"Ssenari tapılmadı: {name}")
        if self._task and not self._task.done():
            raise Conflict("Ssenari artıq icra olunur", "scenario_running")
        scenario = SCENARIOS[name]()
        self._status = {"running": True, "scenario": name, "step": 0, "total": len(scenario.steps),
                        "message": scenario.title, "code": "", "params": {}}
        self._task = asyncio.create_task(self._run(scenario, speed, reset))
        if wait:
            await self._task
        return self.status()

    async def stop(self) -> dict[str, Any]:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        return self.status()

    async def _run(self, scenario: Scenario, speed: float, reset: bool) -> None:
        async def pause(seconds: float) -> None:
            if speed > 0:
                await asyncio.sleep(seconds / speed)

        state: dict[str, Any] = {}
        total = len(scenario.steps)
        try:
            if reset:
                await self._sim.reset()
                await pause(self.RESET_PAUSE_S)
            for number, step in enumerate(scenario.steps, start=1):
                result = await step.action(self._sim, state)
                await self._progress(scenario, number, result, running=True)
                await pause(step.pause_s)
            await self._progress(scenario, total, StepResult("done"), running=False)
        except asyncio.CancelledError:
            await self._progress(scenario, self._status["step"], StepResult("stopped"),
                                 running=False)
            raise
        except Exception:  # noqa: BLE001 - report failure instead of dying silently
            log.exception("Scenario '%s' failed", scenario.name)
            await self._progress(scenario, self._status["step"], StepResult("failed"),
                                 running=False)

    async def _progress(self, scenario: Scenario, step: int, result: StepResult,
                        running: bool) -> None:
        self._status = {"running": running, "scenario": scenario.name, "step": step,
                        "total": len(scenario.steps), "message": result.message,
                        "code": result.code, "params": result.params}
        await self._bus.publish(
            ScenarioProgress(scenario=scenario.name, step=step, total=len(scenario.steps),
                             message=result.message, running=running, code=result.code,
                             params=result.params, occurred_at=self._clock.now())
        )
