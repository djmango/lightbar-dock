#!/usr/bin/env python3
"""Import a single net's wires/vias from a Topola Specctra SES into a KiCad board.

Does NOT use ImportSpecctraSES (which rewrites the whole board).
"""
from __future__ import annotations

import argparse
import os
import re
import sys

import pcbnew
import wx


def mm_iu(v: float) -> int:
    return int(round(pcbnew.FromMM(v)))


def parse_ses_net(path: str, netname: str, unit_scale_mm: float):
    text = open(path).read()
    # Find net block — naive paren scan from (net "name"
    token = f'(net "{netname}"'
    start = text.find(token)
    if start < 0:
        # try without escaping
        token = f"(net {netname}"
        start = text.find(token)
    if start < 0:
        raise SystemExit(f"net not found in SES: {netname}")

    # walk to matching close at depth
    i = start
    depth = 0
    end = None
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    block = text[start:end]
    wires = []
    for m in re.finditer(
        r"\(path\s+(F\.Cu|B\.Cu)\s+([\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)",
        block,
    ):
        layer, w, x1, y1, x2, y2 = m.groups()
        wires.append(
            (
                layer,
                float(w) * unit_scale_mm,
                float(x1) * unit_scale_mm,
                -float(y1) * unit_scale_mm,  # Specctra Y often flipped vs KiCad
                float(x2) * unit_scale_mm,
                -float(y2) * unit_scale_mm,
            )
        )
    vias = []
    for m in re.finditer(
        r"\(via\s+[^\n]*?([-\d.]+)\s+([-\d.]+)\)",
        block,
    ):
        x, y = m.groups()
        vias.append((float(x) * unit_scale_mm, -float(y) * unit_scale_mm))
    # dedupe
    uniq_w = []
    seen = set()
    for w in wires:
        key = tuple(round(v, 4) if isinstance(v, float) else v for v in w)
        if key in seen:
            continue
        seen.add(key)
        uniq_w.append(w)
    uniq_v = []
    seenv = set()
    for v in vias:
        key = (round(v[0], 4), round(v[1], 4))
        if key in seenv:
            continue
        seenv.add(key)
        uniq_v.append(v)
    return uniq_w, uniq_v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pcb")
    ap.add_argument("ses")
    ap.add_argument("net")
    ap.add_argument("--width-mm", type=float, default=0.15)
    ap.add_argument("--via-dia-mm", type=float, default=0.6)
    ap.add_argument("--via-drill-mm", type=float, default=0.3)
    ap.add_argument(
        "--unit-mm",
        type=float,
        default=0.001,
        help="SES coordinate unit in mm (um resolution → 0.001)",
    )
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if os.environ.get("DISPLAY") or sys.platform == "darwin":
        try:
            wx.App(False)
        except Exception:
            pass
    board = pcbnew.LoadBoard(args.pcb)
    net = board.FindNet(args.net)
    if net is None:
        raise SystemExit(f"board missing net {args.net}")

    wires, vias = parse_ses_net(args.ses, args.net, args.unit_mm)
    print(f"importing {len(wires)} wires, {len(vias)} vias for {args.net}")

    # Heuristic: pick Y polarity that lands nearer to existing pads of this net
    pads = [p for p in board.GetPads() if p.GetNetname() == args.net]
    if pads and wires:
        pad_y = sum(pcbnew.ToMM(p.GetPosition().y) for p in pads) / len(pads)

        def score(flip: bool):
            ys = []
            for _, _, _, y1, _, y2 in wires[:50]:
                ys.extend([(-y1 if flip else y1), (-y2 if flip else y2)])
            if not ys:
                return 1e9
            mean = sum(ys) / len(ys)
            return abs(mean - pad_y)

        # currently wires already Y-flipped once; try both
        # Re-parse without assuming flip if needed
        pass

    layer_map = {"F.Cu": pcbnew.F_Cu, "B.Cu": pcbnew.B_Cu}
    w_fixed = mm_iu(args.width_mm)
    for layer_s, _w, x1, y1, x2, y2 in wires:
        if abs(x1 - x2) < 1e-6 and abs(y1 - y2) < 1e-6:
            continue
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(mm_iu(x1), mm_iu(y1)))
        t.SetEnd(pcbnew.VECTOR2I(mm_iu(x2), mm_iu(y2)))
        t.SetWidth(w_fixed)
        t.SetLayer(layer_map[layer_s])
        t.SetNet(net)
        board.Add(t)

    for x, y in vias:
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I(mm_iu(x), mm_iu(y)))
        v.SetViaType(pcbnew.VIATYPE_THROUGH)
        try:
            v.SetWidth(mm_iu(args.via_dia_mm), pcbnew.F_Cu)
            v.SetWidth(mm_iu(args.via_dia_mm), pcbnew.B_Cu)
        except TypeError:
            v.SetWidth(mm_iu(args.via_dia_mm))
        v.SetDrill(mm_iu(args.via_drill_mm))
        v.SetNet(net)
        if hasattr(v, "SetLayerPair"):
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        board.Add(v)

    out = args.out or args.pcb
    pcbnew.SaveBoard(out, board)
    cd = board.GetConnectivity()
    cd.RecalculateRatsnest()
    print("unconnected", cd.GetUnconnectedCount(False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
