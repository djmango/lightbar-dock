#!/usr/bin/env node
/**
 * Export unrouted KiCad PCB (+ project) from build/lightbar-dock.circuit.json.
 *
 * Avoids `tsci export -f kicad_pcb`, which hangs on renderUntilSettled for this board.
 * Run `npm run build:circuit` first (or this script will).
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
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

async function ensureCircuitJson() {
  try {
    await access(circuitPath)
  } catch {
    console.log("building circuit json…")
    await new Promise((resolvePromise, reject) => {
      const child = spawn("npm", ["run", "build:circuit"], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      })
      child.on("exit", (c) =>
        c === 0 ? resolvePromise() : reject(new Error(`build:circuit ${c}`)),
      )
    })
  }
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

// Normalize tscircuit footprint lib paths when KiCad Python is available.
try {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(root, "scripts/fix-tscircuit-fp-lib.mjs"), pcbOut, unroutedOut],
      { cwd: root, stdio: "inherit", env: process.env },
    )
    child.on("exit", (c) =>
      c === 0 ? resolvePromise() : reject(new Error(`fix-fp-lib ${c}`)),
    )
  })
} catch (err) {
  console.warn("fp-lib normalize skipped:", err.message || err)
}

console.log("wrote", pcbOut)
console.log("wrote", unroutedOut)
console.log("wrote", proOut)
