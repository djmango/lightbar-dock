#!/usr/bin/env node

/**
 * Fix KiCad DRC "Missing Footprint Library 'tscircuit'".
 *
 * tscircuit exports footprints as tscircuit:<name> but does not ship a KiCad
 * .pretty library. This script:
 *   1. Extracts unique footprints from a PCB into circuit/kicad/tscircuit.pretty
 *   2. Writes generated/kicad/fp-lib-table pointing at that library
 *   3. Ensures board FPIDs use the tscircuit: nickname
 *
 * Usage:
 *   node scripts/fix-tscircuit-fp-lib.mjs [pcb...]
 * Default PCBs: generated/kicad/{default,v3-routed,v3-unrouted,v3-for-route}.kicad_pcb
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { requireKicadEnv } from "./kicad-env.mjs"

const root = resolve(import.meta.dirname, "..")
const { python: kicadPython, env: kicadEnv } = requireKicadEnv()
const prettyDir = resolve(root, "circuit/kicad/tscircuit.pretty")
const kicadDir = resolve(root, "generated/kicad")
const defaultPcbs = [
  "default.kicad_pcb",
  "v3-routed.kicad_pcb",
  "v3-unrouted.kicad_pcb",
  "v3-for-route.kicad_pcb",
].map((f) => resolve(kicadDir, f))

const pcbs = (process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => resolve(root, p))
  : defaultPcbs
).filter((p) => existsSync(p))

if (pcbs.length === 0) {
  console.error("No PCB files found under generated/kicad/")
  process.exit(1)
}

mkdirSync(dirname(prettyDir), { recursive: true })
mkdirSync(kicadDir, { recursive: true })

const fpLibTable = `(fp_lib_table
	(version 7)
	(lib
		(name "tscircuit")
		(type "KiCad")
		(uri "\${KIPRJMOD}/../../circuit/kicad/tscircuit.pretty")
		(options "")
		(descr "Footprints extracted from tscircuit KiCad export")
	)
)
`
writeFileSync(resolve(kicadDir, "fp-lib-table"), fpLibTable)

const py = `
import os, shutil, pcbnew

pretty = ${JSON.stringify(prettyDir)}
pcbs = ${JSON.stringify(pcbs)}

if os.path.isdir(pretty):
    shutil.rmtree(pretty)

io = pcbnew.PCB_IO_KICAD_SEXPR()
io.CreateLibrary(pretty)

# Build library from the first PCB (usually the routed manufacturing board).
# Later boards only contribute footprint names missing from that set.
seen = {}
for path in pcbs:
    board = pcbnew.LoadBoard(path)
    for fp in board.GetFootprints():
        fpid = fp.GetFPIDAsString() or ""
        name = fpid.split(":")[-1] if fpid else ""
        if not name or name in seen:
            continue
        clone = pcbnew.FOOTPRINT(fp)
        clone.SetPosition(pcbnew.VECTOR2I(0, 0))
        clone.SetOrientation(pcbnew.ANGLE_0)
        clone.SetReference("REF**")
        clone.SetValue(name)
        clone.SetFPIDAsString(name)
        # Match board silk policy used on V3 KiCad boards (hide ref/value).
        try:
            clone.Reference().SetVisible(False)
            clone.Value().SetVisible(False)
        except Exception:
            pass
        io.FootprintSave(pretty, clone)
        seen[name] = True

# Restore tscircuit: nickname + matching silk visibility on every board.
for path in pcbs:
    board = pcbnew.LoadBoard(path)
    n = 0
    for fp in board.GetFootprints():
        fpid = fp.GetFPIDAsString() or ""
        name = fpid.split(":")[-1] if fpid else ""
        if not name:
            continue
        want = f"tscircuit:{name}"
        if fpid != want:
            fp.SetFPIDAsString(want)
            n += 1
        try:
            fp.Reference().SetVisible(False)
            fp.Value().SetVisible(False)
        except Exception:
            pass
    pcbnew.SaveBoard(path, board)
    print("pcb", os.path.basename(path), "normalized_fpids", n)

mods = sorted(f for f in os.listdir(pretty) if f.endswith(".kicad_mod"))
print("library", pretty)
print("footprints", len(mods))
`

function runPython(code) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(kicadPython, ["-c", code], {
      cwd: root,
      stdio: "inherit",
      env: kicadEnv,
    })
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`python exit ${code}`)),
    )
  })
}

await runPython(py)
console.log("Wrote", resolve(kicadDir, "fp-lib-table"))
console.log("Open generated/kicad/*.kicad_pro so KiCad loads the project fp-lib-table.")
