#!/usr/bin/env python3
"""
Fast clearance-aware grid A* finisher for Freerouting leftovers.

- Bitmap obstacles (one build per net)
- Prefer single-layer routes; vias only when needed
- Geometric clearance check; rip-up on failure
"""
from __future__ import annotations

import heapq
import json
import math
import os
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

import pcbnew
import wx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PCB = os.environ.get(
    "FINISH_PCB", os.path.join(ROOT, "generated/kicad/v3-routed.kicad_pcb")
)
DEFAULT_PCB = os.path.join(ROOT, "generated/kicad/default.kicad_pcb")
DRC_JSON = os.path.join(ROOT, "generated/reports/v3-drc.json")
REPORT = os.path.join(ROOT, "generated/reports/v3-grid-finish.json")

GRID_MM = float(os.environ.get("FINISH_GRID_MM", "0.1"))
WIDTH_MM = float(os.environ.get("FINISH_WIDTH_MM", "0.15"))
CLEAR_MM = float(os.environ.get("FINISH_CLEAR_MM", "0.15"))
KEEPOUT_EXTRA_MM = float(os.environ.get("FINISH_KEEPOUT_EXTRA_MM", "0.05"))
# Only reject true shorts in copper_ok; clearance is enforced via obstacle inflate.
SHORT_SLACK_MM = float(os.environ.get("FINISH_SHORT_SLACK_MM", "0.03"))
VIA_DIA_MM = float(os.environ.get("FINISH_VIA_DIA_MM", "0.6"))
VIA_DRILL_MM = float(os.environ.get("FINISH_VIA_DRILL_MM", "0.3"))
VALIDATE = os.environ.get("FINISH_VALIDATE", "1") != "0"
VIA_COST = int(os.environ.get("FINISH_VIA_COST", "35"))
ASTAR_TIMEOUT_S = float(os.environ.get("FINISH_ASTAR_TIMEOUT", "45"))
ATTACH_IGNORE_MM = float(os.environ.get("FINISH_ATTACH_IGNORE_MM", "1.2"))

Layer = int
Cell = Tuple[int, int, int]  # gx, gy, layer_idx 0=F 1=B


def log(*a):
    print(*a, flush=True)


def mm(v: float) -> int:
    return int(round(pcbnew.FromMM(v)))


def to_mm(v: int) -> float:
    return float(pcbnew.ToMM(v))


def layer_idx(layer: int) -> int:
    return 0 if layer == pcbnew.F_Cu else 1


def layer_from_idx(i: int) -> int:
    return pcbnew.F_Cu if i == 0 else pcbnew.B_Cu


@dataclass
class Endpoint:
    net: str
    x_mm: float
    y_mm: float
    layer: Layer
    desc: str


def parse_unconnected_from_drc(path: str) -> List[Tuple[Endpoint, Endpoint]]:
    data = json.loads(open(path).read())
    pairs = []
    for v in data.get("unconnected_items", []):
        items = v.get("items") or []
        if len(items) < 2:
            continue
        eps = []
        for it in items[:2]:
            desc = it.get("description", "")
            pos = it.get("pos") or {}
            net_m = desc[desc.find("[") + 1 : desc.find("]")] if "[" in desc else "?"
            layer = pcbnew.B_Cu if "B.Cu" in desc else pcbnew.F_Cu
            eps.append(
                Endpoint(net_m, float(pos["x"]), float(pos["y"]), layer, desc)
            )
        if eps[0].net == eps[1].net and eps[0].net != "?":
            pairs.append((eps[0], eps[1]))
    return pairs


def via_width(t) -> int:
    try:
        return t.GetWidth(pcbnew.F_Cu)
    except TypeError:
        return t.GetWidth()


