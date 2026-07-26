#!/usr/bin/env bun
/**
 * Drop footprint-level "Supplier Part Number" properties from shared packages.
 * LCSC / JLCPCB numbers belong on the symbol/BOM (circuit-json), not the
 * shared .kicad_mod — different values on the same package were tripping
 * KiCad lib_footprint_mismatch.
 *
 * Sexpr-aware (does not use naive regex over nested parens).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")

const SHARED_LIBS = [
  "resistor_res0402",
  "resistor_res1206",
  "SS54",
  "TYPE-C_16PIN_2MD(073)",
  "918-118A2021Y40006",
]

const SHARED_FP_NAMES = new Set([
  ...SHARED_LIBS,
  ...SHARED_LIBS.map((n) => `tscircuit:${n}`),
])

function stripSupplierPnInText(text) {
  const needle = '(property "Supplier Part Number"'
  let n = 0
  let out = ""
  let i = 0
  while (i < text.length) {
    const idx = text.indexOf(needle, i)
    if (idx < 0) {
      out += text.slice(i)
      break
    }
    let start = idx
    if (start > 0 && text[start - 1] === "\n") start--
    const paren = text.indexOf("(", idx)
    let depth = 0
    let j = paren
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
    out += text.slice(i, start)
    n++
    i = j
  }
  return { text: out, n }
}

function stripInPcb(text) {
  const re = /\n\t\(footprint "/g
  let m
  const chunks = []
  let last = 0
  let total = 0
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
    if (name && SHARED_FP_NAMES.has(name)) {
      const r = stripSupplierPnInText(block)
      block = r.text
      total += r.n
    }
    chunks.push(block)
    last = i
  }
  chunks.push(text.slice(last))
  return { text: chunks.join(""), n: total }
}

let sum = 0
for (const lib of SHARED_LIBS) {
  const rel = `circuit/kicad/tscircuit.pretty/${lib}.kicad_mod`
  const path = resolve(root, rel)
  if (!existsSync(path)) continue
  const before = readFileSync(path, "utf8")
  const { text: after, n } = stripSupplierPnInText(before)
  if (n) writeFileSync(path, after)
  console.log(`${rel}: removed ${n}`)
  sum += n
}

for (const rel of [
  "ci/artifacts/v3-for-route.kicad_pcb",
  "ci/artifacts/v3-manufacturing.kicad_pcb",
]) {
  const path = resolve(root, rel)
  const before = readFileSync(path, "utf8")
  const { text: after, n } = stripInPcb(before)
  if (n) writeFileSync(path, after)
  console.log(`${rel}: removed ${n}`)
  sum += n
}

console.log(`strip-fp-supplier-pn OK (${sum})`)
