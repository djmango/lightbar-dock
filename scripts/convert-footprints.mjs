#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { parseKicadModToCircuitJson } from "kicad-component-converter"

const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(root, "circuit/footprints")

const footprints = {
  BarrelJack:
    "parts/XKB_Connectivity_DC_005_5A_2_0/DC-IN-TH_DC-005-5A-2.0.kicad_mod",
  ChargeUsbC:
    "parts/Jing_Extension_of_the_Electronic_Co_918_118A2021Y40006/USB-C-SMD_918-118A2021Y40006.kicad_mod",
  Ch224k:
    "parts/WCH_CH224K/ESSOP-10_L4.9-W3.9-P1.0-LS6.0-TL-EP.kicad_mod",
  InputUsbC:
    "parts/SHOU_HAN_TYPE_C_16PIN_2MD_073/USB-C-SMD_TYPE-C-16PIN-2MD-073.kicad_mod",
  Polyfuse1812:
    "parts/BHFUSE_BSMD1812_150_33V/F1812.kicad_mod",
  Ss54:
    "parts/TWGMC_SS54/SMC_L6.9-W5.9-LS7.9-RD.kicad_mod",
  Stps340:
    ".ato/modules/atopile/ti-tps54560x/parts/STMicroelectronics_STPS340U/SMB_L4.6-W3.6-LS5.3-RD.kicad_mod",
  Swpa8040:
    ".ato/modules/atopile/ti-tps54560x/parts/Sunlord_SWPA8040S5R6NT/IND-SMD_L8.0-W8.0_SWPA8040S.kicad_mod",
  Tps54560:
    ".ato/modules/atopile/ti-tps54560x/parts/Texas_Instruments_TPS54560DDAR/SOIC-8_L5.0-W4.0-P1.27-LS6.0-BL-EP2.0.kicad_mod",
}

const pinRemaps = {
  InputUsbC: {
    A1B12: "1",
    B1A12: "2",
    A4B9: "3",
    B4A9: "4",
    A5: "5",
    B5: "6",
    A6: "7",
    A7: "8",
    B6: "9",
    B7: "10",
    A8: "11",
    B8: "12",
    13: "13",
    14: "14",
  },
}

await mkdir(outputDirectory, { recursive: true })

for (const [name, relativePath] of Object.entries(footprints)) {
  const inputPath = resolve(root, relativePath)
  const converted = await parseKicadModToCircuitJson(
    await readFile(inputPath, "utf8"),
  )
  const circuitJson = JSON.parse(
    JSON.stringify(converted, (_key, value) =>
      value === null ? undefined : value,
    ),
  )
  const pinRemap = pinRemaps[name]
  if (pinRemap) {
    for (const element of circuitJson) {
      if (element.type === "source_port" && pinRemap[element.name]) {
        const pinNumber = pinRemap[element.name]
        element.name = `pin${pinNumber}`
        element.pin_number = Number(pinNumber)
        element.pin_label = `pin${pinNumber}`
        element.port_hints = [pinNumber, `pin${pinNumber}`]
      }
      if (Array.isArray(element.port_hints)) {
        element.port_hints = element.port_hints.flatMap((hint) => {
          const pinNumber = pinRemap[hint]
          return pinNumber ? [pinNumber, `pin${pinNumber}`] : [hint]
        })
      }
    }
  }
  if (name === "Tps54560") {
    for (const element of circuitJson) {
      if (element.type === "pcb_plated_hole" && element.port_hints.length === 0) {
        element.port_hints = ["9", "pin9"]
      }
    }
  }
  const notice = `// Generated from ${relativePath} by scripts/convert-footprints.mjs.\n`
  const output = `${notice}export const ${name}Footprint = ${JSON.stringify(
    circuitJson,
    null,
    2,
  )} as any\n`
  await writeFile(resolve(outputDirectory, `${name}.ts`), output)
  console.log(`Converted ${basename(inputPath)} to ${name}.ts`)
}
