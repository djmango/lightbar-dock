#!/usr/bin/env bun
/**
 * Build circuit JSON without tsci's renderUntilSettled() (hangs on this board).
 *
 * Uses a single RootCircuit.render() pass — enough for electrical / via gates.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const root = resolve(import.meta.dirname, "..")
const out = resolve(root, "build/lightbar-dock.circuit.json")
const entry = resolve(root, "circuit/index.circuit.tsx")

const require = createRequire(import.meta.url)

// Prefer project's tscircuit; fall back to @tscircuit/core RootCircuit.
let RootCircuit
try {
  ;({ RootCircuit } = await import("tscircuit"))
} catch {
  ;({ RootCircuit } = await import("@tscircuit/core"))
}

const circuit = new RootCircuit()
const mod = await import(pathToFileURL(entry).href)
const Board = mod.default
circuit.add(Board())
circuit.render()
const json = circuit.getCircuitJson()

await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(json))
console.log(`wrote ${out} (${json.length} elements)`)

// RootCircuit can leave timers/handles open; exit explicitly.
process.exit(0)