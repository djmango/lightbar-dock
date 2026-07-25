# Handoff: tscircuit V3 + Topola / grid finish

**Date:** 2026-07-24  
**Default branch:** `master`  
**PR context:** tscircuit migration, Topola submodule, Freerouting leftovers finished with grid A*

## Mission (what “done” means)

Electrically complete 2-layer board for the lightbar dock:

1. Source of truth in `circuit/` (tscircuit), not legacy KiCad-only design.
2. Manufacturing board under `generated/kicad/` (gitignored — rebuild locally).
3. **0 unconnected** ratsnest items.
4. **0 shorting / tracks_crossing** DRC errors.
5. Clearance / silk / lib-mismatch cleanup as follow-on polish.

As of this handoff: **(3) and (4) are met** on the local finished board. Clearance/silk/via-size noise remains.

## Current board state (local, not in git)

| Artifact | Path |
|----------|------|
| Finished PCB | `generated/kicad/v3-routed.kicad_pcb` |
| Synced default | `generated/kicad/default.kicad_pcb` |
| Clean Freerouting baseline (7 open nets) | `generated/kicad/v3-finish.kicad_pcb` |
| Snapshot after grid finish | `generated/kicad/v3-grid-finished.kicad_pcb` |
| Latest DRC JSON | `generated/reports/v3-drc.json` |

Last known counts (post-finish):

- Unconnected: **0**
- Shorts / crossings: **0**
- ~2926 segments / ~240 vias
- Remaining DRC: silk_over_copper (~70), clearance (~160), via_diameter, hole_clearance, lib_footprint_mismatch

`generated/` is gitignored. Rebuild routing before trusting CI/fab.

## Architecture

```text
circuit/index.circuit.tsx     tscircuit source of truth
        │
        ├─ bun run export:kicad / tsci → generated/kicad/*.kicad_pcb
        │
        ├─ bun run route:circuit      → Topola Specctra (DSN→SES) full route
        │                                 (good for greenfield / unrouted)
        │
        └─ bun run route:finish       → KiCad Python grid A*
                                          (safe on already-routed boards)
```

**Do not** finish a Freerouting-pre-routed board by `ImportSpecctraSES` of a Topola SES. That rewrote copper and exploded unconnected **7 → 191**. Prefer `route:finish` / `scripts/finish-remaining-grid.py`.

## Topola

| Item | Value |
|------|-------|
| Submodule | `third_party/topola` (`.gitmodules` → fork URL) |
| Upstream | https://codeberg.org/topola/topola |
| Fork / clone URL | https://github.com/djmango/topola |
| Feature branch | `feature/cli-multilayer-remaining` @ `5d10621` |
| Local patches | `contrib/topola/*.patch` (skip fanout / layer-mismatch panics) |
| Upstream PR | https://github.com/mikwielgus/topola/pull/1 (also Codeberg as applicable) |
| tscircuit issue | https://github.com/tscircuit/tscircuit/issues/4078 |

CLI flags added on the fork (build: `cargo build --release -p topola-cli`):

- `--multilayer` / `--planar`
- `--remaining`, `--nets`, `--skip-nets` (default `GND,gnd`)
- `--band-width`, `--via-radius`
- `--permutate` (default **off** — permutation hangs dense boards)
- `--timeout-initial`, `--timeout-progress-bonus` (default 0)
- `--wall-timeout` (hard abort, still writes SES)

Optional HTTP adapter: `packages/topola-autorouter/` → `bun run autoroute:server`.

## How to reproduce / continue locally

```sh
bun run setup:toolchain   # or: bun install + submodule + cargo build Topola
# Bun is required on PATH for `tsci` (https://bun.sh)

# Circuit checks (build:circuit uses bun + RootCircuit.render — see note below)
bun run verify
bun run smoke:autoroute   # Topola HTTP adapter, no KiCad

# Full Topola route from unrouted export (slow / may wall-timeout on dense board)
bun run route:circuit

# Finish leftovers on an already-routed board (preferred)
# Scripts resolve KiCad via scripts/kicad-env.mjs (macOS app or Linux AppImage).
bun run route:finish

# DRC (macOS example; on Linux use kicad-cli from the AppImage / PATH)
kicad-cli pcb drc \
  --format json --severity-all --units mm --refill-zones \
  -o generated/reports/v3-drc.json \
  generated/kicad/v3-routed.kicad_pcb
```

