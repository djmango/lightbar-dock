#!/usr/bin/env python3
"""Hand-finish stubborn U7 escape nets with explicit polylines + vias."""
from __future__ import annotations

import os
import sys

import pcbnew
import wx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PCB = os.environ.get(
    "FINISH_PCB", os.path.join(ROOT, "generated/kicad/v3-routed.kicad_pcb")
)
DEFAULT_PCB = os.path.join(ROOT, "generated/kicad/default.kicad_pcb")
W = 0.15
VIA_D = 0.6
VIA_DRILL = 0.3


def mm(v: float) -> int:
    return int(round(pcbnew.FromMM(v)))


def add_path(board, netname, points_layer, vias=()):
    """points_layer: list of (x,y,layer) waypoints. vias: list of (x,y)."""
    net = board.FindNet(netname)
    if net is None:
        raise RuntimeError(netname)
    w = mm(W)
    for i in range(len(points_layer) - 1):
        x1, y1, l1 = points_layer[i]
        x2, y2, l2 = points_layer[i + 1]
        if l1 != l2:
            continue
        if abs(x1 - x2) < 1e-9 and abs(y1 - y2) < 1e-9:
            continue
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(mm(x1), mm(y1)))
        t.SetEnd(pcbnew.VECTOR2I(mm(x2), mm(y2)))
        t.SetWidth(w)
        t.SetLayer(l1)
        t.SetNet(net)
        board.Add(t)
    for x, y in vias:
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I(mm(x), mm(y)))
        v.SetViaType(pcbnew.VIATYPE_THROUGH)
        try:
            v.SetWidth(mm(VIA_D), pcbnew.F_Cu)
            v.SetWidth(mm(VIA_D), pcbnew.B_Cu)
        except TypeError:
            v.SetWidth(mm(VIA_D))
        v.SetDrill(mm(VIA_DRILL))
        v.SetNet(net)
        if hasattr(v, "SetLayerPair"):
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        board.Add(v)


def refill_gnd(board):
    for z in list(board.Zones()):
        board.Delete(z)
    gnd = board.FindNet("gnd")
    if gnd is None or gnd.GetNetCode() == 0:
        return
    bbox = board.GetBoardEdgesBoundingBox()
    m = mm(0.3)
    L, R = int(bbox.GetLeft() + m), int(bbox.GetRight() - m)
    T, B = int(bbox.GetTop() + m), int(bbox.GetBottom() - m)
    for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
        z = pcbnew.ZONE(board)
        z.SetNet(gnd)
        z.SetLayer(layer)
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL)
        z.SetMinThickness(mm(0.2))
        z.SetLocalClearance(mm(0.2))
        o = z.Outline()
        o.NewOutline()
        o.Append(L, T)
        o.Append(R, T)
        o.Append(R, B)
        o.Append(L, B)
        board.Add(z)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())


def main():
    app = wx.App(False)
    board = pcbnew.LoadBoard(PCB)
    F, B = pcbnew.F_Cu, pcbnew.B_Cu

    # C42.1 (108,117.99) <-> U7.4 NRST (113,111.475)
    # Escape west from U7, drop to B.Cu for the run, via back near C42.
    add_path(
        board,
        ".C42 > .pin1 to .U7 > .nrst",
        [
            (113.0, 111.475, F),
            (111.2, 111.475, F),
            (111.2, 111.475, F),  # via here
        ],
        vias=[(111.2, 111.475)],
    )
    add_path(
        board,
        ".C42 > .pin1 to .U7 > .nrst",
        [
            (111.2, 111.475, B),
            (111.2, 118.5, B),
            (108.0, 118.5, B),
            (108.0, 117.99, B),
        ],
        vias=[(108.0, 117.99)],
    )
    add_path(
        board,
        ".C42 > .pin1 to .U7 > .nrst",
        [
            (108.0, 117.99, F),
            (108.0, 117.99, F),
        ],
    )

    # status_cc1_adc stub (~92.51,115.5) <-> U7.8 (113,108.875)
    add_path(
        board,
        "status_cc1_adc",
        [
            (113.0, 108.875, F),
            (111.2, 108.875, F),
        ],
        vias=[(111.2, 108.875)],
    )
    add_path(
        board,
        "status_cc1_adc",
        [
            (111.2, 108.875, B),
            (111.2, 115.5, B),
            (92.51, 115.5, B),
        ],
        vias=[(92.51, 115.5)],
    )
    add_path(
        board,
        "status_cc1_adc",
        [
            (92.51, 115.5, F),
            (92.51, 115.5, F),
        ],
    )

    # port_5_cc2 stub (~155.63,94.59) <-> U9.5 (129.85,111.135) — B.Cu channel
    add_path(
        board,
        "port_5_cc2",
        [
            (155.6283, 94.5867, F),
        ],
        vias=[(155.6283, 94.5867)],
    )
    add_path(
        board,
        "port_5_cc2",
        [
            (155.6283, 94.5867, B),
            (155.6283, 111.135, B),
            (129.85, 111.135, B),
        ],
        vias=[(129.85, 111.135)],
    )
    add_path(
        board,
        "port_5_cc2",
        [
            (129.85, 111.135, F),
            (129.85, 111.135, F),
        ],
    )

    refill_gnd(board)
    pcbnew.SaveBoard(PCB, board)
    pcbnew.SaveBoard(DEFAULT_PCB, board)
    cd = board.GetConnectivity()
    cd.RecalculateRatsnest()
    print("unconnected", cd.GetUnconnectedCount(False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
