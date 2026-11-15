"""Demo simulator endpoints (admin role + SIM_ENABLED)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from .. import schemas as s
from ..deps import ContainerDep, require_simulation, require_simulator

router = APIRouter(
    prefix="/sim", tags=["simulation"],
    dependencies=[Depends(require_simulator), Depends(require_simulation)],
)


@router.post("/roads/{edge_id}/close", response_model=s.RoadEdgeOut, summary="Yolu bağla")
async def close_road(edge_id: str, c: ContainerDep) -> Any:
    return await c.roads.set_open(edge_id, False)


@router.post("/roads/{edge_id}/open", response_model=s.RoadEdgeOut, summary="Yolu aç")
async def open_road(edge_id: str, c: ContainerDep) -> Any:
    return await c.roads.set_open(edge_id, True)


@router.post("/roads/random", response_model=list[s.RoadEdgeOut],
             summary="Təsadüfi yolları bağla/aç")
async def random_roads(body: s.SimRoadsIn, c: ContainerDep) -> Any:
    return await c.simulation.random_roads(body.action, body.count)


@router.post("/roads/open-all", response_model=list[s.RoadEdgeOut], summary="Bütün yolları aç")
async def open_all_roads(c: ContainerDep) -> Any:
    return await c.simulation.open_all_roads()


@router.post("/sos", response_model=list[s.SOSOut], summary="Zonada təsadüfi SOS siqnalları")
async def random_sos(body: s.SimSOSIn, c: ContainerDep) -> Any:
    return await c.simulation.random_sos(body.zone_id, body.count, body.hazard_type,
                                         role=body.role)


@router.post("/assembly-points/{point_id}/occupancy", response_model=s.AssemblyPointOut,
             summary="Toplanış nöqtəsinin doluluğunu dəyiş")
async def step_occupancy(point_id: int, body: s.SimOccupancyIn, c: ContainerDep) -> Any:
    return await c.simulation.step_occupancy(point_id, body.delta_pct, body.occupancy_pct)


@router.get("/scenarios", summary="Mövcud ssenarilər")
async def scenarios(c: ContainerDep) -> list[dict[str, str]]:
    return c.scenarios.available()


@router.post("/scenario/{name}", response_model=s.ScenarioStatusOut, status_code=202,
             summary="Ssenarini başlat (məs. earthquake)")
async def start_scenario(name: str, c: ContainerDep, body: s.ScenarioStartIn | None = None) -> Any:
    options = body or s.ScenarioStartIn()
    return await c.scenarios.start(name, options.speed, options.reset)


@router.get("/scenario", response_model=s.ScenarioStatusOut, summary="Ssenarinin vəziyyəti")
async def scenario_status(c: ContainerDep) -> Any:
    return c.scenarios.status()


@router.delete("/scenario", response_model=s.ScenarioStatusOut, summary="Ssenarini dayandır")
async def stop_scenario(c: ContainerDep) -> Any:
    return await c.scenarios.stop()


@router.post("/reset", status_code=204, summary="Bütün məlumatı ilkin vəziyyətə qaytar")
async def reset(c: ContainerDep) -> None:
    await c.scenarios.stop()
    await c.simulation.reset()
