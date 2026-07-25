#!/usr/bin/env node

/**
 * Fallback Freerouting pipeline (Java JAR + Specctra).
 * Prefer `npm run route:circuit` / `scripts/route-with-topola.mjs` (Topola).
 *
 * Prerequisites:
 *   - generated/kicad/v3-unrouted.kicad_pcb (from circuit-json-to-kicad / tsci export)
 *   - third_party/freerouting/freerouting-2.2.4.jar
 *   - Java 25+ (Homebrew openjdk)
 *   - KiCad.app (for pcbnew Specctra export/import + kicad-cli renders)
 *
 * Flow:
 *   1. Fix empty footprint refs (blocks Specctra)
 *   2. Export Specctra .dsn via KiCad Python
 *   3. Run Freerouting headless → .ses
 *   4. Import .ses → v3-routed.kicad_pcb
 *   5. Export SVG / PNG / STEP / gerbers under generated/
 */
import { spawn } from "node:child_process"
import { access, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { existsSync } from "node:fs"

const root = resolve(import.meta.dirname, "..")
const kicadPython =
  "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9/bin/python3"
const kicadCli = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
const jar = resolve(root, "third_party/freerouting/freerouting-2.2.4.jar")
const javaCandidates = [
  "/opt/homebrew/opt/openjdk@26/bin/java",
  "/opt/homebrew/opt/openjdk/bin/java",
  "java",
]

async function run(cmd, args, opts = {}) {
  console.log("+", cmd, args.join(" "))
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts })
  const code = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)))
  if (code !== 0) process.exit(code)
}

function findJava() {
  for (const j of javaCandidates) {
    if (j === "java" || existsSync(j)) return j
  }
  return "java"
}

const srcPcb = resolve(root, "generated/kicad/v3-unrouted.kicad_pcb")
const routePcb = resolve(root, "generated/kicad/v3-for-route.kicad_pcb")
const dsn = resolve(root, "generated/kicad/v3-for-route.dsn")
const ses = resolve(root, "generated/kicad/v3-routed.ses")
const routedPcb = resolve(root, "generated/kicad/v3-routed.kicad_pcb")
const renders = resolve(root, "generated/renders")
const fab = resolve(root, "generated/fab/v3-routed")

await access(srcPcb)
await access(jar)
await access(kicadPython)
await mkdir(renders, { recursive: true })
await mkdir(fab, { recursive: true })

// Ensure tscircuit footprint library exists before Specctra/DRC work.
await run(process.execPath, [resolve(root, "scripts/fix-tscircuit-fp-lib.mjs"), srcPcb])

const exportPy = `
import os, pcbnew, wx
app = wx.App(False)
src = ${JSON.stringify(srcPcb)}
dst = ${JSON.stringify(routePcb)}
dsn = ${JSON.stringify(dsn)}
board = pcbnew.LoadBoard(src)
n = 0
for fp in board.GetFootprints():
    ref = fp.GetReference()
    if not ref or ref.endswith("?"):
        n += 1
        fp.SetReference(f"REF{n}")
pcbnew.SaveBoard(dst, board)
ok = pcbnew.ExportSpecctraDSN(board, dsn)
print("renamed_empty_refs", n, "dsn_ok", ok, "size", os.path.getsize(dsn) if ok else 0)
raise SystemExit(0 if ok else 1)
`

await run(kicadPython, ["-c", exportPy], {
  env: {
    ...process.env,
    PYTHONHOME:
      "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9",
    DYLD_FALLBACK_LIBRARY_PATH:
      "/Applications/KiCad/KiCad.app/Contents/Frameworks",
  },
})

const java = findJava()
await run(java, [
  "-jar",
  jar,
  "--gui.enabled=false",
  "-de",
  dsn,
  "-do",
  ses,
  "--router.max_passes=50",
  "--router.job_timeout=900",
])

const importPy = `
import os, pcbnew, wx
app = wx.App(False)
board = pcbnew.LoadBoard(${JSON.stringify(routePcb)})
ok = pcbnew.ImportSpecctraSES(board, ${JSON.stringify(ses)})
pcbnew.SaveBoard(${JSON.stringify(routedPcb)}, board)
tracks = list(board.GetTracks())
segs = sum(1 for t in tracks if t.GetClass() == "PCB_TRACK")
vias = sum(1 for t in tracks if t.GetClass() == "PCB_VIA")
print("import_ok", ok, "segments", segs, "vias", vias)
raise SystemExit(0 if ok else 1)
`

await run(kicadPython, ["-c", importPy], {
  env: {
    ...process.env,
    PYTHONHOME:
      "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9",
    DYLD_FALLBACK_LIBRARY_PATH:
      "/Applications/KiCad/KiCad.app/Contents/Frameworks",
  },
})

await run(kicadCli, [
  "pcb",
  "export",
  "svg",
  "--output",
  resolve(renders, "v3-routed-fcu.svg"),
  "--layers",
  "F.Cu,F.SilkS,Edge.Cuts",
  "--mode-single",
  "--fit-page-to-board",
  "--exclude-drawing-sheet",
  routedPcb,
])

await run(kicadCli, [
  "pcb",
  "render",
  "--output",
  resolve(renders, "v3-routed-top.png"),
  "--width",
  "1920",
  "--height",
  "720",
  "--side",
  "top",
  "--quality",
  "high",
  "--background",
  "opaque",
  routedPcb,
])

await run(kicadCli, [
  "pcb",
  "render",
  "--output",
  resolve(renders, "v3-routed-iso.png"),
  "--width",
  "1600",
  "--height",
  "900",
  "--side",
  "top",
  "--quality",
  "high",
  "--background",
  "opaque",
  "--rotate",
  "-55,0,35",
  "--perspective",
  "--floor",
  routedPcb,
])

await run(kicadCli, [
  "pcb",
  "export",
  "step",
  "--output",
  resolve(renders, "v3-routed.step"),
  "--subst-models",
  routedPcb,
])

await run(kicadCli, [
  "pcb",
  "export",
  "gerbers",
  "-o",
  fab,
  "--layers",
  "F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts",
  routedPcb,
])

console.log("Routed board ready:")
console.log("  ", routedPcb)
console.log("  ", resolve(renders, "v3-routed-fcu.svg"))
console.log("  ", resolve(renders, "v3-routed.step"))
console.log("  ", fab)
