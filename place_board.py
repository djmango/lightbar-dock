#!/usr/bin/env python3
"""
Deterministic placement pass for the lightbar dock PCB.

Positions every footprint by its `atopile_address` property and draws the
board outline. Re-run any time after `ato build`:

    python3 place_board.py

Tune the constants below (port pitch etc.) and re-run; routing is preserved
only if you haven't routed yet (this script only moves footprints, it does
not delete tracks, but moving parts after routing leaves dangling tracks).
"""

import re
from pathlib import Path

PCB = Path(__file__).parent / "layouts/default/default.kicad_pcb"

# ---------------------------------------------------------------- geometry
# Bars stack face-to-face along their ~10.5mm (17mm at bulge) thickness.
# Pitch = 17mm bulge + ~5.5mm for printed divider walls and clearance.
PORT_PITCH = 22.5
N_PORTS = 8
POWER_W = 60.0      # left section for input + bucks (inductor is 13x8mm!)
BOARD_H = 42.0      # bar body is ~31mm front-to-back; board is a bit deeper
ORIGIN_X, ORIGIN_Y = 50.0, 50.0   # sheet position of board top-left
BOARD_W = POWER_W + N_PORTS * PORT_PITCH

def port_x(i: int) -> float:
    return ORIGIN_X + POWER_W + (i + 0.5) * PORT_PITCH

X0, Y0 = ORIGIN_X, ORIGIN_Y

# address -> (x, y, rot)
# Sized against real bounding boxes: inductor 13.2x8.3, SMC diode 6.2x10.1
# (rot 90), SOIC-8 5.9x6.1, SMB diode 3.9x6.9 (rot 90), 0805 cap 2.0x4.1
# (rot 90), barrel jack 14.6x10.2, PD receptacle 7.8x10.6 (rot 90).
PLACEMENTS: dict[str, tuple[float, float, float]] = {
    # ---- input stage, left edge
    "pd_input.connector":           (X0 + 5.0,  Y0 + 12.0, 90),   # mating face near board edge
    "pd_input.trigger":             (X0 + 14.0, Y0 + 12.0, 0),
    "pd_input.vbus_sense_resistor": (X0 + 14.0, Y0 + 6.0,  0),
    "pd_input.vdd_cap":             (X0 + 19.5, Y0 + 6.0,  0),
    "pd_input.cfg1_resistor":       (X0 + 14.0, Y0 + 17.5, 0),
    "pd_input.pd_ok_led.package":   (X0 + 14.0, Y0 + 20.5, 0),
    "pd_input.pd_ok_resistor":      (X0 + 17.0, Y0 + 20.5, 0),
    "barrel_jack":                  (X0 + 11.0, Y0 + 34.0, 0),    # opening on left edge
    "or_diode_pd":                  (X0 + 21.5, Y0 + 24.0, 90),
    "or_diode_jack":                (X0 + 28.0, Y0 + 24.0, 90),
    "power_led.package":            (X0 + 22.0, Y0 + 38.0, 0),
    "power_led_resistor":           (X0 + 26.5, Y0 + 38.0, 0),

    # ---- buck A (feeds ports 0-3), y 0-21 band of power section
    "buck_a.input_caps[2]":         (X0 + 32.5, Y0 + 4.0,  90),
    "buck_a.input_caps[1]":         (X0 + 32.5, Y0 + 8.5,  90),
    "buck_a.input_caps[0]":         (X0 + 32.5, Y0 + 13.0, 90),
    "buck_a.package":               (X0 + 38.0, Y0 + 7.0,  0),
    "buck_a.bootstrap_capacitor":   (X0 + 35.5, Y0 + 12.0, 90),
    "buck_a.diode":                 (X0 + 44.0, Y0 + 7.0,  90),
    "buck_a.inductor":              (X0 + 43.0, Y0 + 17.0, 180),
    "buck_a.compensation_resistor": (X0 + 48.5, Y0 + 3.5,  90),
    "buck_a.compensation_capacitors[0]": (X0 + 48.5, Y0 + 7.0, 90),
    "buck_a.compensation_capacitors[1]": (X0 + 50.5, Y0 + 7.0, 90),
    "buck_a.switching_frequency_resistor": (X0 + 50.5, Y0 + 3.5, 90),
    "buck_a.feedback_divider.chain.resistors[0]": (X0 + 53.0, Y0 + 3.5, 90),
    "buck_a.feedback_divider.chain.resistors[1]": (X0 + 53.0, Y0 + 7.0, 90),
    "en_top_a":                     (X0 + 57.5, Y0 + 3.5,  90),
    "en_bottom_a":                  (X0 + 57.5, Y0 + 7.0,  90),
    "buck_a.output_caps[0]":        (X0 + 51.5, Y0 + 13.0, 90),
    "buck_a.output_caps[1]":        (X0 + 51.5, Y0 + 17.5, 90),
    "buck_a.output_caps[2]":        (X0 + 54.5, Y0 + 13.0, 90),
    "buck_a.output_caps[3]":        (X0 + 54.5, Y0 + 17.5, 90),

    # ---- buck B (feeds ports 4-7), y 21-42 band (buck A shifted +21)
    "buck_b.input_caps[2]":         (X0 + 32.5, Y0 + 25.0, 90),
    "buck_b.input_caps[1]":         (X0 + 32.5, Y0 + 29.5, 90),
    "buck_b.input_caps[0]":         (X0 + 32.5, Y0 + 34.0, 90),
    "buck_b.package":               (X0 + 38.0, Y0 + 28.0, 0),
    "buck_b.bootstrap_capacitor":   (X0 + 35.5, Y0 + 33.0, 90),
    "buck_b.diode":                 (X0 + 44.0, Y0 + 28.0, 90),
    "buck_b.inductor":              (X0 + 43.0, Y0 + 37.5, 180),
    "buck_b.compensation_resistor": (X0 + 48.5, Y0 + 24.5, 90),
    "buck_b.compensation_capacitors[0]": (X0 + 48.5, Y0 + 28.0, 90),
    "buck_b.compensation_capacitors[1]": (X0 + 50.5, Y0 + 28.0, 90),
    "buck_b.switching_frequency_resistor": (X0 + 50.5, Y0 + 24.5, 90),
    "buck_b.feedback_divider.chain.resistors[0]": (X0 + 53.0, Y0 + 24.5, 90),
    "buck_b.feedback_divider.chain.resistors[1]": (X0 + 53.0, Y0 + 28.0, 90),
    "en_top_b":                     (X0 + 57.5, Y0 + 24.5, 90),
    "en_bottom_b":                  (X0 + 57.5, Y0 + 28.0, 90),
    "buck_b.output_caps[0]":        (X0 + 51.5, Y0 + 33.5, 90),
    "buck_b.output_caps[1]":        (X0 + 51.5, Y0 + 38.0, 90),
    "buck_b.output_caps[2]":        (X0 + 54.5, Y0 + 33.5, 90),
    "buck_b.output_caps[3]":        (X0 + 54.5, Y0 + 38.0, 90),
}

