"""Simplified geopolitical dynamics model for AGI/compute concentration.

This script models three blocs and shows how a compute-monopoly shock can widen
economic and military gaps through nonlinear feedback loops.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

# Modeled year when the leading bloc secures a durable AGI advantage.
MONOPOLY_SHOCK_YEAR = 5
# Strong but not absolute monopoly coefficient for the AGI-leading bloc.
MONOPOLY_ACCESS_LEVEL = 0.8
# Baseline geopolitical tension floor.
GLOBAL_PRESSURE_BASE = 1.0
# Penalty multiplier that maps average military buildup to compute friction.
GLOBAL_PRESSURE_MILITARY_MULTIPLIER = 0.08


@dataclass
class Bloc:
    """State container for each geopolitical bloc."""

    name: str
    intelligence: float
    compute: float
    economy: float
    military: float
    institutions: float
    energy_security: float
    monopoly_access: float = 0.0


def clamp(value: float, floor: float = 0.0) -> float:
    """Keep state variables non-negative."""

    return max(floor, value)


def step_bloc(bloc: Bloc, global_pressure: float, params: dict[str, float], dt: float = 1.0) -> None:
    """Advance one bloc by one Euler step.

    This function mutates the provided ``bloc`` in place instead of returning
    a copied next state.

    Parameters are tuned for qualitative behavior only:
    - rsi_gain / rsi_exponent: strength of recursive self-improvement
    - inference_gain: diminishing-return gains from more compute
    - system_gain: institutional and energy support for scaling
    - saturation: soft ceiling that prevents runaway divergence
    - resource_trap: penalty when a bloc has weak infrastructure security
    """

    rsi_term = params["rsi_gain"] * (bloc.intelligence ** params["rsi_exponent"]) * (1.0 + bloc.monopoly_access)
    inference_term = params["inference_gain"] * math.log1p(bloc.compute)
    system_term = params["system_gain"] * bloc.institutions * bloc.energy_security
    saturation = params["saturation"] * (bloc.intelligence ** 2)

    d_intelligence = (rsi_term + inference_term + system_term - saturation) * dt
    d_compute = (
        params["compute_from_economy"] * bloc.economy
        + params["compute_from_intelligence"] * bloc.intelligence
        + params["compute_from_monopoly"] * bloc.monopoly_access
        - params["compute_decay"] * global_pressure * bloc.compute
    ) * dt
    d_economy = (
        params["economy_gain"] * bloc.intelligence * math.sqrt(bloc.compute + 1.0)
        - params["resource_trap"] * (1.0 - bloc.energy_security) * bloc.economy
    ) * dt
    d_military = (
        params["military_gain"] * bloc.intelligence
        + 0.5 * params["military_gain"] * bloc.economy
        - params["military_decay"] * bloc.military
    ) * dt

    bloc.intelligence = clamp(bloc.intelligence + d_intelligence)
    bloc.compute = clamp(bloc.compute + d_compute)
    bloc.economy = clamp(bloc.economy + d_economy)
    bloc.military = clamp(bloc.military + d_military)


def simulate(years: int = 25) -> list[dict[str, float]]:
    """Run the scenario and return a compact history table.

    Each row includes:
    - year
    - leader_intelligence
    - rival_intelligence
    - leader_gap
    - compute_gap
    - military_gap
    """

    params = {
        "rsi_gain": 0.014,
        "rsi_exponent": 1.18,
        "inference_gain": 0.24,
        "system_gain": 0.16,
        "saturation": 0.0018,
        "compute_from_economy": 0.021,
        "compute_from_intelligence": 0.09,
        "compute_from_monopoly": 0.45,
        "compute_decay": 0.012,
        "economy_gain": 0.028,
        "resource_trap": 0.02,
        "military_gain": 0.035,
        "military_decay": 0.014,
    }

    blocs = [
        Bloc("Leader", intelligence=9.0, compute=10.0, economy=8.0, military=7.0, institutions=0.88, energy_security=0.90),
        Bloc("Rival", intelligence=7.5, compute=8.0, economy=7.8, military=7.4, institutions=0.80, energy_security=0.78),
        Bloc("Followers", intelligence=4.5, compute=3.8, economy=4.2, military=3.7, institutions=0.62, energy_security=0.70),
    ]

    history: list[dict[str, float]] = []
    for year in range(years):
        if year >= MONOPOLY_SHOCK_YEAR:
            blocs[0].monopoly_access = MONOPOLY_ACCESS_LEVEL

        # Global military tension rises with average military strength and slightly
        # reduces the efficiency of compute scaling through sanctions and rivalry.
        global_pressure = GLOBAL_PRESSURE_BASE + GLOBAL_PRESSURE_MILITARY_MULTIPLIER * sum(bloc.military for bloc in blocs) / len(blocs)
        for bloc in blocs:
            step_bloc(bloc, global_pressure, params)

        history.append(
            {
                "year": float(year),
                "leader_intelligence": blocs[0].intelligence,
                "rival_intelligence": blocs[1].intelligence,
                "leader_gap": blocs[0].intelligence - blocs[1].intelligence,
                "compute_gap": blocs[0].compute - blocs[2].compute,
                "military_gap": blocs[0].military - blocs[2].military,
            }
        )

    return history


def main() -> None:
    """Print a small table suitable for manual verification."""

    history = simulate()
    print("year | leader_intelligence | rival_intelligence | leader_gap | compute_gap | military_gap")
    for row in history:
        print(
            f"{int(row['year']):>4} | "
            f"{row['leader_intelligence']:>19.3f} | "
            f"{row['rival_intelligence']:>18.3f} | "
            f"{row['leader_gap']:>10.3f} | "
            f"{row['compute_gap']:>11.3f} | "
            f"{row['military_gap']:>12.3f}"
        )


if __name__ == "__main__":
    main()