**KiCad on Linux:** extract the official `kicad-*-x86_64.AppImage` with
`--appimage-extract` into `~/tools/kicad/squashfs-root` (or set
`KICAD_APPIMAGE_ROOT` / `KICAD_CLI` / `KICAD_PYTHON`). Specctra export/import
and DRC run headless without a display.

Freerouting JARs are **not** in git (~118 MB). Place `freerouting-2.2.4.jar` under `third_party/freerouting/` if you need `bun run route:freerouting`.

## Key scripts

| Script | Role |
|--------|------|
| `scripts/route-with-topola.mjs` | Full Specctra Topola pipeline |
| `scripts/finish-remaining-grid.mjs` / `.py` | Safe leftover finish (bitmap A*) |
| `scripts/finish-remaining-topola.mjs` | **Dangerous** on pre-routed boards (SES import) |
| `scripts/fix-c42-route.py` | Targeted C42 escape fixer |
| `scripts/hand-finish-u7.py` | Experimental hand polylines (can short) |
| `scripts/import-ses-net.py` | Selective SES net import (incomplete polish) |
| `scripts/fix-tscircuit-fp-lib.mjs` | Restore `tscircuit` fp-lib paths |

## Design rules (project)

- Board min track / clearance: **0.15 mm**
- Default netclass often **0.20 mm** clearance / track (DRC reports use this)
- Netclass clearance was lowered to **0.15** in `generated/kicad/*.kicad_pro` locally to match board min — re-check before fab if you want 0.20 manufacturing margin
- SPECS: `docs/SPECS.md` (~0.2 mm GND pour clearance)

## What still needs a human

1. **Clearance cleanup** on grid-finish traces (many ~0.12–0.19 mm vs 0.15/0.20 rule). Prefer rip-up+re-route of finish nets with stricter keepout, or manual tidy in pcbnew around U7 / port CC nets.
2. **Via diameter / hole clearance** from finish vias — align to netclass (0.8/0.4) everywhere; dedupe stacked vias (`hole_to_hole`).
3. **Silk over copper** (~70) — refs/values hidden or moved; fp-lib already partially fixed via `fix-tscircuit-fp-lib`.
4. **lib_footprint_mismatch** — open `generated/kicad/default.kicad_pro` so `fp-lib-table` loads `circuit/kicad/tscircuit.pretty`.
5. **3D** — KiCad footprints have no STEP models; use `bunx tsci dev` / tscircuit `--3d` for visuals.
6. **Push Topola fork commits** and refresh submodule SHA if the PR submodule pointer drifts.
7. **CI** — `.github/workflows/build.yml` uses Bun; confirm runners have Bun, KiCad container, submodule init.
8. **Do not commit** `generated/` or Freerouting JARs.

## Hard-won failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Unconnected 7 → 191 after “finish” | Topola SES full import | Restore `v3-finish.kicad_pcb`; use grid finish |
| Topola hangs forever | `permutate` + progress_bonus on dense navmesh | `--wall-timeout`, `--permutate` off, skip GND |
| Grid “no path” on U7 pads | Fine pitch + keepout too fat | Thin width 0.15, lower keepout, multilayer |
| Grid shorts after validate=0 | Keepout weaker than DRC | Re-run with higher `FINISH_CLEAR_MM` / validate |
| `GetTracks()` SWIG blowup after `Remove` | KiCad 10 quirk | Snapshot track list before mutating |
| `tsci export` / `renderUntilSettled` hangs | Never settles on this board | `bun run build:circuit` / `bun run export:kicad` (circuit-json-to-kicad) |
| Route scripts fail on Linux | Hardcoded macOS KiCad.app paths | `scripts/kicad-env.mjs` + AppImage extract to `~/tools/kicad/squashfs-root` |
| Topola panics mid-route on dense board | Fanout / cross-layer asserts | Apply `contrib/topola/*.patch` via `bun run setup:toolchain` |

## Suggested next PR / work chunks

1. Clearance-only cleanup pass + DRC gate (`clearance` + `shorting` + `unconnected` = 0).
2. Silk/lib hygiene so UI DRC is quiet.
3. Upstream Topola PR refresh with wall-timeout / skip-GND commits.
4. Optional: selective SES importer that only adds one net’s wires (never full board rewrite).

## Contacts / links

- Repo: https://github.com/djmango/lightbar-dock
- Topola fork: https://github.com/djmango/topola
- Specs: `docs/SPECS.md`
- Assurance: `docs/DESIGN_ASSURANCE.md`
