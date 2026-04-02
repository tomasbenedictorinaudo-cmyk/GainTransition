"""
Verify the Python CCGS implementation produces correct results.
Uses the same example payload as the TypeScript version.
"""
from ccgs import (
    Channel, GainStage, AlgorithmParams, run_ccgs,
)
import math


def create_example_payload():
    """Replicate the TypeScript example payload (3 Rx, 2 Tx, 6 channels)."""
    channels = [
        Channel("1", "CH-1", rx_antenna_id=0, tx_antenna_id=0, bandwidth_mhz=4,
                rx_low_freq_mhz=10950, tx_low_freq_mhz=11700, ipfd=-120, eirp_target=45, antenna_noise_temp=275),
        Channel("2", "CH-2", rx_antenna_id=0, tx_antenna_id=1, bandwidth_mhz=4,
                rx_low_freq_mhz=10955, tx_low_freq_mhz=11710, ipfd=-118, eirp_target=47, antenna_noise_temp=275),
        Channel("3", "CH-3", rx_antenna_id=1, tx_antenna_id=0, bandwidth_mhz=3,
                rx_low_freq_mhz=10960, tx_low_freq_mhz=11705, ipfd=-122, eirp_target=43, antenna_noise_temp=280),
        Channel("4", "CH-4", rx_antenna_id=1, tx_antenna_id=1, bandwidth_mhz=4,
                rx_low_freq_mhz=10965, tx_low_freq_mhz=11715, ipfd=-119, eirp_target=46, antenna_noise_temp=280),
        Channel("5", "CH-5", rx_antenna_id=2, tx_antenna_id=0, bandwidth_mhz=4,
                rx_low_freq_mhz=10970, tx_low_freq_mhz=11720, ipfd=-121, eirp_target=44, antenna_noise_temp=270),
        Channel("6", "CH-6", rx_antenna_id=2, tx_antenna_id=1, bandwidth_mhz=4,
                rx_low_freq_mhz=10975, tx_low_freq_mhz=11725, ipfd=-117, eirp_target=48, antenna_noise_temp=270),
    ]

    # Default gain stage properties
    defaults = {
        "G1": {"current": 30, "gran": 0.5, "nf": 1.2, "lower": -30, "upper": -10},
        "G2": {"current": 10, "gran": 0.25, "nf": 6.0, "lower": -25, "upper": 0},
        "G3": {"current": 5, "gran": 0.25, "nf": 8.0, "lower": -20, "upper": 5},
        "G4": {"current": 5, "gran": 0.25, "nf": 0, "lower": -15, "upper": 10},
        "G5": {"current": 10, "gran": 0.25, "nf": 0, "lower": -10, "upper": 15},
        "G6": {"current": 10, "gran": 0.25, "nf": 0, "lower": 0, "upper": 25},
        "G7": {"current": 40, "gran": 0.5, "nf": 0, "lower": 40, "upper": 65},
    }

    # Build gain stages from channels
    stages: dict[str, GainStage] = {}
    for ch in channels:
        chain_keys = [
            f"G1:rx{ch.rx_antenna_id}",
            f"G2:rx{ch.rx_antenna_id}:sub{int(ch.rx_low_freq_mhz // 5)}",
            f"G3:ch{ch.id}",
            f"G4:ch{ch.id}",
            f"G5:ch{ch.id}",
            f"G6:tx{ch.tx_antenna_id}:sub{int(ch.tx_low_freq_mhz // 5)}",
            f"G7:tx{ch.tx_antenna_id}",
        ]
        for key in chain_keys:
            if key in stages:
                continue
            stype = key.split(":")[0]
            d = defaults[stype]
            stages[key] = GainStage(
                key=key,
                current_value=d["current"],
                target_value=d["current"],  # will be overridden by modifications
                step_granularity=d["gran"],
                upper_threshold=d["upper"],
                lower_threshold=d["lower"],
                noise_figure=d["nf"],
            )

    # Apply the same modifications as the TypeScript example
    modifications = {
        # G1 (Rx antennas)
        "G1:rx0": (30, 36),
        "G1:rx1": (30, 26),
        "G1:rx2": (30, 35),
        # G7 (Tx antennas)
        "G7:tx0": (40, 37),
        "G7:tx1": (40, 44),
        # G2 per subchannel
        "G2:rx0:sub2190": (10, 9.5),
        "G2:rx0:sub2191": (10, 8),
        "G2:rx1:sub2192": (10, 11),
        "G2:rx1:sub2193": (10, 10.5),
        "G2:rx2:sub2194": (10, 9.5),
        "G2:rx2:sub2195": (10, 8.5),
        # G3 per channel
        "G3:ch1": (5, 4),
        "G3:ch2": (5, 2),
        "G3:ch3": (5, 7),
        "G3:ch4": (5, 4.5),
        "G3:ch5": (5, 4.5),
        "G3:ch6": (5, 2.5),
        # G4 per channel
        "G4:ch1": (5, 4.5),
        "G4:ch2": (5, 3),
        "G4:ch3": (5, 6.5),
        "G4:ch4": (5, 5.5),
        "G4:ch5": (5, 5.25),
        "G4:ch6": (5, 3),
        # G5 per channel
        "G5:ch1": (10, 9.5),
        "G5:ch2": (10, 8.5),
        "G5:ch3": (10, 11.5),
        "G5:ch4": (10, 9.5),
        "G5:ch5": (10, 9.25),
        "G5:ch6": (10, 8),
        # G6 per subchannel
        "G6:tx0:sub2340": (10, 9.5),
        "G6:tx0:sub2341": (10, 11),
        "G6:tx0:sub2344": (10, 9.5),
        "G6:tx1:sub2342": (10, 8.5),
        "G6:tx1:sub2345": (10, 9),
    }

    for key, (current, target) in modifications.items():
        if key in stages:
            stages[key].current_value = current
            stages[key].target_value = target

    return channels, stages


def test_config(name: str, params: AlgorithmParams, expected_converge: bool = True):
    channels, stages = create_example_payload()
    result = run_ccgs(channels, stages, params)
    status = "OK" if (result.converged == expected_converge and result.error is None) == expected_converge else "FAIL"
    print(f"{status} | {name:40s} | steps={result.total_steps:3d} "
          f"| neg={result.max_negative_deviation:7.2f} | pos={result.max_positive_deviation:6.2f} "
          f"| conv={result.converged} | err={result.error or 'none'}")
    return result


if __name__ == "__main__":
    print("=" * 110)
    print("CCGS Python Implementation Verification")
    print("=" * 110)

    test_config("Standard, no limits",
                AlgorithmParams(strategy="greedy"))
    test_config("Standard, limits 0.5/1.0",
                AlgorithmParams(strategy="greedy", max_negative_eirp_deviation=0.5, max_positive_eirp_deviation=1.0))
    test_config("Inner-first, no limits",
                AlgorithmParams(strategy="inner-first"))
    test_config("G4-comp after, no limits",
                AlgorithmParams(strategy="g4-compensated", g4_compensation_mode="after"))
    test_config("G4-comp after, limits 0.5/1.0",
                AlgorithmParams(strategy="g4-compensated", g4_compensation_mode="after",
                                max_negative_eirp_deviation=0.5, max_positive_eirp_deviation=1.0))
    test_config("G4-comp before, no limits",
                AlgorithmParams(strategy="g4-compensated", g4_compensation_mode="before"))

    print("\nDone.")