# ---- per-port channel, replicated at PORT_PITCH
for i in range(N_PORTS):
    x = port_x(i)
    PLACEMENTS.update({
        # plug rotated 90: connector's wide axis runs front-to-back (Y),
        # matching the port orientation on the bar's end face
        f"ports[{i}].plug":            (x,        Y0 + 16.0, 90),
        f"ports[{i}].fuse":            (x - 4.0,  Y0 + 5.0,  0),
        f"ports[{i}].sense_resistor":  (x + 4.5,  Y0 + 5.0,  0),
        f"ports[{i}].port_cap":        (x + 7.5,  Y0 + 16.0, 90),
        f"ports[{i}].cc_pullup_1":     (x - 7.5,  Y0 + 13.0, 90),
        f"ports[{i}].cc_pullup_2":     (x - 7.5,  Y0 + 19.0, 90),
        f"ports[{i}].charge_led.package": (x - 2.5, Y0 + 34.0, 0),
        f"ports[{i}].led_resistor":    (x + 3.0,  Y0 + 34.0, 0),
    })

# ---- comparator banks between their port groups
for bank, left_port in (("bank_a", 1), ("bank_b", 5)):
    bx = (port_x(left_port) + port_x(left_port + 1)) / 2
    PLACEMENTS.update({
        f"{bank}.comparator":     (bx,       Y0 + 27.0, 0),
        f"{bank}.decoupling_cap": (bx - 7.5, Y0 + 27.0, 90),
        f"{bank}.vref_top":       (bx + 7.5, Y0 + 25.0, 0),
        f"{bank}.vref_bottom":    (bx + 7.5, Y0 + 28.0, 0),
    })


