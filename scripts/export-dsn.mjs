#!/usr/bin/env bun
/**
 * Export Specctra DSN from a .kicad_pcb via KiCad's bundled pcbnew.
 *
 * Prefer Docker `kicad/kicad:10.0` (matches CI). Falls back to host
 * `KICAD_PYTHON`/`python3`+pcbnew when available. This is KiCad tooling —
 * not a first-party Python gate.
 *
 *   bun run dsn:export
 *   bun run dsn:export -- ci/artifacts/v3-for-route.kicad_pcb ci/artifacts/v3-for-route.dsn
 */
import { existsSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { resolveKicadEnv, KICAD_DOCKER_IMAGE } from "./kicad-env.mjs"

const root = resolve(import.meta.dirname, "..")
const args = process.argv.slice(2).filter((a) => a !== "--")
const pcbPath = resolve(
  root,
  args[0] || "ci/artifacts/v3-for-route.kicad_pcb",
)
const dsnPath = resolve(root, args[1] || "ci/artifacts/v3-for-route.dsn")

if (!existsSync(pcbPath)) {
  console.error(`missing PCB: ${pcbPath}`)
  process.exit(1)
}
mkdirSync(dirname(dsnPath), { recursive: true })

const pcbRel = relative(root, pcbPath).replaceAll("\\", "/")
const dsnRel = relative(root, dsnPath).replaceAll("\\", "/")

function pyScript(pcb, dsn) {
  return `import sys
try:
    import pcbnew
except ImportError as e:
    print("pcbnew not available:", e, file=sys.stderr)
    sys.exit(2)

pcb = ${JSON.stringify(pcb)}
dsn = ${JSON.stringify(dsn)}
board = pcbnew.LoadBoard(pcb)
if hasattr(pcbnew, "ExportSpecctraDSN"):
    ok = pcbnew.ExportSpecctraDSN(board, dsn)
    if ok is False:
        raise SystemExit(f"ExportSpecctraDSN failed for {pcb}")
else:
    exporter = pcbnew.SPECCTRA_DB()
    exporter.SetBoard(board)
    if not exporter.ExportDSN(dsn):
        raise SystemExit(f"SPECCTRA_DB.ExportDSN failed for {pcb}")
print(f"exported {dsn}")
`
}

const helper = resolve(root, "generated/tmp-export-dsn.py")
mkdirSync(dirname(helper), { recursive: true })

function haveDocker() {
  return (
    spawnSync("bash", ["-lc", "command -v docker"], { encoding: "utf8" })
      .status === 0
  )
}

const k = resolveKicadEnv()
let status = 1

if (k.mode === "docker" || (k.mode !== "native" && haveDocker())) {
  writeFileSync(
    helper,
    pyScript(`/work/${pcbRel}`, `/work/${dsnRel}`),
  )
  const image = process.env.KICAD_DOCKER_IMAGE || KICAD_DOCKER_IMAGE
  console.log(`+ docker run ${image} python3 /work/generated/tmp-export-dsn.py`)
  const r = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--user",
      "root",
      "-v",
      `${root}:/work`,
      "-w",
      "/work",
      image,
      "python3",
      "/work/generated/tmp-export-dsn.py",
    ],
    { stdio: "inherit" },
  )
  status = r.status ?? 1
} else if (k.mode === "native") {
  writeFileSync(helper, pyScript(pcbPath, dsnPath))
  const bin = process.env.KICAD_PYTHON || "python3"
  console.log(`+ ${bin} generated/tmp-export-dsn.py`)
  const r = spawnSync(bin, [helper], { stdio: "inherit", env: k.env })
  status = r.status ?? 1
} else {
  console.error(
    "No KiCad backend for DSN export.\n" +
      "  Install Docker and pull kicad/kicad:10.0, or use KiCad GUI:\n" +
      "  File → Export → Specctra DSN\n" +
      "  Then: bun run dsn:check",
  )
  process.exit(2)
}

if (status !== 0) {
  console.error(`dsn:export failed (exit ${status})`)
  process.exit(status)
}

const check = spawnSync(
  process.execPath,
  [resolve(root, "scripts/check-dsn-fresh.mjs"), pcbRel, dsnRel],
  { cwd: root, stdio: "inherit" },
)
process.exit(check.status ?? 1)