class BitmapGrid:
    def __init__(self, board, net: str, xmin, ymin, xmax, ymax):
        self.xmin = xmin
        self.ymin = ymin
        self.grid = GRID_MM
        self.nx = int(math.ceil((xmax - xmin) / GRID_MM)) + 1
        self.ny = int(math.ceil((ymax - ymin) / GRID_MM)) + 1
        # 0=free 1=blocked for F and B
        self.occ = [
            bytearray(self.nx * self.ny),
            bytearray(self.nx * self.ny),
        ]
        keepout = CLEAR_MM + WIDTH_MM / 2.0 + KEEPOUT_EXTRA_MM
        t0 = time.time()
        self._paint(board, net, keepout)
        log(f"  obstacles: {self.nx}x{self.ny} in {time.time()-t0:.2f}s keepout={keepout:.2f}")

    def _i(self, gx, gy):
        return gy * self.nx + gx

    def block(self, gx, gy, li):
        if 0 <= gx < self.nx and 0 <= gy < self.ny:
            self.occ[li][self._i(gx, gy)] = 1

    def free(self, c: Cell) -> bool:
        gx, gy, li = c
        if gx < 0 or gy < 0 or gx >= self.nx or gy >= self.ny:
            return False
        return self.occ[li][self._i(gx, gy)] == 0

    def world_to_cell(self, x, y, layer) -> Cell:
        gx = int(round((x - self.xmin) / self.grid))
        gy = int(round((y - self.ymin) / self.grid))
        return (
            max(0, min(self.nx - 1, gx)),
            max(0, min(self.ny - 1, gy)),
            layer_idx(layer),
        )

    def cell_to_world(self, c: Cell):
        gx, gy, li = c
        return self.xmin + gx * self.grid, self.ymin + gy * self.grid, layer_from_idx(li)

    def paint_disk(self, x, y, r, layers_idx):
        g = self.grid
        r_cells = int(math.ceil(r / g)) + 1
        cx = int(round((x - self.xmin) / g))
        cy = int(round((y - self.ymin) / g))
        rr = r * r
        for dy in range(-r_cells, r_cells + 1):
            gy = cy + dy
            if gy < 0 or gy >= self.ny:
                continue
            for dx in range(-r_cells, r_cells + 1):
                gx = cx + dx
                if gx < 0 or gx >= self.nx:
                    continue
                wx = self.xmin + gx * g
                wy = self.ymin + gy * g
                if (wx - x) ** 2 + (wy - y) ** 2 <= rr:
                    for li in layers_idx:
                        self.occ[li][self._i(gx, gy)] = 1

    def unpaint_disk(self, x, y, r, layers_idx):
        g = self.grid
        r_cells = int(math.ceil(r / g)) + 1
        cx = int(round((x - self.xmin) / g))
        cy = int(round((y - self.ymin) / g))
        rr = r * r
        for dy in range(-r_cells, r_cells + 1):
            gy = cy + dy
            if gy < 0 or gy >= self.ny:
                continue
            for dx in range(-r_cells, r_cells + 1):
                gx = cx + dx
                if gx < 0 or gx >= self.nx:
                    continue
                wx = self.xmin + gx * g
                wy = self.ymin + gy * g
                if (wx - x) ** 2 + (wy - y) ** 2 <= rr:
                    for li in layers_idx:
                        self.occ[li][self._i(gx, gy)] = 0

    def paint_capsule(self, x1, y1, x2, y2, r, li):
        dist = math.hypot(x2 - x1, y2 - y1)
        steps = max(1, int(math.ceil(dist / (self.grid * 0.35))))
        for i in range(steps + 1):
            t = i / steps
            self.paint_disk(x1 + t * (x2 - x1), y1 + t * (y2 - y1), r, [li])

    def _paint(self, board, net, keepout):
        for pad in board.GetPads():
            if pad.GetNetname() == net:
                continue
            pos = pad.GetPosition()
            size = pad.GetSize()
            r = max(to_mm(size.x), to_mm(size.y)) / 2.0 + keepout
            layers = []
            if pad.IsOnLayer(pcbnew.F_Cu):
                layers.append(0)
            if pad.IsOnLayer(pcbnew.B_Cu):
                layers.append(1)
            if not layers:
                layers = [0, 1]
            self.paint_disk(to_mm(pos.x), to_mm(pos.y), r, layers)

        for t in board.GetTracks():
            if t.GetNetname() == net:
                continue
            if t.GetClass() == "PCB_VIA":
                pos = t.GetPosition()
                r = to_mm(via_width(t)) / 2.0 + keepout
                self.paint_disk(to_mm(pos.x), to_mm(pos.y), r, [0, 1])
            elif t.GetClass() == "PCB_TRACK":
                a, b = t.GetStart(), t.GetEnd()
                r = to_mm(t.GetWidth()) / 2.0 + keepout
                self.paint_capsule(
                    to_mm(a.x),
                    to_mm(a.y),
                    to_mm(b.x),
                    to_mm(b.y),
                    r,
                    layer_idx(t.GetLayer()),
                )


