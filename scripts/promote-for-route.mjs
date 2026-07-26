#!/usr/bin/env bun
/**
 * Promote an unrouted KiCad export into ci/artifacts/v3-for-route.*
 * and refresh the Specctra DSN.
 *
 *   bun run export:kicad
 *   bun run for-route:promote          # from generated/kicad/v3-unrouted.kicad_pcb
 *   bun run for-route:promote -- --skip-dsn
 */
import { copyFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(import.meta.dirname, "..")
const args = process.argv.slice(2).filter((a) => a !== "--")
const skipDsn = args.includes("--skip-dsn")

const srcPcb = resolve(root, "generated/kicad/v3-unrouted.kicad_pcb")
const srcPro = firstExisting([
  resolve(root, "generated/kicad/v3-for-route.kicad_pro"),
  resolve(root, "generated/kicad/default.kicad_pro"),
  resolve(root, "ci/artifacts/v3-for-route.kicad_pro"),
])
const dstPcb = resolve(root, "ci/artifacts/v3-for-route.kicad_pcb")
const dstPro = resolve(root, "ci/artifacts/v3-for-route.kicad_pro")

function firstExisting(paths) {
  for (const p of paths) if (existsSync(p)) return p
  return null
}

if (!existsSync(srcPcb)) {
  console.error(
    `missing ${srcPcb}\nRun: bun run export:kicad`,
  )
  process.exit(1)
}
if (!srcPro) {
  console.error("missing .kicad_pro to promote beside for-route PCB")
  process.exit(1)
}

copyFileSync(srcPcb, dstPcb)
copyFileSync(srcPro, dstPro)
console.log("promoted", dstPcb)
console.log("promoted", dstPro)

// Keep fp-lib-table beside the project for KiCad DRC library checks.
const fpLib = resolve(root, "ci/artifacts/fp-lib-table")
if (!existsSync(fpLib)) {
  console.warn("warn: ci/artifacts/fp-lib-table missing")
}

if (skipDsn) {
  console.log("skipped DSN export (--skip-dsn); run bun run dsn:export")
  process.exit(0)
}

const r = spawnSync(
  process.execPath,
  [resolve(root, "scripts/export-dsn.mjs"), "ci/artifacts/v3-for-route.kicad_pcb", "ci/artifacts/v3-for-route.dsn"],
  { cwd: root, stdio: "inherit" },
)
process.exit(r.status ?? 1)
