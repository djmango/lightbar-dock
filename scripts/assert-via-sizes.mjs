#!/usr/bin/env bun

/**
 * Hard fab gate: every pcb_via must be >= 0.6 mm pad / 0.3 mm hole.
 * Run after build:circuit (and after any Freerouting pass).
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const MIN_HOLE = 0.3
const MIN_PAD = 0.6
const circuit = JSON.parse(
  await readFile(
    resolve(import.meta.dirname, "../build/lightbar-dock.circuit.json"),
    "utf8",
  ),
)
const vias = circuit.filter((e) => e.type === "pcb_via")
const illegal = vias.filter((via) => {
  const hole = via.hole_diameter ?? 0
  const outer = via.outer_diameter ?? 0
  return hole + 1e-9 < MIN_HOLE || outer + 1e-9 < MIN_PAD
})

console.log(`vias: ${vias.length}, illegal: ${illegal.length}`)
if (illegal.length) {
  for (const via of illegal.slice(0, 20)) {
    console.error(
      `  hole=${via.hole_diameter} outer=${via.outer_diameter} at (${via.x},${via.y})`,
    )
  }
  process.exit(1)
}