def astar(grid: BitmapGrid, start: Cell, goal: Cell, allow_via: bool) -> Optional[List[Cell]]:
    # ensure endpoints free
    for c in (start, goal):
        gx, gy, li = c
        if 0 <= gx < grid.nx and 0 <= gy < grid.ny:
            grid.occ[li][grid._i(gx, gy)] = 0

    def h(c):
        return abs(c[0] - goal[0]) + abs(c[1] - goal[1]) + (
            0 if c[2] == goal[2] else VIA_COST
        )

    openh = [(h(start), 0, start)]
    came = {start: None}
    gscore = {start: 0}
    closed = set()
    t0 = time.time()
    dirs = ((1, 0), (-1, 0), (0, 1), (0, -1))

    while openh:
        if time.time() - t0 > ASTAR_TIMEOUT_S:
            return None
        _, g, cur = heapq.heappop(openh)
        if cur in closed:
            continue
        closed.add(cur)
        if cur == goal:
            path = [cur]
            while came[path[-1]] is not None:
                path.append(came[path[-1]])
            path.reverse()
            return path
        gx, gy, li = cur
        for dx, dy in dirs:
            nxt = (gx + dx, gy + dy, li)
            if not grid.free(nxt):
                continue
            ng = g + 1
            if ng < gscore.get(nxt, 1e18):
                gscore[nxt] = ng
                came[nxt] = cur
                heapq.heappush(openh, (ng + h(nxt), ng, nxt))
        if allow_via:
            other = 1 - li
            via = (gx, gy, other)
            if grid.free(via):
                ng = g + VIA_COST
                if ng < gscore.get(via, 1e18):
                    gscore[via] = ng
                    came[via] = cur
                    heapq.heappush(openh, (ng + h(via), ng, via))
    return None


def path_to_segments(path: List[Cell], grid: BitmapGrid):
    segs, vias = [], []
    if not path:
        return segs, vias
    i = 0
    while i < len(path) - 1:
        a, b = path[i], path[i + 1]
        if a[2] != b[2]:
            x, y, _ = grid.cell_to_world(a)
            vias.append((x, y))
            i += 1
            continue
        j = i + 1
        dx, dy = b[0] - a[0], b[1] - a[1]
        while j + 1 < len(path):
            c, d = path[j], path[j + 1]
            if c[2] != d[2] or d[2] != a[2] or (d[0] - c[0], d[1] - c[1]) != (dx, dy):
                break
            j += 1
        x1, y1, layer = grid.cell_to_world(path[i])
        x2, y2, _ = grid.cell_to_world(path[j])
        segs.append((x1, y1, x2, y2, layer))
        i = j
    return segs, vias


