#!/usr/bin/env bun
/**
 * Rewrite circuit/kicad/tscircuit.pretty/*.kicad_mod from a representative
 * embedded footprint on the manufacturing PCB so KiCad lib_footprint_mismatch
 * goes to zero (pad angle/size form, silk, etc.).
 *
 *   bun scripts/sync-fp-lib-from-board.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const pcbPath = resolve(root, "ci/artifacts/v3-manufacturing.kicad_pcb")
const pretty = resolve(root, "circuit/kicad/tscircuit.pretty")

/** @type {{ lib: string, ref: string }[]} */
const SYNC = [
  { lib: "resistor_res0402", ref: "R52" },
  { lib: "resistor_res1206", ref: "R47" },
  { lib: "SS54", ref: "D5" },
  { lib: "TYPE-C_16PIN_2MD(073)", ref: "USB1" },
  { lib: "918-118A2021Y40006", ref: "USB2" },
]

function extractFootprints(text) {
  const out = []
  const re = /\n\t\(footprint "/g
  let m
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
    const block = text.slice(from, i)
    const ref = /\(property "Reference" "([^"]+)"/.exec(block)?.[1]
    out.push({ ref, block })
  }
  return out
}

function boardBlockToLibMod(block, libName) {
  let t = block
  // drop leading tab indent one level → library uses single tab under root
  t = t.replace(/^\t/gm, "")
  // name
  t = t.replace(
    /^\(footprint "tscircuit:[^"]+"/,
    `(footprint "${libName}"`,
  )
  // strip instance fields
  t = t.replace(/\n\t\(uuid "[^"]*"\)/g, "")
  t = t.replace(/\n\t\(at [-\d.]+ [-\d.]+(?: [-\d.]+)?\)/g, "")
  t = t.replace(/\n\t\(path [^\n]+\)/g, "")
  t = t.replace(/\n\t\(sheetpath[\s\S]*?\n\t\)/g, "")
  t = t.replace(/\n\t\(attr [^\n]+\)/g, "")
  // strip nets from pads
  t = t.replace(/\n\t\t\(net [^\n]+\)/g, "")
  // reset reference/value placeholders
  t = t.replace(
    /\(property "Reference" "[^"]*"/,
    '(property "Reference" "REF**"',
  )
  t = t.replace(/\(property "Value" "[^"]*"/, '(property "Value" "' + libName + '"')
  // strip 3D models (board-local paths)
  t = t.replace(/\n\t\(model[\s\S]*?\n\t\)/g, "")
  // ensure version/generator header if missing
  if (!/\(version /.test(t)) {
    t = t.replace(
      /^\(footprint "[^"]+"\n/,
      (h) =>
        h +
        '\t(version 20260206)\n\t(generator "pcbnew")\n\t(generator_version "10.0")\n',
    )
  }
  if (!t.endsWith("\n")) t += "\n"
  return t
}

const pcb = readFileSync(pcbPath, "utf8")
const fps = extractFootprints(pcb)
mkdirSync(pretty, { recursive: true })

let n = 0
for (const { lib, ref } of SYNC) {
  const fp = fps.find((f) => f.ref === ref)
  if (!fp) {
    console.error(`missing ref ${ref} on board`)
    process.exit(1)
  }
  const mod = boardBlockToLibMod(fp.block, lib)
  const out = resolve(pretty, `${lib}.kicad_mod`)
  writeFileSync(out, mod)
  console.log(`synced ${lib}.kicad_mod ← ${ref} (${mod.length} bytes)`)
  n++
}
console.log(`sync-fp-lib-from-board OK (${n} libs)`)
