#!/usr/bin/env python3
"""Rip C42 finish copper and re-place a clearance-safe L-route."""
from __future__ import annotations

import math
import sys

import pcbnew
import wx

PCB = "generated/kicad/v3-routed.kicad_pcb"
DEFAULT = "generated/kicad/default.kicad_pcb"
NET = ".C42 > .pin1 to .U7 > .nrst"
CLEAR = float(__import__("os").environ.get("C42_CLEAR", "0.08"))
WIDTH = 0.15
VIA = 0.8
DRILL = 0.4


def mm(v: float) -> int:
    return int(round(pcbnew.FromMM(v)))


def to_mm(v: int) -> float:
    return float(pcbnew.ToMM(v))


def via_w(t) -> int:
    try:
        return t.GetWidth(pcbnew.F_Cu)
    except TypeError:
        return t.GetWidth()


def seg_pt(ax, ay, bx, by, px, py):
    vx, vy = bx - ax, by - ay
    wx_, wy = px - ax, py - ay
    vv = vx * vx + vy * vy
    if vv < 1e-18:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx_ * vx + wy * vy) / vv))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def seg_seg(ax, ay, bx, by, cx, cy, dx, dy):
    # True intersection → distance 0
    def orient(px, py, qx, qy, rx, ry):
        return (qy - py) * (rx - qx) - (qx - px) * (ry - qy)

    def on_seg(px, py, qx, qy, rx, ry):
        return (
            min(px, rx) - 1e-9 <= qx <= max(px, rx) + 1e-9
            and min(py, ry) - 1e-9 <= qy <= max(py, ry) + 1e-9
        )

    o1 = orient(ax, ay, bx, by, cx, cy)
    o2 = orient(ax, ay, bx, by, dx, dy)
    o3 = orient(cx, cy, dx, dy, ax, ay)
    o4 = orient(cx, cy, dx, dy, bx, by)
    if o1 * o2 < 0 and o3 * o4 < 0:
        return 0.0
    if abs(o1) < 1e-9 and on_seg(ax, ay, cx, cy, bx, by):
        return 0.0
    if abs(o2) < 1e-9 and on_seg(ax, ay, dx, dy, bx, by):
        return 0.0
    if abs(o3) < 1e-9 and on_seg(cx, cy, ax, ay, dx, dy):
        return 0.0
    if abs(o4) < 1e-9 and on_seg(cx, cy, bx, by, dx, dy):
        return 0.0
    return min(
        seg_pt(ax, ay, bx, by, cx, cy),
        seg_pt(ax, ay, bx, by, dx, dy),
        seg_pt(cx, cy, dx, dy, ax, ay),
        seg_pt(cx, cy, dx, dy, bx, by),
    )


