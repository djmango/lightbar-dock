# lightbar-dock

A 1x8 USB-C charging dock for stick-anywhere rechargeable light bars. Bars
plug vertically onto upward-facing USB-C plugs; a green LED per port shows
live charging status (actual current flow, not just power present).

Designed in [atopile](https://atopile.io) — the whole board is code in
`main.ato`.

## Architecture

```
USB-C PD input ──CH224K (requests 12V)──┐
                                        ├─ diode-OR ── 12V rail
12V barrel jack (5.5x2.1mm) ────────────┘
                                            ├── TPS54560 buck #A (5V, 5A) ── ports 1-4
                                            └── TPS54560 buck #B (5V, 5A) ── ports 5-8
```

Each port: 1.5A-hold polyfuse → 100mΩ current-sense resistor → vertical
USB-C plug (Jing Extension 918-118A2021Y40006, C399938), with 22k CC
pull-ups (both orientations) advertising a 1.5A 5V source and D+/D-
shorted as a BC1.2 dedicated-charger signature. Two LM339 quad comparators watch the sense resistors against a
shared "rail minus 21mV" reference; while a bar draws more than roughly
150-200mA its green LED is lit. LED off = done (or empty slot).

Indicators: red = 12V power present, blue = PD negotiation succeeded
(CH224K PG), 8x green = port charging.

## Power budget

- Per port: 5V up to ~1A continuous (polyfuse 1.5A hold / 3A trip)
- Barrel jack input: use a 12V / 5A brick for the full 8 x 1A load
- USB-C PD input: a 12V-capable PD brick tops out at 3A (36W), so all-8
  simultaneous charging derates to ~0.75A per port — fine in practice
  since charge current tapers
- **PD brick must support 12V.** CH224K is configured (24k on CFG1) to
  request 12V; if the brick doesn't offer it, VBUS stays at 5V and the
  bucks stay off (UVLO turn-on is ~6.2V) — nothing charges, nothing breaks.

## Toolchain

- `uv tool install atopile` (v0.15+)
- KiCad **9** for layout (the generated `.kicad_pcb` uses the KiCad 9
  format; KiCad 8 will refuse to open it)
- atopile VS Code / Cursor extension for the sidebar UI, build button and
  manufacturing export wizard

## Workflow

```sh
ato build                 # compile, pick parts, refresh layouts/default/default.kicad_pcb
```

Then open `layouts/default/default.kicad_pcb` in KiCad and place/route.
Re-running `ato build` preserves your layout and only syncs
added/removed/changed components.

Build artifacts land in `build/builds/default/` (BOM csv/json, power tree,
pinout report, variable report).

**Warning — do not save the board from KiCad 10 before running
`ato build`.** KiCad 10 rewrites the file in its new format (per-track
`(net "name")` references, no net table, nested `tenting`/`covering`
stackup tokens) which atopile 0.15.x cannot parse, and `ato build` will
then regenerate stale placement. The routed board in git is the source
of truth; if KiCad 10 re-saves it, restore with
`git checkout -- layouts/default/default.kicad_pcb`.

## Fabrication outputs

`fab/` contains ready-to-upload JLCPCB files generated from the routed
board with `kicad-cli` (gerbers + drill in `lightbar-dock-gerbers.zip`,
`bom_jlcpcb.csv`, `cpl_jlcpcb.csv`). Order flow: upload the zip, pick
2-layer / 1oz, enable PCB Assembly (top side), upload BOM + CPL, and
review every footprint in their placement preview — especially the 8
vertical USB-C plugs and the two rotated buck ICs.

### Rev 1.0 as-built (ordered 2026-07-04)

`bom_jlcpcb.csv` reflects the parts actually ordered. Three lines were
substituted at order time due to JLC stock (electrically equivalent or
better; atopile's original picks in parentheses):

| Refs | Part ordered | LCSC | Notes |
|---|---|---|---|
| L1, L2 | Sunlord SWPA8040S4R7NT 4.7µH | C36417 | (was 5.6µH C96972) higher rated/sat current; ripple ~1.0A p-p, fine |
| R7, R11 | RALEC RTT023401FTH 3.4kΩ 1% | C102987 | (was C4940) same value, sets buck fsw |
| R52 | YAGEO RC0402FR-0710KL 10kΩ 1% | C60490 | (was C25744) power LED series R |

USB2-9 plugs (C399938) were bought into the JLC parts library via
parts pre-order (40 pcs).

## Assembly

The entire board is JLC-assemblable — every part including the vertical
plugs is in JLC's PCBA library. The barrel jack is the only through-hole
part; select Standard assembly (or Economic + THT option) so JLC solders
it too. Zero hand assembly required.

## Known part caveats

- **Vertical plug (C399938)**: verify gender/orientation against the
  datasheet 3D model before ordering a full run, or spend ~$5 on samples
  from LCSC first — LCSC's listing metadata for Chinese-brand USB
  connectors is occasionally wrong. A 24P alternative is C2763096.
- **3D model for C399938**: EasyEDA/LCSC has no 3D model for this plug, so
  this repo includes one built from the datasheet drawing — see
  `parts/Jing_Extension_of_the_Electronic_Co_918_118A2021Y40006/USB-C-SMD_918-118A2021Y40006.step`
  (Jing Extension 918-118A2021Y40006, vertical USB-C 3.1 male plug, SMD).
  Free to reuse; the cadquery generator script is alongside it.
- The USB-C plug is not a structural mount. The 3D-printed top shell must
  cradle the bars so the connector only carries electrical load. Plug
  mated height is ~8.65mm.
- Barrel jack pin 3 (insertion detect) is intentionally unconnected.

## Layout notes

- Board is 240 x 42 mm, 2-layer; 8 identical port channels on a 22.5 mm
  pitch in a single row; comparators behind their 4 ports; bucks and input
  stage at the left end. Run `python3 place_board.py` after any
  `ato build` to re-apply placement (tune the constants at the top).
- Pitch rationale: the Gritin bars are ~10.5 mm thick (17 mm at the bulge)
  and stack face-to-face, so 22.5 mm leaves ~5 mm for printed divider
  walls. The port sits on the bottom end face of the bar, long axis
  across the bar's width, which is why the plugs are rotated 90 degrees.
- M3 mounting holes in the corners for the printed shell (add in KiCad;
  `standardize_designators` is disabled in `ato.yaml` due to an upstream
  bug with no-silkscreen footprints).

## Routing status (done)

The board is fully routed and passes connectivity (0 unconnected items):

- Bulk routing by Freerouting 2.2.4 headless (via `export_dsn.py` +
  Specctra SES import), finishing passes and repairs with
  KiCadRoutingTools (A* grid router, patched locally to respect actual
  widths of existing tracks/vias when building its obstacle map).
- GND is a B.Cu plane with ~80 stitching vias
  (`route_planes.py --nets lv --plane-layers B.Cu`), plus via-in-pad
  under both TPS54560 PowerPADs.
- Escape stubs for the PD receptacle's fine-pitch pads (VBUS, CC1/CC2,
  D+/D-) were placed programmatically; nothing was routed by hand in a
  GUI.
- DRC: 4 remaining violations, all footprint-internal artifacts of the
  USB-C receptacle (locating-peg annular width x2, peg-to-pad hole
  clearance x2). Waive them; they ship on every board using this part.
- Design rules relaxed to JLCPCB 2-layer capabilities: 0.127 mm default
  clearance, min via 0.45/0.25 mm (six 0.45 mm vias exist in the dense
  corridor under the PD receptacle — JLC charges nothing extra for
  0.25 mm drill on 2-layer).
- Power: 12V rail 1.2 mm; 5V rails 1.2-1.5 mm on F.Cu with a 2.0 mm
  B.Cu feeder along the bottom edge for buck B's four ports; per-port
  VBUS 0.8 mm.
