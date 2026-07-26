#!/usr/bin/env bun
/**
 * Tighten silk hygiene on USB footprints used at the board edge / dense pads:
 *   - TYPE-C_16PIN: pull overhang silk inboard (~0.6mm) to clear Edge.Cuts
 *   - 918 charge ports: drop shell F.SilkS that clips solder mask / pads
 *
 * Updates library .kicad_mod and embedded copies in ci/artifacts PCBs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

const targets = [
  "circuit/kicad/tscircuit.pretty/TYPE-C_16PIN_2MD(073).kicad_mod",
  "circuit/kicad/tscircuit.pretty/918-118A2021Y40006.kicad_mod",
  "ci/artifacts/v3-for-route.kicad_pcb",
  "ci/artifacts/v3-manufacturing.kicad_pcb",
]

/** Pull USB1 tip silk from y=4.8075 / 4.6575 → 4.20 (board-edge clearance). */
function fixTypeCSilk(text) {
  let out = text
  const repls = [
    // vertical stub at local x=-4.5 toward tip
    {
      from: `(start -4.5 4.8075)\n\t\t(end -4.5 3.1875)`,
      to: `(start -4.5 4.2)\n\t\t(end -4.5 3.1875)`,
    },
    {
      from: `(start -4.5 4.8075)\n\t\t\t(end -4.5 3.1875)`,
      to: `(start -4.5 4.2)\n\t\t\t(end -4.5 3.1875)`,
    },
    // tip bar
    {
      from: `(start 4.5 4.8075)\n\t\t(end -4.5 4.8075)`,
      to: `(start 4.5 4.2)\n\t\t(end -4.5 4.2)`,
    },
    {
      from: `(start 4.5 4.8075)\n\t\t\t(end -4.5 4.8075)`,
      to: `(start 4.5 4.2)\n\t\t\t(end -4.5 4.2)`,
    },
    // right stub near tip
    {
      from: `(start 4.57 4.6575)\n\t\t(end 4.57 3.1875)`,
      to: `(start 4.57 4.2)\n\t\t(end 4.57 3.1875)`,
    },
    {
      from: `(start 4.57 4.6575)\n\t\t\t(end 4.57 3.1875)`,
      to: `(start 4.57 4.2)\n\t\t\t(end 4.57 3.1875)`,
    },
  ]
  let n = 0
  for (const { from, to } of repls) {
    if (out.includes(from)) {
      out = out.split(from).join(to)
      n++
    }
  }
  return { text: out, n }
}

/** Remove F.SilkS fp_line blocks (shell outline) from 918 charge-port footprint. */
function strip918SilkLines(text) {
  // Operate per-footprint occurrence for PCB files; whole file for .kicad_mod.
  const fpRe =
    /\(footprint (?:"918-118A2021Y40006"|"tscircuit:918-118A2021Y40006")[\s\S]*?\n\t\)/g
  let n = 0
  const out = text.replace(fpRe, (block) => {
    const cleaned = block.replace(
      /\n\t\t\(fp_line\n\t\t\t\(start[^\)]+\)\n\t\t\t\(end[^\)]+\)\n\t\t\t\(stroke\n\t\t\t\t\(width [^\)]+\)\n\t\t\t\t\(type [^\)]+\)\n\t\t\t\)\n\t\t\t\(layer "F\.SilkS"\)\n\t\t\t\(uuid "[^"]+"\)\n\t\t\)/g,
      () => {
        n++
        return ""
      },
    )
    return cleaned
  })
  // Library file uses single-tab indent under footprint root
  if (n === 0 && text.includes('footprint "918-118A2021Y40006"')) {
    const cleaned = text.replace(
      /\n\t\(fp_line\n\t\t\(start[^\)]+\)\n\t\t\(end[^\)]+\)\n\t\t\(stroke\n\t\t\t\(width [^\)]+\)\n\t\t\t\(type [^\)]+\)\n\t\t\)\n\t\t\(layer "F\.SilkS"\)\n\t\t\(uuid "[^"]+"\)\n\t\)/g,
      () => {
        n++
        return ""
      },
    )
    return { text: cleaned, n }
  }
  return { text: out, n }
}

let total = 0
for (const rel of targets) {
  const path = resolve(root, rel)
  if (!existsSync(path)) {
    console.warn("skip missing", rel)
    continue
  }
  let text = readFileSync(path, "utf8")
  const before = text
  if (rel.includes("TYPE-C") || text.includes("TYPE-C_16PIN_2MD(073)")) {
    const r = fixTypeCSilk(text)
    text = r.text
    if (r.n) console.log(`${rel}: TYPE-C silk tip pulled in (${r.n} patterns)`)
    total += r.n
  }
  if (rel.includes("918-118A") || text.includes("918-118A2021Y40006")) {
    const r = strip918SilkLines(text)
    text = r.text
    if (r.n) console.log(`${rel}: removed ${r.n} charge-port F.SilkS lines`)
    total += r.n
  }
  if (text !== before) writeFileSync(path, text)
}

if (total === 0) {
  console.error("fix-silk-hygiene: no edits applied")
  process.exit(1)
}
console.log(`fix-silk-hygiene OK (${total} edits)`)