def main():
    app = wx.App(False)
    board = pcbnew.LoadBoard(PCB)
    F, B = pcbnew.F_Cu, pcbnew.B_Cu

    all_tracks = list(board.GetTracks())
    pads = list(board.GetPads())
    removed = 0
    for t in all_tracks:
        if t.GetNetname() == NET:
            board.Remove(t)
            removed += 1
    print("removed", removed)
    # Snapshot obstacles AFTER remove without re-calling GetTracks (KiCad 10 SWIG quirk).
    tracks = [t for t in all_tracks if t.GetNetname() != NET]

    def ok_seg(x1, y1, x2, y2, layer):
        need = CLEAR + WIDTH / 2
        for t in tracks:
            if t.GetNetname() == NET:
                continue
            if t.GetClass() == "PCB_TRACK":
                if t.GetLayer() != layer:
                    continue
                a, b = t.GetStart(), t.GetEnd()
                d = seg_seg(
                    x1,
                    y1,
                    x2,
                    y2,
                    to_mm(a.x),
                    to_mm(a.y),
                    to_mm(b.x),
                    to_mm(b.y),
                )
                if d < need + to_mm(t.GetWidth()) / 2 - 1e-6:
                    return False
            else:
                p = t.GetPosition()
                d = seg_pt(x1, y1, x2, y2, to_mm(p.x), to_mm(p.y))
                if d < need + to_mm(via_w(t)) / 2 - 1e-6:
                    return False
        return True

    def ok_via(x, y):
        need = CLEAR + VIA / 2
        for t in tracks:
            if t.GetNetname() == NET:
                continue
            if t.GetClass() == "PCB_TRACK":
                a, b = t.GetStart(), t.GetEnd()
                d = seg_pt(to_mm(a.x), to_mm(a.y), to_mm(b.x), to_mm(b.y), x, y)
                if d < need + to_mm(t.GetWidth()) / 2 - 1e-6:
                    return False
            else:
                p = t.GetPosition()
                d = math.hypot(x - to_mm(p.x), y - to_mm(p.y))
                if d < need + to_mm(via_w(t)) / 2 - 1e-6:
                    return False
        for pad in pads:
            if pad.GetNetname() == NET:
                continue
            p = pad.GetPosition()
            size = pad.GetSize()
            d = math.hypot(x - to_mm(p.x), y - to_mm(p.y))
            if d < need + max(to_mm(size.x), to_mm(size.y)) / 2 - 1e-6:
                return False
        return True

    a = (108.0, 117.99)
    b = (113.0, 111.475)
    found = None
    for x in [round(i * 0.2, 2) for i in range(int(105 / 0.2), int(116 / 0.2) + 1)]:
        for y in [round(i * 0.2, 2) for i in range(int(104 / 0.2), int(123 / 0.2) + 1)]:
            segs = [
                (b[0], b[1], x, b[1], F),
                (x, b[1], x, y, B),
                (x, y, a[0], y, B),
                (a[0], y, a[0], a[1], F),
            ]
            if not all(ok_seg(*s) for s in segs):
                continue
            if not ok_via(x, b[1]) or not ok_via(a[0], y):
                continue
            found = (x, y)
            break
        if found:
            break

    print("found", found)
    if not found:
        return 2

    net = board.FindNet(NET)
    x, y = found

    def add_track(x1, y1, x2, y2, layer):
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(mm(x1), mm(y1)))
        t.SetEnd(pcbnew.VECTOR2I(mm(x2), mm(y2)))
        t.SetWidth(mm(WIDTH))
        t.SetLayer(layer)
        t.SetNet(net)
        board.Add(t)

    def add_via(vx, vy):
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I(mm(vx), mm(vy)))
        v.SetViaType(pcbnew.VIATYPE_THROUGH)
        try:
            v.SetWidth(mm(VIA), F)
            v.SetWidth(mm(VIA), B)
        except TypeError:
            v.SetWidth(mm(VIA))
        v.SetDrill(mm(DRILL))
        v.SetNet(net)
        if hasattr(v, "SetLayerPair"):
            v.SetLayerPair(F, B)
        board.Add(v)

    add_track(b[0], b[1], x, b[1], F)
    add_via(x, b[1])
    add_track(x, b[1], x, y, B)
    add_track(x, y, a[0], y, B)
    add_via(a[0], y)
    add_track(a[0], y, a[0], a[1], F)

    # Dedupe stacked status_cc1 vias
    vias = [
        t
        for t in list(board.GetTracks())
        if t.GetClass() == "PCB_VIA" and t.GetNetname() == "status_cc1_adc"
    ]
    keep = []
    for v in vias:
        x0, y0 = to_mm(v.GetPosition().x), to_mm(v.GetPosition().y)
        if any(
            math.hypot(x0 - to_mm(k.GetPosition().x), y0 - to_mm(k.GetPosition().y))
            < 0.35
            for k in keep
        ):
            board.Delete(v)
            print("removed dup cc1 via", x0, y0)
        else:
            keep.append(v)

    pcbnew.SaveBoard(PCB, board)
    pcbnew.SaveBoard(DEFAULT, board)
    cd = board.GetConnectivity()
    cd.RecalculateRatsnest()
    print("unconnected", cd.GetUnconnectedCount(False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
