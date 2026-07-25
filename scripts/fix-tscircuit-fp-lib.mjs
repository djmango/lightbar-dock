#!/usr/bin/env bun
console.error(
  "Retired: KiCad Python / pcbnew path removed from this repo.\n" +
    "Use Rust pcbkit + pinned manufacturing artifact:\n" +
    "  bun run pcbkit:build\n" +
    "  bun run pcbkit:route\n" +
    "  bun run pcbkit:assure\n" +
    "  ./pcbkit/target/release/pcbkit drc-gate -j <drc.json>",
)
process.exit(1)
