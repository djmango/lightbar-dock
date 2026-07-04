#!/usr/bin/env python3
"""
Autoroute the lightbar dock PCB with Freerouting.

Run with KiCad's bundled Python (needs the pcbnew module):

    /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 route_board.py

Requires Java and the Freerouting jar (path below). The flow is:
  1. assign net classes (track widths) for the power nets
  2. add a GND pour on B.Cu so the plane carries ground
  3. export Specctra DSN -> run Freerouting headless -> import the .ses
  4. refill zones and save

Placement comes from place_board.py; run that (and this) again after any
`ato build`. Don't re-run either after hand-editing the layout.
"""

import subprocess
import sys
from pathlib import Path

import pcbnew

ROOT = Path(__file__).parent
PCB = ROOT / "layouts/default/default.kicad_pcb"
DSN = ROOT / "layouts/default/default.dsn"
SES = ROOT / "layouts/default/default.ses"
FREEROUTING_JAR = Path.home() / "tools/freerouting-1.9.0.jar"

# board outline (must match place_board.py)
X0, Y0, W, H = 50.0, 50.0, 240.0, 42.0

GND = "lv"
# 12V rail + input feeds, 5V rails, and buck switch nodes: high current
POWER_NETS = [
    "anode",                        # 12V rail after OR diodes
    "A",                            # barrel jack -> OR diode
    "vdd_cap-power-anode",          # PD VBUS -> OR diode
    "ports[3]-power_in-anode",      # 5V rail, buck A -> ports 0-3
    "ports[7]-power_in-anode",      # 5V rail, buck B -> ports 4-7
    "bootstrap_capacitor-power-lv",     # buck A switch node
    "bootstrap_capacitor-power-lv-1",   # buck B switch node
]
# per-port VBUS path (fuse -> sense -> plug), 1.5A max
VBUS_NETS = [
    "port_cap-power-hv", "port_cap-power-hv-1", "port_cap-power-hv-2",
    "port_cap-power-hv-3", "port_cap-power-hv-4", "port_cap-power-hv-5",
    "port_cap-power-hv-6", "hv",
    "ports[0]-2", "ports[1]-2", "ports[2]-2", "ports[3]-2",
    "ports[4]-2", "ports[5]-2", "ports[6]-2", "ports[7]-2",
]

mm = pcbnew.FromMM


def make_class(name: str, track_mm: float, via_mm: float, drill_mm: float):
    nc = pcbnew.NETCLASS(name)
    nc.SetTrackWidth(mm(track_mm))
    nc.SetViaDiameter(mm(via_mm))
    nc.SetViaDrill(mm(drill_mm))
    nc.SetClearance(mm(0.2))
    return nc


def add_gnd_zone(board, net):
    zone = pcbnew.ZONE(board)
    zone.SetLayer(pcbnew.B_Cu)
    zone.SetNet(net)
    pts = [(X0, Y0), (X0 + W, Y0), (X0 + W, Y0 + H), (X0, Y0 + H)]
    chain = pcbnew.SHAPE_LINE_CHAIN()
    for x, y in pts:
        chain.Append(pcbnew.VECTOR2I(mm(x), mm(y)))
    chain.SetClosed(True)
    zone.Outline().AddOutline(chain)
    zone.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    zone.SetLocalClearance(mm(0.25))
    zone.SetMinThickness(mm(0.25))
    board.Add(zone)
    return zone


def main():
    board = pcbnew.LoadBoard(str(PCB))
    ns = board.GetDesignSettings().m_NetSettings

    default = ns.GetDefaultNetclass()
    default.SetTrackWidth(mm(0.3))
    default.SetViaDiameter(mm(0.6))
    default.SetViaDrill(mm(0.3))
    default.SetClearance(mm(0.2))

    ns.SetNetclass("Power", make_class("Power", 2.0, 1.0, 0.5))
    ns.SetNetclass("VBUS", make_class("VBUS", 1.2, 0.8, 0.4))
    for n in POWER_NETS + [GND]:
        ns.SetNetclassPatternAssignment(n, "Power")
    for n in VBUS_NETS:
        ns.SetNetclassPatternAssignment(n, "VBUS")
    ns.RecomputeEffectiveNetclasses()

    gnd_net = board.FindNet(GND)
    if gnd_net is None:
        sys.exit(f"net {GND!r} not found")
    zone = add_gnd_zone(board, gnd_net)

    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())

    if not pcbnew.ExportSpecctraDSN(board, str(DSN)):
        sys.exit("DSN export failed")
    print(f"exported {DSN.name}")

    subprocess.run(
        ["java", "-jar", str(FREEROUTING_JAR),
         "-de", str(DSN), "-do", str(SES),
         "-mp", "50", "-dct", "1"],
        check=True, timeout=3600)
    if not SES.exists():
        sys.exit("Freerouting produced no .ses")

    if not pcbnew.ImportSpecctraSES(board, str(SES)):
        sys.exit("SES import failed")

    filler.Fill(board.Zones())
    pcbnew.SaveBoard(str(PCB), board)
    print(f"routed and saved {PCB.name}: "
          f"{len(board.GetTracks())} track segments/vias")


if __name__ == "__main__":
    main()
