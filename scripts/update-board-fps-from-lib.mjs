#!/usr/bin/env bun
/**
 * Update embedded footprints on ci/artifacts PCBs from tscircuit.pretty libs.
 * Preserves instance fields: placement, uuid, Reference, Value, pad nets,
 * path/sheetpath/attr. Clears lib_footprint_mismatch.
 *
 *   bun scripts/update-board-fps-from-lib.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const pretty = resolve(root, "circuit/kicad/tscircuit.pretty")

const LIBS = [
  "resistor_res0402",
  "resistor_res1206",
  "SS54",
  "TYPE-C_16PIN_2MD(073)",
  "918-118A2021Y40006",
]

const PCBS = [
  "ci/artifacts/v3-for-route.kicad_pcb",
  "ci/artifacts/v3-manufacturing.kicad_pcb",
]

function readLib(name) {
  const path = resolve(pretty, `${name}.kicad_mod`)
  if (!existsSync(path)) throw new Error(`missing lib ${path}`)
  let body = readFileSync(path, "utf8").trimEnd()
  // drop trailing closing paren of footprint — we rebuild
  if (!body.startsWith("(footprint ")) {
    throw new Error(`bad lib ${name}`)
  }
  return body
}

function extractInstance(block) {
  const place = /^\t\(footprint "[^"]+"\n\t\t(?:\(layer "[^"]+"\)\n\t\t)?(?:\(uuid "([^"]+)"\)\n\t\t)?\(at ([^\n]+)\)/.exec(
    block,
  )
  // more reliable line scan
  const lines = block.split("\n")
  let uuid = null
  let at = null
  let layer = "F.Cu"
  for (const line of lines.slice(0, 12)) {
    let m
    if ((m = /^\t\t\(uuid "([^"]+)"\)/.exec(line))) uuid = m[1]
    if ((m = /^\t\t\(at ([^\n]+)\)/.exec(line))) at = m[1]
    if ((m = /^\t\t\(layer "([^"]+)"\)/.exec(line))) layer = m[1]
  }
  const ref = /\(property "Reference" "([^"]+)"/.exec(block)?.[1]
  const value = /\(property "Value" "([^"]+)"/.exec(block)?.[1]
  const path = /^\t\t\(path ([^\n]+)\)/m.exec(block)?.[1]
  const sheetpath = /\n\t\t\(sheetpath[\s\S]*?\n\t\t\)/.exec(block)?.[0]
  const attr = /^\t\t\(attr ([^\n]+)\)/m.exec(block)?.[1]
  const nets = new Map()
  for (const m of block.matchAll(
    /\(pad "([^"]+)"[\s\S]*?\n\t\t\t\(net ([^\n]+)\)/g,
  )) {
    nets.set(m[1], m[2])
  }
  // models keep board-local 3d if present
  const model = /\n\t\t\(model[\s\S]*?\n\t\t\)/.exec(block)?.[0] || ""
  return { uuid, at, layer, ref, value, path, sheetpath, attr, nets, model }
}

function libToBoardBlock(libName, libText, inst) {
  // indent library body one extra tab and rename
  let body = libText
    .replace(/^\(footprint "[^"]+"/, `(footprint "tscircuit:${libName}"`)
    .replace(/\n/g, "\n\t") // indent all lines
  // body now starts with (footprint — need leading tab
  body = "\t" + body

  // Strip lib uuids / layer / version headers we'll re-inject.
  body = body.replace(/\n\t\t\t\(uuid "[^"]+"\)/g, "")
  body = body.replace(/\n\t\t\(uuid "[^"]+"\)/g, "")
  body = body.replace(/\n\t\t\(layer "[^"]+"\)/g, "")
  body = body.replace(/\n\t\t\(version [^\n]+\)/g, "")
  body = body.replace(/\n\t\t\(generator[^\n]*\)/g, "")
  body = body.replace(/\n\t\t\(generator_version[^\n]*\)/g, "")

  // Inject instance header fields after footprint name line
  const headerBits = []
  headerBits.push(`\t\t(layer "${inst.layer}")`)
  if (inst.uuid) headerBits.push(`\t\t(uuid "${inst.uuid}")`)
  if (inst.at) headerBits.push(`\t\t(at ${inst.at})`)
  body = body.replace(
    /^\t\(footprint "[^"]+"\n/,
    (h) => h + headerBits.join("\n") + "\n",
  )

  // Reference / Value texts
  if (inst.ref != null) {
    body = body.replace(
      /\(property "Reference" "[^"]*"/,
      `(property "Reference" "${inst.ref}"`,
    )
  }
  if (inst.value != null) {
    body = body.replace(
      /\(property "Value" "[^"]*"/,
      `(property "Value" "${inst.value}"`,
    )
  }

  // Pad nets
  if (inst.nets.size) {
    body = body.replace(
      /(\(pad "([^"]+)"[\s\S]*?\(layers [^\n]+\)\n)/g,
      (whole, _prefix, padNum) => {
        const net = inst.nets.get(padNum)
        if (!net) return whole
        if (/\(net /.test(whole)) {
          return whole.replace(/\(net [^\n]+\)\n/, `(net ${net})\n`)
        }
        return whole.replace(
          /(\(layers [^\n]+\)\n)/,
          `$1\t\t\t(net ${net})\n`,
        )
      },
    )
  }

  // path / sheetpath / attr before closing
  let extras = ""
  if (inst.path) extras += `\n\t\t(path ${inst.path})`
  if (inst.sheetpath) extras += inst.sheetpath
  if (inst.attr) extras += `\n\t\t(attr ${inst.attr})`
  extras += inst.model
  if (extras) {
    body = body.replace(/\n\t\)\s*$/, `${extras}\n\t)`)
  }

  if (!body.endsWith("\n")) body += "\n"
  return body
}

function updatePcb(text) {
  const libMap = new Map(LIBS.map((n) => [n, readLib(n)]))
  const nameSet = new Set([
    ...LIBS.map((n) => `tscircuit:${n}`),
  ])

  const re = /\n\t\(footprint "/g
  let m
  const chunks = []
  let last = 0
  let n = 0
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
    const fullName = /^\t?\(footprint "([^"]+)"/.exec(block)?.[1]
    const libName = fullName?.replace(/^tscircuit:/, "")
    if (fullName && nameSet.has(fullName) && libMap.has(libName)) {
      const inst = extractInstance(block)
      block = libToBoardBlock(libName, libMap.get(libName), inst)
      n++
    }
    chunks.push(block)
    last = i
  }
  chunks.push(text.slice(last))
  return { text: chunks.join(""), n }
}

let total = 0
for (const rel of PCBS) {
  const path = resolve(root, rel)
  const before = readFileSync(path, "utf8")
  const { text: after, n } = updatePcb(before)
  writeFileSync(path, after)
  console.log(`${rel}: updated ${n} footprints`)
  total += n
}
console.log(`update-board-fps-from-lib OK (${total})`)
