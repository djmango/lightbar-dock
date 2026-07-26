#!/usr/bin/env bun
/**
 * Full KiCad routing stack via pcbkit (Freerouting/Topola → SES → PCB).
 * No Python. Profile TOML only (no env config).
 *
 * Prefer `bun run board:make` for zone-fill + DRC. This script is route-only.
 *
 * Usage:
 *   bun scripts/route-board-pcbkit.mjs
 *   bun scripts/route-board-pcbkit.mjs -- --ses path/to.ses
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const pcbkit = resolve(root, "pcbkit/target/release/pcbkit")
const profile = resolve(root, "pcbkit/profiles/lightbar-dock.toml")
const extra = process.argv.slice(2)

function firstExisting(paths) {
  for (const p of paths) if (existsSync(p)) return p
  return null
}

const pcb = firstExisting([
  resolve(root, "generated/kicad/v3-for-route.kicad_pcb"),
  resolve(root, "ci/artifacts/v3-for-route.kicad_pcb"),
])
const dsn = firstExisting([
  resolve(root, "generated/kicad/v3-for-route.dsn"),
  resolve(root, "ci/artifacts/v3-for-route.dsn"),
])
const out = resolve(root, "generated/kicad/v3-routed-pcbkit.kicad_pcb")

async function run(cmd, args, cwd = root) {
  return new Promise((resolvePromise, reject) => {
    const c = spawn(cmd, args, { cwd, stdio: "inherit" })
    c.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} exit ${code}`)),
    )
  })
}

await run("bun", [resolve(root, "scripts/ensure-java.mjs")])

if (!existsSync(pcbkit)) {
  await run("cargo", ["build", "--release", "-p", "pcbkit-cli"], resolve(root, "pcbkit"))
}

if (!pcb || !dsn) {
  console.error(
    "missing unrouted PCB/DSN — need generated/kicad/v3-for-route.* or ci/artifacts/v3-for-route.*\n" +
      "DSN: File → Export → Specctra DSN from KiCad when placement changes.",
  )
  process.exit(1)
}

const args = [
  "route-board",
  "--pcb",
  pcb,
  "--dsn",
  dsn,
  "--profile",
  profile,
  "--out",
  out,
  // Empty GND outlines by default (omit --zones-from). Prefer `board:make` for fill+DRC.
  ...extra,
]
console.log("+", pcbkit, args.join(" "))
const child = spawn(pcbkit, args, { cwd: root, stdio: "inherit" })
const code = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)))
process.exit(code)