def add_copper(board, netname, segs, vias):
    net = board.FindNet(netname)
    w = mm(WIDTH_MM)
    added = []
    for x1, y1, x2, y2, layer in segs:
        if abs(x1 - x2) < 1e-9 and abs(y1 - y2) < 1e-9:
            continue
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(mm(x1), mm(y1)))
        t.SetEnd(pcbnew.VECTOR2I(mm(x2), mm(y2)))
        t.SetWidth(w)
        t.SetLayer(layer)
        t.SetNet(net)
        board.Add(t)
        added.append(t)
    for x, y in vias:
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I(mm(x), mm(y)))
        v.SetViaType(pcbnew.VIATYPE_THROUGH)
        try:
            v.SetWidth(mm(VIA_DIA_MM), pcbnew.F_Cu)
            v.SetWidth(mm(VIA_DIA_MM), pcbnew.B_Cu)
        except TypeError:
            v.SetWidth(mm(VIA_DIA_MM))
        v.SetDrill(mm(VIA_DRILL_MM))
        v.SetNet(net)
        if hasattr(v, "SetLayerPair"):
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        board.Add(v)
        added.append(v)
    return added


def remove_items(board, items):
    for it in items:
        board.Remove(it)


def seg_point_dist(ax, ay, bx, by, px, py):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    vv = vx * vx + vy * vy
    if vv < 1e-18:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / vv))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def seg_seg_dist(ax, ay, bx, by, cx, cy, dx, dy):
    return min(
        seg_point_dist(ax, ay, bx, by, cx, cy),
        seg_point_dist(ax, ay, bx, by, dx, dy),
        seg_point_dist(cx, cy, dx, dy, ax, ay),
        seg_point_dist(cx, cy, dx, dy, bx, by),
    )


def copper_ok(board, netname, added, endpoints=None) -> Tuple[bool, str]:
    """Reject only near-shorts (overlapping copper), not soft clearance."""
    half_w = WIDTH_MM / 2.0
    half_v = VIA_DIA_MM / 2.0
    endpoints = endpoints or []

    def near_attach(x, y):
        for ex, ey in endpoints:
            if math.hypot(x - ex, y - ey) <= ATTACH_IGNORE_MM:
                return True
        return False

    for item in added:
        if item.GetClass() == "PCB_TRACK":
            a, b = item.GetStart(), item.GetEnd()
            ax, ay, bx, by = to_mm(a.x), to_mm(a.y), to_mm(b.x), to_mm(b.y)
            layer = item.GetLayer()
            for other in board.GetTracks():
                if other in added or other.GetNetname() == netname:
                    continue
                if other.GetClass() == "PCB_TRACK":
                    if other.GetLayer() != layer:
                        continue
                    c, d = other.GetStart(), other.GetEnd()
                    dist = seg_seg_dist(
                        ax, ay, bx, by, to_mm(c.x), to_mm(c.y), to_mm(d.x), to_mm(d.y)
                    )
                    need = half_w + to_mm(other.GetWidth()) / 2 + SHORT_SLACK_MM
                    if dist < need:
                        return False, f"track-track {dist:.3f}"
                else:
                    p = other.GetPosition()
                    dist = seg_point_dist(ax, ay, bx, by, to_mm(p.x), to_mm(p.y))
                    need = half_w + to_mm(via_width(other)) / 2 + SHORT_SLACK_MM
                    if dist < need:
                        return False, f"track-via {dist:.3f}"
            for pad in board.GetPads():
                if pad.GetNetname() == netname or not pad.IsOnLayer(layer):
                    continue
                p = pad.GetPosition()
                px, py = to_mm(p.x), to_mm(p.y)
                if near_attach(px, py):
                    continue
                size = pad.GetSize()
                dist = seg_point_dist(ax, ay, bx, by, px, py)
                need = half_w + max(to_mm(size.x), to_mm(size.y)) / 2 + SHORT_SLACK_MM
                if dist < need:
                    return False, "track-pad"
        else:
            p = item.GetPosition()
            px, py = to_mm(p.x), to_mm(p.y)
            for other in board.GetTracks():
                if other in added or other.GetNetname() == netname:
                    continue
                if other.GetClass() == "PCB_TRACK":
                    c, d = other.GetStart(), other.GetEnd()
                    dist = seg_point_dist(
                        to_mm(c.x), to_mm(c.y), to_mm(d.x), to_mm(d.y), px, py
                    )
                    need = half_v + to_mm(other.GetWidth()) / 2 + SHORT_SLACK_MM
                    if dist < need:
                        return False, f"via-track {dist:.3f}"
                else:
                    q = other.GetPosition()
                    dist = math.hypot(px - to_mm(q.x), py - to_mm(q.y))
                    need = half_v + to_mm(via_width(other)) / 2 + SHORT_SLACK_MM
                    if dist < need:
                        return False, f"via-via {dist:.3f}"
    return True, "ok"


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


