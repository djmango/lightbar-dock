#!/usr/bin/env bun
/**
 * Remove F.SilkS fp_line shell outlines that clip board edge / pads / mask:
 *   - TYPE-C_16PIN (USB1 overhang + mounting pads)
 *   - 918 charge ports (pad/mask clip)
 *   - SS54 (D5/D6 silk over nearby resistors)
 *
 * Updates library .kicad_mod and embedded copies in ci/artifacts PCBs.
 * Courtyard / Fab graphics + hidden Reference properties are kept.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

const targets = [
  "circuit/kicad/tscircuit.pretty/TYPE-C_16PIN_2MD(073).kicad_mod",
  "circuit/kicad/tscircuit.pretty/918-118A2021Y40006.kicad_mod",
  "circuit/kicad/tscircuit.pretty/SS54.kicad_mod",
  "ci/artifacts/v3-for-route.kicad_pcb",
  "ci/artifacts/v3-manufacturing.kicad_pcb",
]

const FP_NAMES = new Set([
  "TYPE-C_16PIN_2MD(073)",
  "tscircuit:TYPE-C_16PIN_2MD(073)",
  "918-118A2021Y40006",
  "tscircuit:918-118A2021Y40006",
  "SS54",
  "tscircuit:SS54",
])

/** Remove any (fp_line …) sexpr whose layer is F.SilkS. */
function stripSilkFpLines(text) {
  let n = 0
  let out = ""
  let i = 0
  while (i < text.length) {
    const idx = text.indexOf("(fp_line", i)
    if (idx < 0) {
      out += text.slice(i)
      break
    }
    // include preceding newline if present
    let start = idx
    if (start > 0 && text[start - 1] === "\n") start--
    // walk sexpr
    let depth = 0
    let j = idx
    for (; j < text.length; j++) {
      const c = text[j]
      if (c === "(") depth++
      else if (c === ")") {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
    }
    const block = text.slice(start, j)
    out += text.slice(i, start)
    if (/\(layer "F\.SilkS"\)/.test(block)) {
      n++
      // drop block (and a trailing newline already handled via start)
    } else {
      out += text.slice(start, j)
    }
    i = j
  }
  return { text: out, n }
}

function rewritePcb(text) {
  const re = /\n\t\(footprint "/g
  let m
  const chunks = []
  let last = 0
  let total = 0
  let hits = 0
  while ((m = re.exec(text))) {
    const from = m.index + 1
    let depth = 0
    let i = from
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === "(") depth++
      else if (c === ")") {
        depth--
        if (depth === 0) {
          i++
          break
        }
      }
    }
    chunks.push(text.slice(last, from))
    let block = text.slice(from, i)
    const name = /^\t?\(footprint "([^"]+)"/.exec(block)?.[1]
    if (name && FP_NAMES.has(name)) {
      hits++
      const r = stripSilkFpLines(block)
      block = r.text
      total += r.n
    }
    chunks.push(block)
    last = i
  }
  chunks.push(text.slice(last))
  return { text: chunks.join(""), n: total, hits }
}

let sum = 0
for (const rel of targets) {
  const path = resolve(root, rel)
  if (!existsSync(path)) {
    console.warn("skip missing", rel)
    continue
  }
  const before = readFileSync(path, "utf8")
  let after = before
  let n = 0
  let extra = ""
  if (rel.endsWith(".kicad_pcb")) {
    const r = rewritePcb(before)
    after = r.text
    n = r.n
    extra = ` (matched ${r.hits} footprints)`
  } else {
    const r = stripSilkFpLines(before)
    after = r.text
    n = r.n
  }
  if (after !== before) writeFileSync(path, after)
  console.log(
    n
      ? `${rel}: removed ${n} F.SilkS fp_lines${extra}`
      : `${rel}: no silk fp_lines to remove${extra}`,
  )
  sum += n
}

console.log(`fix-silk-hygiene OK (${sum} edits)`)
