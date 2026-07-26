#!/usr/bin/env bun
/**
 * Remove `(at …)` from footprint property blocks on shared packages.
 * Hidden Reference/Value text positions are instance-rotation-dependent and
 * otherwise trip KiCad lib_footprint_mismatch even when copper matches.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const SHARED = [
  "resistor_res0402",
  "resistor_res1206",
  "SS54",
  "TYPE-C_16PIN_2MD(073)",
  "918-118A2021Y40006",
]
const NAMES = new Set([
  ...SHARED,
  ...SHARED.map((n) => `tscircuit:${n}`),
])

function stripAtInProperties(text) {
  let n = 0
  // Within a property sexpr, drop a lone (at ...) line.
  const out = text.replace(
    /(\(property "[^"]+"[\s\S]*?)(\n[ \t]*\(at [^\n]+\))([\s\S]*?\n[ \t]*\))/g,
    (whole, pre, atLine, post) => {
      // Only first-level property closes — heuristic: post should contain effects/layer
      if (!/\(layer |\(effects |\(hide /.test(pre + post)) return whole
      n++
      return pre + post
    },
  )
  return { text: out, n }
}

/** More reliable: walk property sexprs and drop (at) children. */
function stripAtWalk(text) {
  const needle = '(property "'
  let n = 0
  let out = ""
  let i = 0
  while (i < text.length) {
    const idx = text.indexOf(needle, i)
    if (idx < 0) {
      out += text.slice(i)
      break
    }
    const paren = text.lastIndexOf("(", idx)
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
    let prop = text.slice(paren, j)
    const cleaned = prop.replace(/\n[ \t]*\(at [^\n]+\)/g, () => {
      n++
      return ""
    })
    out += text.slice(i, paren) + cleaned
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
    if (name && NAMES.has(name)) {
      const r = stripAtWalk(block)
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
for (const lib of SHARED) {
  const rel = `circuit/kicad/tscircuit.pretty/${lib}.kicad_mod`
  const path = resolve(root, rel)
  if (!existsSync(path)) continue
  const before = readFileSync(path, "utf8")
  const { text: after, n } = stripAtWalk(before)
  writeFileSync(path, after)
  console.log(`${rel}: stripped ${n} property at`)
  sum += n
}
for (const rel of [
  "ci/artifacts/v3-for-route.kicad_pcb",
  "ci/artifacts/v3-manufacturing.kicad_pcb",
]) {
  const path = resolve(root, rel)
  const before = readFileSync(path, "utf8")
  const { text: after, n } = rewritePcb(before)
  writeFileSync(path, after)
  console.log(`${rel}: stripped ${n} property at`)
  sum += n
}
console.log(`normalize-fp-property-at OK (${sum})`)
