#!/usr/bin/env node

/**
 * Local Topola (Rust Specctra) autoroute pipeline.
 *
 * Prerequisites:
 *   - generated/kicad/v3-unrouted.kicad_pcb (from tsci / circuit-json export)
 *   - third_party/topola (git submodule) with release CLI built
 *   - KiCad.app (pcbnew Specctra export/import + kicad-cli)
 *
 * Flow:
 *   1. Fix empty footprint refs + ensure tscircuit fp-lib
 *   2. Export Specctra .dsn via KiCad Python
 *   3. Run Topola multilayer CLI → .ses
 *   4. Import .ses → v3-routed.kicad_pcb (+ default.kicad_pcb)
 *   5. GND pour refill, fp-lib normalize, SVG / PNG / STEP / gerbers
 *
 * Env:
 *   TOPOLA_BIN     — path to topola binary (default: third_party/topola/target/release/topola)
 *   TOPOLA_ARGS    — extra CLI args (default: --multilayer --skip-nets GND,gnd)
 *   TOPOLA_TIMEOUT — seconds (default: 900)
 *
 * For finishing an already-routed board with a few open nets, prefer:
 *   npm run route:finish
 */
import { spawn } from "node:child_process"
import { access, mkdir, copyFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const kicadPython =
  "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9/bin/python3"
const kicadCli = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
const topolaSrc = resolve(root, "third_party/topola")
const defaultTopola = resolve(topolaSrc, "target/release/topola")
const topolaBin = process.env.TOPOLA_BIN || defaultTopola
const topolaArgs = (
  process.env.TOPOLA_ARGS ||
  "--multilayer --skip-nets GND,gnd --timeout-progress-bonus 0 --wall-timeout 180"
)
  .split(/\s+/)
  .filter(Boolean)
const timeoutSec = Number(process.env.TOPOLA_TIMEOUT || "900")

const srcPcb = resolve(root, "generated/kicad/v3-unrouted.kicad_pcb")
const routePcb = resolve(root, "generated/kicad/v3-for-route.kicad_pcb")
const dsn = resolve(root, "generated/kicad/v3-for-route.dsn")
const ses = resolve(root, "generated/kicad/v3-routed.ses")
const routedPcb = resolve(root, "generated/kicad/v3-routed.kicad_pcb")
const defaultPcb = resolve(root, "generated/kicad/default.kicad_pcb")
const renders = resolve(root, "generated/renders")
const fab = resolve(root, "generated/fab/v3-routed")

async function run(cmd, args, opts = {}) {
  console.log("+", cmd, args.join(" "))
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts })
  const code = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)))
  if (code !== 0) process.exit(code)
}

async function ensureTopola() {
  if (existsSync(topolaBin)) return
  console.log("Building Topola CLI (release)…")
  await run("cargo", ["build", "--release", "-p", "topola-cli"], { cwd: topolaSrc })
  await access(topolaBin)
}

await access(srcPcb)
await access(kicadPython)
await mkdir(renders, { recursive: true })
await mkdir(fab, { recursive: true })
await ensureTopola()

await run(process.execPath, [
  resolve(root, "scripts/fix-tscircuit-fp-lib.mjs"),
  srcPcb,
])

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

await run(
  "timeout",
  [String(timeoutSec), topolaBin, dsn, ...topolaArgs, "-o", ses],
)

const importPy = `
import os, pcbnew, wx
app = wx.App(False)
board = pcbnew.LoadBoard(${JSON.stringify(routePcb)})
ok = pcbnew.ImportSpecctraSES(board, ${JSON.stringify(ses)})

# GND pour on F.Cu + B.Cu
for z in list(board.Zones()):
    board.Delete(z)
gnd = board.FindNet("gnd")
if gnd is not None and gnd.GetNetCode() != 0:
    bbox = board.GetBoardEdgesBoundingBox()
    m = int(pcbnew.FromMM(0.3))
    L,R,T,B = int(bbox.GetLeft()+m), int(bbox.GetRight()-m), int(bbox.GetTop()+m), int(bbox.GetBottom()-m)
    for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
        z = pcbnew.ZONE(board)
        z.SetNet(gnd)
        z.SetLayer(layer)
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL)
        z.SetMinThickness(int(pcbnew.FromMM(0.2)))
        z.SetLocalClearance(int(pcbnew.FromMM(0.2)))
        o = z.Outline(); o.NewOutline()
        o.Append(L,T); o.Append(R,T); o.Append(R,B); o.Append(L,B)
        board.Add(z)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())

pcbnew.SaveBoard(${JSON.stringify(routedPcb)}, board)
pcbnew.SaveBoard(${JSON.stringify(defaultPcb)}, board)
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

await run(process.execPath, [
  resolve(root, "scripts/fix-tscircuit-fp-lib.mjs"),
  routedPcb,
  defaultPcb,
])

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

await run(kicadCli, [
  "pcb",
  "drc",
  "--format",
  "json",
  "--severity-all",
  "--units",
  "mm",
  "--refill-zones",
  "-o",
  resolve(root, "generated/reports/v3-topola-drc.json"),
  routedPcb,
])

console.log("Routed board ready (Topola):")
console.log("  ", routedPcb)
console.log("  ", resolve(renders, "v3-routed-fcu.svg"))
console.log("  ", resolve(renders, "v3-routed.step"))
console.log("  ", fab)
