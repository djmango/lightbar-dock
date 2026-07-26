# lightbar-dock

A 1×8 USB-C charging dock for stick-anywhere rechargeable light bars. Bars
plug vertically onto upward-facing USB-C plugs; each port has a red/green
status LED driven from measured charge current and CC attach.

![Assembled board render](docs/images/render-hero.png)

## Specs (single source of truth)

**[`docs/SPECS.md`](docs/SPECS.md)** — product, power budget, per-port channel,
indicators, and mechanical notes.

Do not copy those numbers into other markdown files; link to SPECS instead.

| Concern | Where |
| --- | --- |
| Schematic / PCB | `circuit/` (`circuit/index.circuit.tsx`) |
| Thresholds / timing | `firmware/status-controller/include/status_config.h` |
| MCU pin map / flash | `firmware/status-controller/README.md` |
| Fab gates / IC sign-off | `docs/DESIGN_ASSURANCE.md` |
| Order checklist | `ORDERING.md` |
| Rev‑1 history | `docs/HISTORY.md` |

## Architecture (overview)

![Power architecture](docs/images/diagram-power.svg)

![Port channel](docs/images/diagram-port.svg)

(Diagram sources: `docs/*.mmd`. Regenerate with
`npx @mermaid-js/mermaid-cli -i docs/diagram-power.mmd -o docs/images/diagram-power.svg -t neutral -b white`.)

V3 keeps the dual-buck power path and vertical charge plugs; status is
**CH32V203F6P6** + INA3221 + CC muxes + common-anode RGB LEDs (not LM339).
Details: [`docs/SPECS.md`](docs/SPECS.md).

## Board

Top-down: power input and bucks on the left, eight ports on 22.5 mm pitch,
status LEDs on the front edge aligned with each receptacle:

![Top-down board render](docs/images/render-top.png)

![Back silkscreen legend](docs/images/render-back.png)

![Power input end](docs/images/render-power-end.png)

![Port channels](docs/images/render-ports.png)

Routed V3 copper / 3D exports (when regenerated): `docs/images/v3-routed-*`,
`generated/renders/`, `generated/kicad/v3-routed.kicad_pcb`.

## Toolchain

- Node.js 24+, npm, packages from `package-lock.json`
- [Bun](https://bun.sh) on `PATH` (`tsci` is a bun script)
- tscircuit `0.0.2096` (pinned)
- KiCad 10 CLI for DRC / SVG / STEP / gerbers (macOS app or Linux AppImage;
  see `scripts/kicad-env.mjs`)
- RISC-V GCC + pinned ch32fun for MCU firmware
- **Topola** (Rust Specctra autorouter) via git submodule `third_party/topola`
- Java 25+ + `third_party/freerouting/` as emergency fallback only

## Workflow

```sh
bun run setup:toolchain   # bun install + Topola + pcbkit
bun run verify            # test + tsci check + build + electrical + vias
bun run pcbkit:route      # Rust circuit-json route (primary)
bun run pcbkit:assure     # gates vs pinned manufacturing PCB
bun run autoroute:pcbkit  # optional: tscircuit HTTP adapter → pcbkit
bun run pcbkit:attach-3d  # STEP models from parts/ → generated/kicad/…-3d.kicad_pcb
open generated/kicad/v3-manufacturing-3d.kicad_pro   # view routed board + 3D in KiCad
# Unrouted placement from current circuit (also gets attach-3d):
#   bun run export:kicad && open generated/kicad/default.kicad_pro
```

Routing/IR is **Rust** (`pcbkit` + Topola). Bun only runs tscircuit/scripts glue.
tscircuit editor autorouting: see [`packages/pcbkit-tscircuit/`](packages/pcbkit-tscircuit/).
3D: `pcbkit attach-3d` downloads STEPs from `modelcdn.tscircuit.com` (EasyEDA + jscad)
into `generated/kicad/3dmodels/` — not the legacy `parts/` tree.

Circuit JSON → `build/`. Pinned manufacturing board → `ci/artifacts/`.
Refresh `fab/` only after DRC is manufacturing-clean. See
[`docs/DESIGN_ASSURANCE.md`](docs/DESIGN_ASSURANCE.md) and
[`ORDERING.md`](ORDERING.md).

### Status-controller firmware

```sh
./scripts/fetch-ch32fun.sh
make -C firmware/status-controller verify-ch32fun build
# Flash: USB1 + BOOT0 (wchisp) — firmware/status-controller/README.md
```

## Fabrication

Order V3 from `ci/artifacts/` (or a refreshed `fab/`) after `bun run verify`
and `bun run pcbkit:assure`. JLCPCB: 2-layer / 1 oz, PCBA top side, BOM + CPL;
review every footprint in their placement preview (vertical USB-C plugs and
buck ICs).

Full checklist: [`ORDERING.md`](ORDERING.md).

## Known part caveats

- **Vertical plug (C399938)**: verify gender/orientation against the
  datasheet 3D model (or LCSC samples) before a full run. 24P alt: C2763096.
- **C399938 positioning slots**: manufacturer footprint uses 0.60 × 1.80 mm
  plated slots; production tabs can sit loose in reflow. Measure tabs before
  tightening slots (tab max + ~0.10 mm width / 0.15–0.20 mm length, within
  JLC plated-slot tolerance).
- **3D model for C399938**: repo includes a datasheet-built STEP under
  `parts/Jing_Extension_of_the_Electronic_Co_918_118A2021Y40006/`.
- The plug is not structural — the printed shell must cradle the bars.
- Barrel jack pin 3 (insertion detect) is intentionally unconnected.
