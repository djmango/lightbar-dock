#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"

const root = resolve(import.meta.dirname, "..")
const input = resolve(root, "layouts/default/default.kicad_pcb")
const output = resolve(root, "circuit/migration/baseline.circuit.json")
const report = resolve(root, "circuit/migration/import-report.json")

function extractAtopileMap(kicadPcb) {
  const entries = {}
  for (const block of kicadPcb.split(/\n(?=\t\(footprint )/).slice(1)) {
    const reference = block.match(
      /\(property "Reference" "([^"]+)"/,
    )?.[1]
    const address = block.match(
      /\(property "atopile_address" "([^"]+)"/,
    )?.[1]
    const at = block.match(/^\t\t\(at ([\d.-]+) ([\d.-]+)(?: ([\d.-]+))?\)/m)
    if (reference && address) {
      entries[address] = {
        reference,
        x: at ? Number(at[1]) : null,
        y: at ? Number(at[2]) : null,
        rotation: at?.[3] ? Number(at[3]) : 0,
      }
    }
  }
  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  )
}

function addLegacyNetIds(kicadPcb) {
  // KiCad 10 stores `(net "name")` directly on pads/tracks and omits the
  // board-level numeric net table. kicadts 0.0.x still expects KiCad 9's
  // `(net id "name")` representation, so normalize only the in-memory import.
  const names = [
    ...new Set(
      [...kicadPcb.matchAll(/\(net "((?:\\.|[^"])*)"\)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort()
  const ids = new Map(names.map((name, index) => [name, index + 1]))
  const withIds = kicadPcb.replace(
    /\(net "((?:\\.|[^"])*)"\)/g,
    (_, name) => `(net ${ids.get(name)} "${name}")`,
  )
  const declarations = [
    '\t(net 0 "")',
    ...names.map((name) => `\t(net ${ids.get(name)} "${name}")`),
  ].join("\n")
  return {
    content: withIds.replace(
      /\n\t\(footprint /,
      `\n${declarations}\n\t(footprint `,
    ),
    netCount: names.length,
  }
}

const inputContent = await readFile(input, "utf8")
const normalized = addLegacyNetIds(inputContent)
const converter = new KicadToCircuitJsonConverter()
converter.addFile(input, normalized.content)
converter.runUntilFinished()

const circuitJson = converter.getOutput()
const sourceComponentsById = new Map(
  circuitJson
    .filter((element) => element.type === "source_component")
    .map((element) => [element.source_component_id, element]),
)
const sourcePortsById = new Map(
  circuitJson
    .filter((element) => element.type === "source_port")
    .map((element) => [element.source_port_id, element]),
)
const sourcePortNets = new Map()
for (const trace of circuitJson.filter(
  (element) => element.type === "source_trace",
)) {
  for (const portId of trace.connected_source_port_ids ?? []) {
    sourcePortNets.set(portId, trace.display_name)
  }
}
const pinNet = (reference, pinNumber) => {
  const componentId = [...sourceComponentsById.entries()].find(
    ([, component]) => component.name === reference,
  )?.[0]
  const sourcePort = [...sourcePortsById.values()].find(
    (port) =>
      port.source_component_id === componentId &&
      String(port.pin_number) === String(pinNumber),
  )
  return sourcePort ? sourcePortNets.get(sourcePort.source_port_id) ?? null : null
}
const importReport = {
  source: "layouts/default/default.kicad_pcb",
  generatedBy: "scripts/import-kicad.mjs",
  normalizedKiCad10Nets: normalized.netCount,
  componentsByAtopileAddress: extractAtopileMap(inputContent),
  chargePortNets: Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const usb = `USB${index + 2}`
      const shunt = `R${23 + index * 4}`
      return [
        String(index),
        {
          cc1: pinNet(usb, 3),
          cc2: pinNet(usb, 11),
          shuntIn: pinNet(shunt, 1),
          shuntOut: pinNet(shunt, 2),
        },
      ]
    }),
  ),
  powerNets: {
    bankA5v: pinNet("F1", 1),
    bankB5v: pinNet("F5", 1),
    ground: pinNet("USB2", 1),
  },
  warnings: converter.getWarnings(),
  stats: converter.getStats(),
  elementCounts: Object.fromEntries(
    Object.entries(
      circuitJson.reduce((counts, element) => {
        counts[element.type] = (counts[element.type] ?? 0) + 1
        return counts
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b)),
  ),
}

await writeFile(output, `${JSON.stringify(circuitJson, null, 2)}\n`)
await writeFile(report, `${JSON.stringify(importReport, null, 2)}\n`)

console.log(`Imported ${circuitJson.length} elements to ${output}`)
console.log(JSON.stringify(importReport, null, 2))
