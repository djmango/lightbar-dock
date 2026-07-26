#!/usr/bin/env bun
/**
 * Fail if Specctra DSN placement drifts from the matching .kicad_pcb.
 *
 *   bun run dsn:check
 *   bun run dsn:check -- ci/artifacts/v3-for-route.kicad_pcb ci/artifacts/v3-for-route.dsn
 *
 * KiCad DSN place coordinates with `(unit um)` are plain micrometres
 * (mm = value/1000, Y flipped). Placement-only gate — copper/net diffs ignored.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const args = process.argv.slice(2).filter((a) => a !== "--")
const pcbPath = resolve(
  root,
  args[0] || "ci/artifacts/v3-for-route.kicad_pcb",
)
const dsnPath = resolve(root, args[1] || "ci/artifacts/v3-for-route.dsn")
const tolMm = Number(process.env.DSN_PLACE_TOL_MM || "0.05")
const tolDeg = Number(process.env.DSN_PLACE_TOL_DEG || "0.5")

function die(msg) {
  console.error(msg)
  process.exit(1)
}

if (!existsSync(pcbPath)) die(`missing PCB: ${pcbPath}`)
if (!existsSync(dsnPath)) die(`missing DSN: ${dsnPath}`)

function parsePcbPlaces(text) {
  const places = []
  for (let i = 0; i < text.length; i++) {
    const idx = text.indexOf("(footprint", i)
    if (idx < 0) break

    let depth = 0
    let end = -1
    for (let j = idx; j < text.length; j++) {
      if (text[j] === "(") depth++
      else if (text[j] === ")") {
        depth--
        if (depth === 0) {
          end = j + 1
          break
        }
      }
    }
    if (end < 0) break

    const block = text.slice(idx, end)
    const fp = block.match(/^\(footprint\s+(?:\n\s*)?"([^"]+)"/)?.[1]
    const at = block.match(/\n\s*\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)/)
    const ref = block.match(/\(property\s+"Reference"\s+"([^"]+)"/)?.[1]
    if (fp && at && ref) {
      places.push({
        ref,
        x: +at[1],
        y: +at[2],
        rot: +(at[3] || 0),
        fp,
      })
    }
    i = end
  }
  return places
}

function parseDsnPlaces(text) {
  // Prefer `(unit um)` place coords as micrometres (KiCad Specctra export).
  const unit = /\(unit\s+(\w+)\)/.exec(text)?.[1] || "um"
  let toMm = 1000
  if (unit === "mm") toMm = 1
  else if (unit === "inch") toMm = 1 / 25.4
  else toMm = 1000

  const places = []
  for (const m of text.matchAll(
    /\(place\s+(\S+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+(front|back)\s+([-\d.eE+]+)/g,
  )) {
    places.push({
      ref: m[1],
      x: +m[2] / toMm,
      y: -(+m[3] / toMm),
      rot: +m[5],
      side: m[4],
    })
  }
  return places
}

function angDiff(a, b) {
  let d = ((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

const pcb = parsePcbPlaces(readFileSync(pcbPath, "utf8"))
const dsn = parseDsnPlaces(readFileSync(dsnPath, "utf8"))
const pcbMap = new Map(pcb.map((p) => [p.ref, p]))
const physicalDsn = dsn.filter((p) => !/^REF\d+$/.test(p.ref))
const dsnMap = new Map(physicalDsn.map((p) => [p.ref, p]))

const missing = []
const mismatches = []
for (const p of pcb) {
  const d = dsnMap.get(p.ref)
  if (!d) {
    missing.push(p.ref)
    continue
  }
  const dx = Math.abs(p.x - d.x)
  const dy = Math.abs(p.y - d.y)
  const dr = angDiff(p.rot, d.rot)
  if (dx > tolMm || dy > tolMm || dr > tolDeg) {
    mismatches.push({
      ref: p.ref,
      pcb: { x: p.x, y: p.y, rot: p.rot },
      dsn: { x: d.x, y: d.y, rot: d.rot },
      dx,
      dy,
      dr,
    })
  }
  dsnMap.delete(p.ref)
}
const extra = [...dsnMap.keys()]

console.log(
  `dsn:check pcb=${pcb.length} dsn=${dsn.length} tol=${tolMm}mm/${tolDeg}°`,
)
if (missing.length) {
  console.error(`missing in DSN (${missing.length}):`, missing.slice(0, 20).join(", "))
}
if (extra.length) {
  console.error(`extra in DSN (${extra.length}):`, extra.slice(0, 20).join(", "))
}
if (mismatches.length) {
  console.error(`placement mismatches (${mismatches.length}):`)
  for (const m of mismatches.slice(0, 20)) {
    console.error(
      `  ${m.ref}: pcb=(${m.pcb.x}, ${m.pcb.y}, ${m.pcb.rot}) ` +
        `dsn=(${m.dsn.x}, ${m.dsn.y}, ${m.dsn.rot}) ` +
        `Δ=(${m.dx.toFixed(3)}, ${m.dy.toFixed(3)}, ${m.dr.toFixed(2)}°)`,
    )
  }
}

if (missing.length || extra.length || mismatches.length) {
  console.error(
    "\nDSN is stale vs PCB placement. Re-export:\n" +
      "  bun run dsn:export\n" +
      "  # or KiCad GUI: File → Export → Specctra DSN",
  )
  process.exit(1)
}

console.log("dsn:check OK — placement matches")
