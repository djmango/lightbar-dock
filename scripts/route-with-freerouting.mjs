#!/usr/bin/env bun
console.error(
  "Retired: KiCad Python / pcbnew path removed from this repo.\n" +
    "Full Specctra stack (Freerouting → SES → KiCad PCB):\n" +
    "  bun run route:board\n" +
    "Circuit-json IR route:\n" +
    "  bun run pcbkit:route\n" +
    "Assure / DRC gate:\n" +
    "  bun run pcbkit:assure\n" +
    "  ./pcbkit/target/release/pcbkit drc-gate -j <drc.json>",
)
process.exit(1)
