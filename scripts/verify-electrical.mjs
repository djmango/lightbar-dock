#!/usr/bin/env bun

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"

const root = resolve(import.meta.dirname, "..")
const circuitPath = resolve(root, "build/lightbar-dock.circuit.json")
const reportDir = resolve(root, "generated/reports")
const goldenPath = resolve(root, "circuit/assurance/golden-footprints.json")

const MIN_VIA_HOLE_MM = 0.3
const MIN_VIA_PAD_MM = 0.6
const EXPECTED_MCU_MPN = "CH32V203F6P6"
const FORBIDDEN_MCU_MPNS = ["ATTINY1616-SFR", "CH32V203F8P6", "CH32V003F4P6"]

const MCU_TOUCH_NETS = [
  "status_i2c_sda",
  "status_i2c_scl",
  "status_led_output_enable",
  "status_led_clock",
  "status_led_latch",
  "status_boot0",
  "status_cc1_adc",
  "status_cc2_adc",
  "usb_dp",
  "usb_dm",
  "rail_3v3",
]

const HIGH_VOLTAGE_NETS = [
  "vin_pd",
  "vin_12v",
  "vin_barrel",
  "rail_5v_a",
  "rail_5v_b",
]

const checks = []
const check = (name, passed, details = {}) =>
  checks.push({ name, passed: Boolean(passed), details })

const circuit = JSON.parse(await readFile(circuitPath, "utf8"))
const connMap = getFullConnectivityMapFromCircuitJson(circuit)

const sourceComponents = circuit.filter((e) => e.type === "source_component")
const pcbComponents = circuit.filter((e) => e.type === "pcb_component")
const sourceById = new Map(
  sourceComponents.map((c) => [c.source_component_id, c]),
)
const pcbByName = new Map()
for (const pcb of pcbComponents) {
  const source = sourceById.get(pcb.source_component_id)
  if (source?.name) pcbByName.set(source.name, { pcb, source })
}

const board = circuit.find((e) => e.type === "pcb_board")
check("board outline 240x47", board?.width === 240 && board?.height === 47, {
  width: board?.width,
  height: board?.height,
})

/* USB1 shell opens −X (left edge). Native footprint +Y → needs pcbRotation −90. */
const usb1 = pcbByName.get("USB1")?.pcb
const usb1Rot = Number(usb1?.rotation ?? NaN)
const usb1RotNorm = ((usb1Rot % 360) + 360) % 360
check(
  "USB1 PD receptacle opens left (pcbRotation −90 / 270)",
  usb1RotNorm === 270,
  { rotation: usb1?.rotation, normalized: usb1RotNorm },
)
if (usb1?.center && board) {
  const leftEdge = (board.center?.x ?? 0) - board.width / 2
  const pads = circuit.filter(
    (e) =>
      e.type === "pcb_smtpad" &&
      e.pcb_component_id === usb1.pcb_component_id,
  )
  const padXs = pads.map((p) => p.x).filter((x) => typeof x === "number")
  if (padXs.length > 0) {
    const padMid = (Math.min(...padXs) + Math.max(...padXs)) / 2
    check(
      "USB1 SMT pads sit inboard of receptacle center (opening outboard)",
      padMid > usb1.center.x,
      { padMid, centerX: usb1.center.x, leftEdge },
    )
  }
}

const mcu = pcbByName.get("U7")?.source
check("MCU is CH32V203F6P6", mcu?.manufacturer_part_number === EXPECTED_MCU_MPN, {
  actual: mcu?.manufacturer_part_number,
})
check(
  "MCU is not a forbidden variant",
  !FORBIDDEN_MCU_MPNS.includes(mcu?.manufacturer_part_number),
  { actual: mcu?.manufacturer_part_number },
)

const ldo = pcbByName.get("U12")?.source
check("3V3 LDO HT7533 present", ldo?.manufacturer_part_number === "HT7533-1", {
  actual: ldo?.manufacturer_part_number,
})

const nets = circuit.filter((e) => e.type === "source_net")
const netIdByName = new Map(nets.map((n) => [n.name, n.source_net_id]))

function connectivityNetForNamedNet(netName) {
  const id = netIdByName.get(netName)
  if (!id) return null
  return connMap.getNetConnectedToId(id)
}

function netsShorted(a, b) {
  const netA = connectivityNetForNamedNet(a)
  const netB = connectivityNetForNamedNet(b)
  return Boolean(netA && netB && netA === netB)
}

function portTouchesNamedNet(portId, netName) {
  const netId = netIdByName.get(netName)
  if (!netId) return false
  const connKey = connMap.getNetConnectedToId(portId)
  if (!connKey) return false
  const members = connMap.getIdsConnectedToNet(connKey) ?? []
  return members.includes(netId)
}

const denylistHits = []
for (const touch of MCU_TOUCH_NETS) {
  for (const hv of HIGH_VOLTAGE_NETS) {
    if (netsShorted(touch, hv)) {
      denylistHits.push({ touch, hv })
    }
  }
}
check("MCU-domain nets isolated from 5 V / PD rails", denylistHits.length === 0, {
  denylistHits,
})

check("rail_3v3 exists", netIdByName.has("rail_3v3"), {})
check("ch224k_vdd exists", netIdByName.has("ch224k_vdd"), {})
check(
  "ch224k_vdd not shorted to vin_pd",
  !netsShorted("ch224k_vdd", "vin_pd"),
  {},
)

const pinAttrs = circuit.filter((e) => e.type === "source_pin_attributes")
const ports = circuit.filter((e) => e.type === "source_port")
const portById = new Map(ports.map((p) => [p.source_port_id, p]))

