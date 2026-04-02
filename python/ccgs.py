"""
Constrained Coordinated Gain Stepping (CCGS) Algorithm
=======================================================
Standalone Python implementation of the satellite payload gain transition
optimizer. Supports three strategies:
  - greedy / inner-first: standard single-loop iteration
  - g4-compensated: two-phase with G4 as a compensation lever

Usage:
  from ccgs import run_ccgs, Channel, GainStage, AlgorithmParams
  result = run_ccgs(channels, gain_stages, params)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

# ─────────────────────────────────────────────────────────────────────
# Data model
# ─────────────────────────────────────────────────────────────────────

@dataclass
class Channel:
    id: str
    name: str
    rx_antenna_id: int
    tx_antenna_id: int
    bandwidth_mhz: float
    rx_low_freq_mhz: float
    tx_low_freq_mhz: float
    ipfd: float             # dBm/m^2
    eirp_target: float      # dBm
    antenna_noise_temp: float = 275.0  # K

@dataclass
class GainStage:
    key: str
    current_value: float    # dB
    target_value: float     # dB
    step_granularity: float # dB
    upper_threshold: float  # dBm
    lower_threshold: float  # dBm
    noise_figure: float     # dB

@dataclass
class AlgorithmParams:
    max_negative_eirp_deviation: Optional[float] = None
    max_positive_eirp_deviation: Optional[float] = None
    max_iterations: int = 5000
    strategy: str = "greedy"             # greedy | inner-first | g4-compensated
    g4_compensation_mode: str = "after"  # after | before

@dataclass
class AtomicStep:
    gain_stage_key: str
    delta: float

@dataclass
class CandidateMove:
    steps: list[AtomicStep]
    stage_type: str

@dataclass
class TransitionStep:
    step_index: int
    applied_move: CandidateMove
    gain_values: dict[str, float]
    channel_eirp: dict[str, float]
    channel_eirp_deviation: dict[str, float]
    power_levels: dict[str, float]
    system_temp: dict[str, float]

@dataclass
class TransitionResult:
    steps: list[TransitionStep]
    initial_eirp: dict[str, float]
    final_eirp: dict[str, float]
    initial_gain_values: dict[str, float]
    target_gain_values: dict[str, float]
    initial_system_temp: dict[str, float]
    max_negative_deviation: float
    max_positive_deviation: float
    total_steps: int
    threshold_violations: int
    converged: bool
    error: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────
# Gain chain helpers
# ─────────────────────────────────────────────────────────────────────

ANALOG_STAGES = {"G1", "G7"}
INNER_STAGES = {"G3", "G4", "G5"}
SHARED_STAGES = {"G1", "G2", "G6", "G7"}

def _stage_type(key: str) -> str:
    return key.split(":")[0]

def _get_channel_gain_chain(ch: Channel) -> list[str]:
    """Return the ordered [G1, G2, G3, G4, G5, G6, G7] keys for a channel."""
    rx_sub = int(ch.rx_low_freq_mhz // 5)
    tx_sub = int(ch.tx_low_freq_mhz // 5)
    return [
        f"G1:rx{ch.rx_antenna_id}",
        f"G2:rx{ch.rx_antenna_id}:sub{rx_sub}",
        f"G3:ch{ch.id}",
        f"G4:ch{ch.id}",
        f"G5:ch{ch.id}",
        f"G6:tx{ch.tx_antenna_id}:sub{tx_sub}",
        f"G7:tx{ch.tx_antenna_id}",
    ]

# ─────────────────────────────────────────────────────────────────────
# EIRP computation
# ─────────────────────────────────────────────────────────────────────

def compute_channel_eirp(ch: Channel, gain_values: dict[str, float]) -> float:
    """EIRP = P_in + sum of 7 gains in the chain."""
    p_in = ch.ipfd + 10.0 * math.log10(ch.bandwidth_mhz * 1e6)
    eirp = p_in
    for key in _get_channel_gain_chain(ch):
        eirp += gain_values.get(key, 0.0)
    return eirp

def compute_all_eirp(channels: list[Channel], gv: dict[str, float]) -> dict[str, float]:
    return {ch.id: compute_channel_eirp(ch, gv) for ch in channels}

# ─────────────────────────────────────────────────────────────────────
# Power level cascade
# ─────────────────────────────────────────────────────────────────────

def _dbm_to_linear(dbm: float) -> float:
    return 10.0 ** (dbm / 10.0)

def _linear_to_dbm(mw: float) -> float:
    return 10.0 * math.log10(mw) if mw > 0 else -math.inf

def compute_all_power_levels(channels: list[Channel], gv: dict[str, float]) -> dict[str, float]:
    """Compute output power at every gain stage. Shared stages aggregate in linear domain."""
    power: dict[str, float] = {}
    shared_linear: dict[str, float] = {}

    for ch in channels:
        chain = _get_channel_gain_chain(ch)
        p_in = ch.ipfd + 10.0 * math.log10(ch.bandwidth_mhz * 1e6)
        cumulative = p_in
        for key in chain:
            cumulative += gv.get(key, 0.0)
            stype = _stage_type(key)
            if stype in SHARED_STAGES:
                shared_linear[key] = shared_linear.get(key, 0.0) + _dbm_to_linear(cumulative)
            else:
                power[key] = cumulative

    for key, lin in shared_linear.items():
        power[key] = _linear_to_dbm(lin)
    return power

# ─────────────────────────────────────────────────────────────────────
# System noise temperature (Friis cascade on G1, G2, G3)
# ─────────────────────────────────────────────────────────────────────

T0 = 290.0  # reference temperature (K)

def compute_all_system_temp(
    channels: list[Channel],
    gv: dict[str, float],
    stages: dict[str, GainStage],
) -> dict[str, float]:
    result: dict[str, float] = {}
    for ch in channels:
        chain = _get_channel_gain_chain(ch)
        rx_keys = [k for k in chain if _stage_type(k) in ("G1", "G2", "G3")]
        t_sys = ch.antenna_noise_temp
        cum_gain_lin = 1.0
        for key in rx_keys:
            stage = stages.get(key)
            if not stage:
                continue
            nf_lin = 10.0 ** (stage.noise_figure / 10.0)
            stage_temp = T0 * (nf_lin - 1.0)
            gain_lin = 10.0 ** (gv.get(key, 0.0) / 10.0)
            t_sys += stage_temp / cum_gain_lin
            cum_gain_lin *= gain_lin
        result[ch.id] = t_sys
    return result

# ─────────────────────────────────────────────────────────────────────
# Candidate generation
# ─────────────────────────────────────────────────────────────────────

def _generate_candidates(
    gv: dict[str, float],
    tv: dict[str, float],
    gran: dict[str, float],
    exclude_types: Optional[set[str]] = None,
    only_type: Optional[str] = None,
) -> list[CandidateMove]:
    """Generate candidate moves respecting stage-type constraints."""
    exclude = exclude_types or set()
    pending: dict[str, list[tuple[str, int, float, int]]] = {}  # type -> [(key, maxSteps, gran, dir)]

    for key in sorted(tv):
        remaining = tv[key] - gv[key]
        g = gran[key]
        if abs(remaining) < g * 0.01:
            continue
        stype = _stage_type(key)
        if stype in exclude:
            continue
        if only_type and stype != only_type:
            continue
        direction = 1 if remaining > 0 else -1
        max_steps = round(abs(remaining) / g)
        pending.setdefault(stype, []).append((key, max_steps, g, direction))

    moves: list[CandidateMove] = []
    for stype, items in pending.items():
        if stype in ANALOG_STAGES:
            for key, max_steps, g, direction in items:
                for n in range(1, max_steps + 1):
                    moves.append(CandidateMove(
                        steps=[AtomicStep(key, direction * n * g)],
                        stage_type=stype,
                    ))
        else:
            max_mult = max(ms for _, ms, _, _ in items)
            for n in range(1, max_mult + 1):
                steps = []
                for key, max_steps, g, direction in items:
                    actual_n = min(n, max_steps)
                    steps.append(AtomicStep(key, direction * actual_n * g))
                moves.append(CandidateMove(steps=steps, stage_type=stype))
    return moves

# ─────────────────────────────────────────────────────────────────────
# Feasibility checks
# ─────────────────────────────────────────────────────────────────────

def _apply_temp(gv: dict[str, float], steps: list[AtomicStep]) -> dict[str, float]:
    """Apply steps to a copy of gain values (non-mutating)."""
    temp = dict(gv)
    for s in steps:
        temp[s.gain_stage_key] = temp.get(s.gain_stage_key, 0.0) + s.delta
    return temp

def _check_power_feasibility(
    move: CandidateMove,
    gv: dict[str, float],
    channels: list[Channel],
    stages: dict[str, GainStage],
    relax: float = 0.0,
) -> bool:
    temp = _apply_temp(gv, move.steps)
    power = compute_all_power_levels(channels, temp)
    for key, p in power.items():
        stage = stages.get(key)
        if not stage:
            continue
        if p > stage.upper_threshold + relax + 0.001:
            return False
        if p < stage.lower_threshold - relax - 0.001:
            return False
    return True

def _check_eirp_limits(
    eirp: dict[str, float],
    initial_eirp: dict[str, float],
    channels: list[Channel],
    neg_limit: Optional[float],
    pos_limit: Optional[float],
) -> bool:
    for ch in channels:
        dev = eirp[ch.id] - initial_eirp[ch.id]
        if neg_limit is not None and dev < -(neg_limit + 0.001):
            return False
        if pos_limit is not None and dev > pos_limit + 0.001:
            return False
    return True

# ─────────────────────────────────────────────────────────────────────
# G4 correction
# ─────────────────────────────────────────────────────────────────────

def _build_g4_steps(
    ref_eirp: dict[str, float],
    actual_eirp: dict[str, float],
    channels: list[Channel],
    gran: dict[str, float],
) -> Optional[CandidateMove]:
    """Convert EIRP deviation into quantized G4 correction steps."""
    g4_steps: list[AtomicStep] = []
    for ch in channels:
        dev = actual_eirp[ch.id] - ref_eirp[ch.id]
        if abs(dev) < 0.001:
            continue
        g4_key = f"G4:ch{ch.id}"
        g4_gran = gran.get(g4_key)
        if not g4_gran:
            continue
        num = round(-dev / g4_gran)
        if num == 0:
            continue
        g4_steps.append(AtomicStep(g4_key, num * g4_gran))
    return CandidateMove(steps=g4_steps, stage_type="G4") if g4_steps else None

# ─────────────────────────────────────────────────────────────────────
# Selection
# ─────────────────────────────────────────────────────────────────────

def _total_progress(move: CandidateMove) -> float:
    return sum(abs(s.delta) for s in move.steps)

def _pick_best(feasible: list[CandidateMove]) -> CandidateMove:
    """Select the candidate with most progress, inner-stage preference as tiebreaker."""
    def sort_key(m: CandidateMove):
        # Negative progress for descending sort, then prefer inner, then fewer steps,
        # then stage type and first key for deterministic ordering
        first_key = m.steps[0].gain_stage_key if m.steps else ""
        return (-_total_progress(m), 0 if m.stage_type in INNER_STAGES else 1, len(m.steps), m.stage_type, first_key)
    return min(feasible, key=sort_key)

# ─────────────────────────────────────────────────────────────────────
# EIRP filtering
# ─────────────────────────────────────────────────────────────────────

def _filter_eirp(
    candidates: list[CandidateMove],
    gv: dict[str, float],
    channels: list[Channel],
    initial_eirp: dict[str, float],
    params: AlgorithmParams,
) -> list[CandidateMove]:
    neg, pos = params.max_negative_eirp_deviation, params.max_positive_eirp_deviation
    return [m for m in candidates if _check_eirp_limits(
        compute_all_eirp(channels, _apply_temp(gv, m.steps)), initial_eirp, channels, neg, pos)]

def _filter_eirp_with_g4(
    candidates: list[CandidateMove],
    gv: dict[str, float],
    channels: list[Channel],
    initial_eirp: dict[str, float],
    params: AlgorithmParams,
    gran: dict[str, float],
) -> list[CandidateMove]:
    neg, pos = params.max_negative_eirp_deviation, params.max_positive_eirp_deviation
    result = []
    for move in candidates:
        if params.g4_compensation_mode == "before":
            after_primary = _apply_temp(gv, move.steps)
            g4 = _build_g4_steps(
                compute_all_eirp(channels, gv),
                compute_all_eirp(channels, after_primary),
                channels, gran)
            state1 = _apply_temp(gv, g4.steps) if g4 else dict(gv)
            if not _check_eirp_limits(compute_all_eirp(channels, state1), initial_eirp, channels, neg, pos):
                continue
            state2 = _apply_temp(state1, move.steps)
            if not _check_eirp_limits(compute_all_eirp(channels, state2), initial_eirp, channels, neg, pos):
                continue
        else:
            state1 = _apply_temp(gv, move.steps)
            eirp1 = compute_all_eirp(channels, state1)
            if not _check_eirp_limits(eirp1, initial_eirp, channels, neg, pos):
                continue
            g4 = _build_g4_steps(initial_eirp, eirp1, channels, gran)
            state2 = _apply_temp(state1, g4.steps) if g4 else state1
            if not _check_eirp_limits(compute_all_eirp(channels, state2), initial_eirp, channels, neg, pos):
                continue
        result.append(move)
    return result

# ─────────────────────────────────────────────────────────────────────
# Main algorithm
# ─────────────────────────────────────────────────────────────────────

@dataclass
class _RunContext:
    channels: list[Channel]
    stages: dict[str, GainStage]
    params: AlgorithmParams
    gv: dict[str, float]
    tv: dict[str, float]
    gran: dict[str, float]
    initial_eirp: dict[str, float]
    initial_system_temp: dict[str, float]
    initial_gv: dict[str, float]
    steps: list[TransitionStep] = field(default_factory=list)
    max_neg_dev: float = 0.0
    max_pos_dev: float = 0.0
    violations: int = 0

def run_ccgs(
    channels: list[Channel],
    gain_stages: dict[str, GainStage],
    params: Optional[AlgorithmParams] = None,
) -> TransitionResult:
    """Entry point. Run the CCGS algorithm and return the full transition result."""
    if params is None:
        params = AlgorithmParams()

    gv = {k: s.current_value for k, s in gain_stages.items()}
    tv = {k: s.target_value for k, s in gain_stages.items()}
    gran = {k: s.step_granularity for k, s in gain_stages.items()}
    initial_eirp = compute_all_eirp(channels, gv)
    initial_system_temp = compute_all_system_temp(channels, gv, gain_stages)

    ctx = _RunContext(
        channels=channels, stages=gain_stages, params=params,
        gv=gv, tv=tv, gran=gran,
        initial_eirp=initial_eirp, initial_system_temp=initial_system_temp,
        initial_gv=dict(gv),
    )

    if params.strategy == "g4-compensated":
        err = _run_loop(ctx, exclude_types={"G4"}, g4_compensate=True)
        if err:
            return err
        err = _run_loop(ctx, only_type="G4")
        if err:
            return err
    else:
        err = _run_loop(ctx)
        if err:
            return err

    return _build_result(ctx)


def _run_loop(
    ctx: _RunContext,
    exclude_types: Optional[set[str]] = None,
    only_type: Optional[str] = None,
    g4_compensate: bool = False,
) -> Optional[TransitionResult]:
    """Unified iteration loop. Returns error TransitionResult or None on success."""
    params = ctx.params
    has_eirp_limits = (params.max_negative_eirp_deviation is not None
                       or params.max_positive_eirp_deviation is not None)

    for _ in range(params.max_iterations):
        # Check convergence for relevant stages
        if _is_converged(ctx.gv, ctx.tv, ctx.gran, exclude_types, only_type):
            break

        # Generate candidates
        candidates = _generate_candidates(ctx.gv, ctx.tv, ctx.gran, exclude_types, only_type)
        if not candidates:
            break

        # Power threshold filter
        feasible = [m for m in candidates if _check_power_feasibility(m, ctx.gv, ctx.channels, ctx.stages)]
        if not feasible:
            feasible = [m for m in candidates if _check_power_feasibility(m, ctx.gv, ctx.channels, ctx.stages, relax=1.0)]
            if not feasible:
                break
            ctx.violations += 1

        # EIRP deviation filter
        if has_eirp_limits:
            if g4_compensate:
                eirp_ok = _filter_eirp_with_g4(feasible, ctx.gv, ctx.channels, ctx.initial_eirp, params, ctx.gran)
            else:
                eirp_ok = _filter_eirp(feasible, ctx.gv, ctx.channels, ctx.initial_eirp, params)

            if not eirp_ok:
                msg = _build_eirp_error_msg(feasible, ctx.gv, ctx.channels, ctx.initial_eirp, params)
                return _build_result(ctx, error=msg)
            feasible = eirp_ok

        best = _pick_best(feasible)

        # Apply with optional G4 compensation
        if g4_compensate:
            if params.g4_compensation_mode == "before":
                after_primary = _apply_temp(ctx.gv, best.steps)
                g4 = _build_g4_steps(
                    compute_all_eirp(ctx.channels, ctx.gv),
                    compute_all_eirp(ctx.channels, after_primary),
                    ctx.channels, ctx.gran)
                if g4:
                    _apply_and_record(ctx, g4)
                _apply_and_record(ctx, best)
            else:
                _apply_and_record(ctx, best)
                g4 = _build_g4_steps(
                    ctx.initial_eirp,
                    compute_all_eirp(ctx.channels, ctx.gv),
                    ctx.channels, ctx.gran)
                if g4:
                    _apply_and_record(ctx, g4)
        else:
            _apply_and_record(ctx, best)

    return None


def _is_converged(
    gv: dict[str, float],
    tv: dict[str, float],
    gran: dict[str, float],
    exclude_types: Optional[set[str]] = None,
    only_type: Optional[str] = None,
) -> bool:
    exclude = exclude_types or set()
    for key in sorted(tv):
        stype = _stage_type(key)
        if stype in exclude:
            continue
        if only_type and stype != only_type:
            continue
        if abs(gv[key] - tv[key]) >= gran[key] * 0.01:
            return False
    return True


def _apply_and_record(ctx: _RunContext, move: CandidateMove) -> None:
    """Apply move in-place and record the transition step."""
    for s in move.steps:
        ctx.gv[s.gain_stage_key] = ctx.gv.get(s.gain_stage_key, 0.0) + s.delta

    eirp = compute_all_eirp(ctx.channels, ctx.gv)
    devs = {ch.id: eirp[ch.id] - ctx.initial_eirp[ch.id] for ch in ctx.channels}
    power = compute_all_power_levels(ctx.channels, ctx.gv)
    sys_temp = compute_all_system_temp(ctx.channels, ctx.gv, ctx.stages)

    ctx.steps.append(TransitionStep(
        step_index=len(ctx.steps),
        applied_move=move,
        gain_values=dict(ctx.gv),
        channel_eirp=eirp,
        channel_eirp_deviation=devs,
        power_levels=power,
        system_temp=sys_temp,
    ))

    for dev in devs.values():
        if dev < ctx.max_neg_dev:
            ctx.max_neg_dev = dev
        if dev > ctx.max_pos_dev:
            ctx.max_pos_dev = dev


def _build_result(ctx: _RunContext, error: Optional[str] = None) -> TransitionResult:
    all_done = all(
        abs(ctx.gv[k] - ctx.tv[k]) < ctx.gran[k] * 0.01 for k in ctx.tv
    )
    return TransitionResult(
        steps=ctx.steps,
        initial_eirp=ctx.initial_eirp,
        final_eirp=compute_all_eirp(ctx.channels, ctx.gv),
        initial_gain_values=ctx.initial_gv,
        target_gain_values=dict(ctx.tv),
        initial_system_temp=ctx.initial_system_temp,
        max_negative_deviation=ctx.max_neg_dev,
        max_positive_deviation=ctx.max_pos_dev,
        total_steps=len(ctx.steps),
        threshold_violations=ctx.violations,
        converged=False if error else all_done,
        error=error,
    )


def _build_eirp_error_msg(
    power_feasible: list[CandidateMove],
    gv: dict[str, float],
    channels: list[Channel],
    initial_eirp: dict[str, float],
    params: AlgorithmParams,
) -> str:
    best_worst = math.inf
    for move in power_feasible:
        temp = _apply_temp(gv, move.steps)
        eirp = compute_all_eirp(channels, temp)
        worst = max(abs(eirp[ch.id] - initial_eirp[ch.id]) for ch in channels)
        if worst < best_worst:
            best_worst = worst

    parts = []
    if params.max_negative_eirp_deviation is not None:
        parts.append(f"-{params.max_negative_eirp_deviation:.2f}")
    if params.max_positive_eirp_deviation is not None:
        parts.append(f"+{params.max_positive_eirp_deviation:.2f}")
    limit_str = " / ".join(parts)
    return (
        f"EIRP deviation limits ({limit_str} dB) are infeasible. "
        f"Smallest achievable worst-case deviation: +/-{best_worst:.2f} dB. "
        f"Widen limits or adjust gain granularities."
    )
