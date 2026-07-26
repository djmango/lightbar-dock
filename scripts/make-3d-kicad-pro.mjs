#!/usr/bin/env bun
/** Companion .kicad_pro for generated/kicad/v3-manufacturing-3d.kicad_pcb */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const srcPro = resolve(root, "ci/artifacts/v3-manufacturing.kicad_pro")
const outDir = resolve(root, "generated/kicad")
const dstPro = resolve(outDir, "v3-manufacturing-3d.kicad_pro")

await mkdir(outDir, { recursive: true })
const text = await readFile(srcPro, "utf8")
await writeFile(
  dstPro,
  text.replaceAll("v3-manufacturing.kicad_pcb", "v3-manufacturing-3d.kicad_pcb"),
)
try {
  await copyFile(
    resolve(root, "ci/artifacts/v3-manufacturing.kicad_prl"),
    resolve(outDir, "v3-manufacturing-3d.kicad_prl"),
  )
} catch {
  /* prl optional */
}
console.log("wrote", dstPro)
