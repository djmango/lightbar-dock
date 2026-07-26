# Pinned manufacturing + route inputs

| File | Role |
|---|---|
| `v3-manufacturing.kicad_pcb` / `.kicad_pro` | Fab golden — CI DRC + `pcbkit pin` |
| `manifest.toml` | sha256 pins for the fab golden |
| `v3-for-route.kicad_pcb` / `.dsn` / `.kicad_pro` | Unrouted board + Specctra DSN for `board:make` |
| `fp-lib-table` | Resolves `tscircuit:*` footprints for KiCad lib checks |

Silk / lib hygiene helpers (after footprint edits):

```bash
bun run fix:silk      # drop USB/SS54 F.SilkS shell lines that clip pads/edge
bun run fix:fp-lib    # strip shared-package Supplier PN + sync .pretty from board
```

## Placement → for-route → DSN refresh

When **placement / netlist / pads** change:

```bash
bun run export:kicad              # → generated/kicad/v3-unrouted.kicad_pcb
bun run for-route:promote         # copy into ci/artifacts + export DSN (Docker kicad)
# or, if Docker/pcbnew unavailable:
#   1. copy/promote PCB+pro into ci/artifacts/v3-for-route.*
#   2. KiCad GUI: File → Export → Specctra DSN
#   3. bun run dsn:check
bun run board:make -- --pin       # Freerouting → zone fill → DRC → refresh fab pin
```

Routing copper changes alone do **not** require a new DSN — only footprint moves / pad / netlist changes do.

`bun run dsn:check` (also part of `verify:ci`) fails if DSN placement drifts from `v3-for-route.kicad_pcb`.

## Refresh fab pin after a green `board:make`

```bash
bun run board:make -- --pin    # local, with Docker or kicad-cli
# or copy workflow artifact board-make-filled → generated/kicad + update manifest
```

CI also runs `board:make` on a schedule and when route inputs / pcbkit-route change
(see `.github/workflows/board-make.yml`). Fast PR CI still gates the pinned
manufacturing board in `build.yml`.