def split_top_level(body: str) -> list[str]:
    """Split the top-level items of the kicad_pcb expression."""
    items, depth, start = [], 0, None
    for m, ch in enumerate(body):
        if ch == "(":
            if depth == 0:
                start = m
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0 and start is not None:
                items.append((start, m + 1))
                start = None
    return items


def main() -> None:
    text = PCB.read_text()

    inner = text[text.index("(") + len("(kicad_pcb"):text.rindex(")")]
    header_len = text.index("(") + len("(kicad_pcb")

    placed, missing = 0, []
    spans = split_top_level(inner)
    out, cursor = [], 0
    for s, e in spans:
        item = inner[s:e]
        if item.startswith("(gr_line") and "placer-edge" in item:
            # drop outline from a previous run of this script
            out.append(inner[cursor:s].rstrip("\n\t"))
            cursor = e
            continue
        kind = item[1:].split(None, 1)[0].split("(")[0]
        if kind in ("segment", "via", "zone"):
            # drop stale routing stranded outside the board outline
            # (atopile emits pre-routed module templates at pre-placement coords)
            coords = [(float(a), float(b)) for a, b in
                      re.findall(r"\((?:at|start|end|xy) ([-\d.]+) ([-\d.]+)", item)]
            on_board = any(
                ORIGIN_X <= x <= ORIGIN_X + BOARD_W and
                ORIGIN_Y <= y <= ORIGIN_Y + BOARD_H for x, y in coords)
            if coords and not on_board:
                out.append(inner[cursor:s].rstrip("\n\t"))
                cursor = e
                continue
        if item.startswith("(footprint"):
            m = re.search(r'\(property "atopile_address" "([^"]+)"', item)
            if m and m.group(1) in PLACEMENTS:
                x, y, rot = PLACEMENTS[m.group(1)]
                # first (at ...) in the footprint is its position + rotation
                at = re.search(r"\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)", item)
                old_rot = float(at.group(3) or 0)
                new_at = f"(at {x:g} {y:g} {rot:g})" if rot else f"(at {x:g} {y:g})"
                body = item[:at.start()] + new_at + item[at.end():]
                # child (at ...) angles include the footprint angle, so shift
                # every pad/text angle by the rotation delta
                delta = (rot - old_rot) % 360
                if delta:
                    head_end = item[:at.start()].__len__() + len(new_at)
                    def child(mm):
                        a = (float(mm.group(3) or 0) + delta) % 360
                        return (f"(at {mm.group(1)} {mm.group(2)} {a:g})"
                                if a else f"(at {mm.group(1)} {mm.group(2)})")
                    body = body[:head_end] + re.sub(
                        r"\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)",
                        child, body[head_end:])
                item = body
                placed += 1
            elif m:
                missing.append(m.group(1))
        out.append(inner[cursor:s])
        out.append(item)
        cursor = e
    out.append(inner[cursor:])
    inner = "".join(out)

    # board outline on Edge.Cuts
    corners = [
        (ORIGIN_X, ORIGIN_Y),
        (ORIGIN_X + BOARD_W, ORIGIN_Y),
        (ORIGIN_X + BOARD_W, ORIGIN_Y + BOARD_H),
        (ORIGIN_X, ORIGIN_Y + BOARD_H),
    ]
    lines = []
    for i, (sx, sy) in enumerate(corners):
        ex, ey = corners[(i + 1) % 4]
        lines.append(
            f'\n\t(gr_line\n\t\t(start {sx:g} {sy:g})\n\t\t(end {ex:g} {ey:g})'
            f'\n\t\t(stroke\n\t\t\t(width 0.1)\n\t\t\t(type default)\n\t\t)'
            f'\n\t\t(layer "Edge.Cuts")\n\t\t(uuid "placer-edge-{i}")\n\t)'
        )
    inner = inner.rstrip() + "".join(lines) + "\n"

    PCB.write_text(text[:header_len] + inner + ")\n")
    print(f"placed {placed} footprints on a {BOARD_W:g} x {BOARD_H:g} mm board "
          f"(port pitch {PORT_PITCH:g} mm)")
    if missing:
        print("no placement rule for:", *missing, sep="\n  ")


if __name__ == "__main__":
    main()
