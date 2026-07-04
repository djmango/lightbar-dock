#!/usr/bin/env python3
"""
Export a Specctra DSN of the board with net classes applied,
for consumption by an external autorouter (Topola, Freerouting, ...).

Run with KiCad's bundled Python:

    /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 export_dsn.py
"""

import sys
from pathlib import Path

import pcbnew

ROOT = Path(__file__).parent
PCB = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "layouts/default/default.kicad_pcb"
DSN = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "layouts/default/default.dsn"

GND = "lv"
POWER_NETS = [
    "anode",                        # 12V rail after OR diodes
    "A",                            # barrel jack -> OR diode
    "vdd_cap-power-anode",          # PD VBUS -> OR diode
    "ports[3]-power_in-anode",      # 5V rail, buck A -> ports 0-3
    "ports[7]-power_in-anode",      # 5V rail, buck B -> ports 4-7
    "bootstrap_capacitor-power-lv",     # buck A switch node
    "bootstrap_capacitor-power-lv-1",   # buck B switch node
]
VBUS_NETS = [
    "port_cap-power-hv", "port_cap-power-hv-1", "port_cap-power-hv-2",
    "port_cap-power-hv-3", "port_cap-power-hv-4", "port_cap-power-hv-5",
    "port_cap-power-hv-6", "hv",
    "ports[0]-2", "ports[1]-2", "ports[2]-2", "ports[3]-2",
    "ports[4]-2", "ports[5]-2", "ports[6]-2", "ports[7]-2",
]

mm = pcbnew.FromMM


def make_class(name, track_mm, via_mm, drill_mm):
    nc = pcbnew.NETCLASS(name)
    nc.SetTrackWidth(mm(track_mm))
    nc.SetViaDiameter(mm(via_mm))
    nc.SetViaDrill(mm(drill_mm))
    nc.SetClearance(mm(0.2))
    return nc


def main():
    board = pcbnew.LoadBoard(str(PCB))
    ns = board.GetDesignSettings().m_NetSettings

    default = ns.GetDefaultNetclass()
    default.SetTrackWidth(mm(0.3))
    default.SetViaDiameter(mm(0.6))
    default.SetViaDrill(mm(0.3))
    default.SetClearance(mm(0.2))

    ns.SetNetclass("Power", make_class("Power", 1.2, 1.0, 0.5))
    ns.SetNetclass("VBUS", make_class("VBUS", 0.8, 0.8, 0.4))
    for n in POWER_NETS + [GND]:
        ns.SetNetclassPatternAssignment(n, "Power")
    for n in VBUS_NETS:
        ns.SetNetclassPatternAssignment(n, "VBUS")
    ns.RecomputeEffectiveNetclasses()

    if not pcbnew.ExportSpecctraDSN(board, str(DSN)):
        sys.exit("DSN export failed")
    print(f"exported {DSN}")


if __name__ == "__main__":
    main()
