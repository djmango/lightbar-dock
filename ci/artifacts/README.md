# Pinned manufacturing + route inputs

| File | Role |
|---|---|
| `v3-manufacturing.kicad_pcb` / `.kicad_pro` | Fab golden — CI DRC + `pcbkit pin` |
| `manifest.toml` | sha256 pins for the fab golden |
| `v3-for-route.kicad_pcb` / `.dsn` / `.kicad_pro` | Unrouted board + Specctra DSN for `board:make` |

## DSN regeneration

When **placement** changes, re-export Specctra DSN from KiCad:

1. Open `v3-for-route.kicad_pcb` (or the new unrouted export)
2. **File → Export → Specctra DSN**
3. Replace `ci/artifacts/v3-for-route.dsn` (and keep the PCB/pro in sync)

Routing copper changes do **not** require a new DSN — only footprint moves / netlist/pad changes do.

## Refresh fab pin after a green `board:make`

```bash
bun run board:make -- --pin    # local, with Docker or kicad-cli
# or copy workflow artifact board-make-filled → ci/artifacts and update manifest.toml
```
