#!/usr/bin/env bun
console.error(
  "Retired: KiCad Python mutation path removed. Use Rust pcbkit:\n" +
    "  bun run pcbkit:build && bun run pcbkit:route\n" +
    "  bun run pcbkit:assure",
)
process.exit(1)