def route_one(board, a: Endpoint, b: Endpoint, xmin, ymin, xmax, ymax):
    grid = BitmapGrid(board, a.net, xmin, ymin, xmax, ymax)
    # Only carve the endpoint pad/stub layers — never invent copper on the other layer.
    carve = 0.35
    grid.unpaint_disk(a.x_mm, a.y_mm, carve, [layer_idx(a.layer)])
    grid.unpaint_disk(b.x_mm, b.y_mm, carve, [layer_idx(b.layer)])

    # Always attach on the real endpoint layers. Multilayer = vias allowed mid-route.
    attempts = [
        (False,),  # planar on endpoint layers (works when same layer)
        (True,),
    ]

    for (allow_via,) in attempts:
        if a.layer != b.layer and not allow_via:
            continue
        start = grid.world_to_cell(a.x_mm, a.y_mm, a.layer)
        goal = grid.world_to_cell(b.x_mm, b.y_mm, b.layer)
        path = astar(grid, start, goal, allow_via=allow_via)
        if not path:
            log(f"  no path via={allow_via}")
            continue
        segs, vias = path_to_segments(path, grid)
        added = add_copper(board, a.net, segs, vias)
        if not VALIDATE:
            return True, len(segs), len(vias), len(path), "novalidate", not allow_via
        ok, why = copper_ok(
            board, a.net, added, endpoints=[(a.x_mm, a.y_mm), (b.x_mm, b.y_mm)]
        )
        if ok:
            return True, len(segs), len(vias), len(path), why, not allow_via
        remove_items(board, added)
        log(f"  reject ({why}) via={allow_via}")
    return False, 0, 0, 0, "fail", False


def main():
    app = wx.App(False)
    log("loading", PCB)
    board = pcbnew.LoadBoard(PCB)
    pairs = parse_unconnected_from_drc(DRC_JSON)
    log(f"unconnected pairs: {len(pairs)}")
    bb = board.GetBoardEdgesBoundingBox()
    xmin, ymin = to_mm(bb.GetLeft()) - 1, to_mm(bb.GetTop()) - 1
    xmax, ymax = to_mm(bb.GetRight()) + 1, to_mm(bb.GetBottom()) + 1

    pairs.sort(key=lambda p: abs(p[0].x_mm - p[1].x_mm) + abs(p[0].y_mm - p[1].y_mm))
    results = []
    for a, b in pairs:
        log(f"\n=== {a.net} ===")
        log(" ", a.desc)
        log(" ", b.desc)
        ok, segs, vias, cells, why, planar = route_one(
            board, a, b, xmin, ymin, xmax, ymax
        )
        if ok:
            log(f"  OK segs={segs} vias={vias} cells={cells} planar={planar} {why}")
            results.append(
                {"net": a.net, "ok": True, "segs": segs, "vias": vias, "cells": cells}
            )
        else:
            log("  FAIL")
            results.append({"net": a.net, "ok": False})

    refill_gnd(board)
    pcbnew.SaveBoard(PCB, board)
    pcbnew.SaveBoard(DEFAULT_PCB, board)
    cd = board.GetConnectivity()
    cd.RecalculateRatsnest()
    unc = cd.GetUnconnectedCount(False)
    open(REPORT, "w").write(json.dumps({"results": results, "unconnected": unc}, indent=2))
    log("\nfinal unconnected", unc)
    return 0 if unc == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