const netVoltage = new Map()
for (const attr of pinAttrs) {
  if (attr.provides_voltage == null) continue
  const netKey = connMap.getNetConnectedToId(attr.source_port_id)
  if (!netKey) continue
  const prev = netVoltage.get(netKey) ?? 0
  netVoltage.set(netKey, Math.max(prev, Number(attr.provides_voltage)))
}

const domainClashes = []
for (const attr of pinAttrs) {
  if (attr.requires_voltage == null) continue
  const netKey = connMap.getNetConnectedToId(attr.source_port_id)
  if (!netKey) continue
  const provided = netVoltage.get(netKey) ?? 0
  if (provided > Number(attr.requires_voltage)) {
    const port = portById.get(attr.source_port_id)
    const component = sourceById.get(port?.source_component_id)
    domainClashes.push({
      component: component?.name,
      pin: port?.name,
      requires: attr.requires_voltage,
      provided,
      netKey,
    })
  }
}
check("no providesVoltage > requiresVoltage clashes", domainClashes.length === 0, {
  clashes: domainClashes.slice(0, 20),
  pinAttributeCount: pinAttrs.length,
})

check("series VDD resistor R72 present", pcbByName.has("R72"), {})
check("BOOT switch SW1 present", pcbByName.has("SW1"), {})
check(
  "UPDI testpoints removed",
  !pcbByName.has("TP1") && !pcbByName.has("TP2") && !pcbByName.has("TP3"),
  {
    tp1: pcbByName.has("TP1"),
    tp2: pcbByName.has("TP2"),
    tp3: pcbByName.has("TP3"),
  },
)

// Pull-up resistors must share a net with rail_3v3, not rail_5v_a
function componentPortIds(name) {
  const entry = pcbByName.get(name)
  if (!entry) return []
  return ports
    .filter((p) => p.source_component_id === entry.source.source_component_id)
    .map((p) => p.source_port_id)
}

function componentTouchesNet(name, netName) {
  return componentPortIds(name).some((portId) =>
    portTouchesNamedNet(portId, netName),
  )
}

check(
  "R69 I2C pull-up on rail_3v3",
  componentTouchesNet("R69", "rail_3v3") &&
    !componentTouchesNet("R69", "rail_5v_a"),
  {},
)
check(
  "R71 OE pull-up on rail_3v3",
  componentTouchesNet("R71", "rail_3v3") &&
    !componentTouchesNet("R71", "rail_5v_a"),
  {},
)
check("U7 powered from rail_3v3", componentTouchesNet("U7", "rail_3v3"), {})
check("U1 INA on rail_3v3", componentTouchesNet("U1", "rail_3v3"), {})

const vias = circuit.filter((e) => e.type === "pcb_via")
const illegalVias = vias.filter((via) => {
  const hole = via.hole_diameter ?? via.holeDiameter ?? 0
  const outer = via.outer_diameter ?? via.outerDiameter ?? 0
  return hole + 1e-9 < MIN_VIA_HOLE_MM || outer + 1e-9 < MIN_VIA_PAD_MM
})
check(
  `vias >= ${MIN_VIA_PAD_MM}/${MIN_VIA_HOLE_MM} mm (or none yet)`,
  illegalVias.length === 0,
  {
    viaCount: vias.length,
    illegalCount: illegalVias.length,
    sample: illegalVias.slice(0, 5).map((v) => ({
      hole: v.hole_diameter ?? v.holeDiameter,
      outer: v.outer_diameter ?? v.outerDiameter,
    })),
  },
)

function padCenters(componentName) {
  const entry = pcbByName.get(componentName)
  if (!entry) return null
  return circuit
    .filter(
      (e) =>
        ["pcb_smtpad", "pcb_plated_hole"].includes(e.type) &&
        e.pcb_component_id === entry.pcb.pcb_component_id,
    )
    .map((pad) => ({
      hints: pad.port_hints ?? [],
      x: Number((pad.x ?? pad.center?.x ?? 0).toFixed(3)),
      y: Number((pad.y ?? pad.center?.y ?? 0).toFixed(3)),
    }))
    .sort((a, b) => String(a.hints[0]).localeCompare(String(b.hints[0])))
}

let golden = null
try {
  golden = JSON.parse(await readFile(goldenPath, "utf8"))
} catch {
  golden = null
}

if (golden) {
  for (const [name, expected] of Object.entries(golden.components ?? {})) {
    const actual = padCenters(name)
    const ok =
      actual &&
      actual.length === expected.length &&
      actual.every(
        (pad, i) =>
          Math.abs(pad.x - expected[i].x) < 0.05 &&
          Math.abs(pad.y - expected[i].y) < 0.05,
      )
    check(`golden footprint ${name}`, ok, { actual, expected })
  }
} else {
  check("golden footprints file present", false, { path: goldenPath })
}

await mkdir(reportDir, { recursive: true })
const result = {
  passed: checks.every((c) => c.passed),
  generatedAt: new Date().toISOString(),
  checks,
  viaCount: vias.length,
  pinAttributeCount: pinAttrs.length,
  connectivityNets: {
    rail_3v3: connectivityNetForNamedNet("rail_3v3"),
    ch224k_vdd: connectivityNetForNamedNet("ch224k_vdd"),
  },
}
await writeFile(
  resolve(reportDir, "electrical.json"),
  `${JSON.stringify(result, null, 2)}\n`,
)

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`)
}
if (!result.passed) process.exitCode = 1
