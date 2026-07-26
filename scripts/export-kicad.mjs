#!/usr/bin/env bun
/**
 * Export unrouted KiCad PCB (+ project) from build/lightbar-dock.circuit.json.
 *
 * Avoids `tsci export -f kicad_pcb`, which hangs on renderUntilSettled for this board.
 * Run `bun run build:circuit` first (or this script will).
 *
 * After write, runs `pcbkit attach-3d` (downloads STEPs from modelcdn.tscircuit.com).
 * For the routed manufacturing board with 3D:
 *   bun run pcbkit:attach-3d && open generated/kicad/v3-manufacturing-3d.kicad_pro
 */
import { mkdir, readFile, writeFile, access, copyFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { spawn } from "node:child_process"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "circuit-json-to-kicad"

const root = resolve(import.meta.dirname, "..")
const circuitPath = resolve(root, "build/lightbar-dock.circuit.json")
const outDir = resolve(root, "generated/kicad")
const pcbOut = resolve(outDir, "default.kicad_pcb")
const unroutedOut = resolve(outDir, "v3-unrouted.kicad_pcb")
const proOut = resolve(outDir, "default.kicad_pro")
const pcbkit = resolve(root, "pcbkit/target/release/pcbkit")

function run(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    })
    child.on("exit", (c) =>
      c === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(" ")} → ${c}`)),
    )
  })
}

async function ensureCircuitJson() {
  try {
    await access(circuitPath)
  } catch {
    console.log("building circuit json…")
    await run("bun", ["run", "build:circuit"])
  }
}

async function ensurePcbkit() {
  if (existsSync(pcbkit)) return
  console.log("building pcbkit…")
  await run("cargo", [
    "build",
    "--release",
    "--manifest-path",
    "pcbkit/Cargo.toml",
    "-p",
    "pcbkit-cli",
  ])
}

async function attach3d(pcbPath) {
  await ensurePcbkit()
  await run(pcbkit, ["attach-3d", "--pcb", pcbPath, "-o", pcbPath])
}

await ensureCircuitJson()
const circuitJson = JSON.parse(await readFile(circuitPath, "utf8"))
await mkdir(outDir, { recursive: true })

const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
pcb.runUntilFinished()
const pcbStr = pcb.getOutputString()
await writeFile(pcbOut, pcbStr)
await writeFile(unroutedOut, pcbStr)

const pro = new CircuitJsonToKicadProConverter(circuitJson, {
  projectName: "lightbar-dock",
  schematicFilename: "default.kicad_sch",
  pcbFilename: "default.kicad_pcb",
})
pro.runUntilFinished()
await writeFile(proOut, pro.getOutputString())

try {
  const proJson = JSON.parse(await readFile(proOut, "utf8"))
  const rules = proJson.board?.design_settings?.rules
  if (rules) {
    rules.min_hole_clearance = 0.18
    rules.min_clearance = Math.max(Number(rules.min_clearance) || 0, 0.15)
    rules.min_via_diameter = Math.max(Number(rules.min_via_diameter) || 0, 0.6)
    await writeFile(proOut, JSON.stringify(proJson, null, 2))
    console.log("patched design rules in", proOut)
  }
} catch (err) {
  console.warn("pro rules patch skipped:", err.message || err)
}

try {
  await attach3d(pcbOut)
  await copyFile(pcbOut, unroutedOut)
} catch (err) {
  console.warn("attach-3d skipped:", err.message || err)
}

console.log("wrote", pcbOut)
console.log("wrote", unroutedOut)
console.log("wrote", proOut)
