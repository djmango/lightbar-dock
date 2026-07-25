#!/usr/bin/env node

/**
 * Finish still-open ratsnest nets with optimized Topola (one net at a time).
 *
 * WARNING: ImportSpecctraSES of a Topola SES can rewrite existing Freerouting
 * copper and explode unconnected counts. Prefer `npm run route:finish` (grid A*).
 *
 * Starts from generated/kicad/v3-routed.kicad_pcb.
 * For each unconnected net: export DSN → Topola --remaining --nets N → import SES.
 *
 * Env:
 *   TOPOLA_BIN  — topola binary
 *   TOPOLA_WALL — wall-clock seconds per net (default 90)
 *   FINISH_PCB  — pcb path (default generated/kicad/v3-routed.kicad_pcb)
 */
import { spawn } from "node:child_process"
import { access, mkdir, writeFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { requireKicadEnv } from "./kicad-env.mjs"

const root = resolve(import.meta.dirname, "..")
const { python: kicadPython, cli: kicadCli, env } = requireKicadEnv()
const topolaSrc = resolve(root, "third_party/topola")
const topolaBin =
  process.env.TOPOLA_BIN || resolve(topolaSrc, "target/release/topola")
const wall = Number(process.env.TOPOLA_WALL || "90")
const pcb = resolve(
  root,
  process.env.FINISH_PCB || "generated/kicad/v3-routed.kicad_pcb",
)
const defaultPcb = resolve(root, "generated/kicad/default.kicad_pcb")
const workDir = resolve(root, "generated/kicad")
const reportPath = resolve(root, "generated/reports/v3-finish-remaining.json")
const drcPath = resolve(root, "generated/reports/v3-finish-drc.json")

async function run(cmd, args, opts = {}) {
  console.log("+", cmd, args.join(" "))
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts })
  const code = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)))
  if (code !== 0) throw new Error(`${cmd} exited ${code}`)
}

async function py(code) {
  await run(kicadPython, ["-c", code], { env })
}

async function ensureTopola() {
  if (existsSync(topolaBin)) return
  await run("cargo", ["build", "--release", "-p", "topola-cli"], {
    cwd: topolaSrc,
  })
}

function netFromItemDescription(desc) {
  // "Pad 15 [port_4_shunt_in] of U2 on F.Cu"
  // "Track [status_i2c_sda] on B.Cu, length 0.5554 mm"
  const m = desc.match(/\[([^\]]+)\]/)
  return m ? m[1] : null
}

async function listUnconnected() {
  await mkdir(resolve(root, "generated/reports"), { recursive: true })
  // kicad-cli drc exits non-zero when violations exist — ignore code
  await new Promise((resolvePromise) => {
    console.log("+", kicadCli, "pcb drc …")
    const child = spawn(
      kicadCli,
      [
        "pcb",
        "drc",
        "--format",
        "json",
        "--severity-all",
        "--units",
        "mm",
        "--refill-zones",
        "-o",
        drcPath,
        pcb,
      ],
      { cwd: root, stdio: "inherit" },
    )
    child.on("exit", () => resolvePromise())
  })

  const data = JSON.parse(await readFile(drcPath, "utf8"))
  const items = data.unconnected_items || []
  const nets = []
  for (const v of items) {
    for (const it of v.items || []) {
      const n = netFromItemDescription(it.description || "")
      if (n && !nets.includes(n)) nets.push(n)
    }
  }

  // Also count via python for a single source of truth
  const countPath = resolve(workDir, "_unconn_count.json")
  await py(`
import json, pcbnew
board = pcbnew.LoadBoard(${JSON.stringify(pcb)})
cd = board.GetConnectivity()
cd.RecalculateRatsnest()
open(${JSON.stringify(countPath)}, "w").write(json.dumps({
  "unconnected_count": cd.GetUnconnectedCount(False)
}))
`)
  const { unconnected_count } = JSON.parse(await readFile(countPath, "utf8"))
  return { unconnected_count, nets, items }
}

const preferred = [
  ".C42 > .pin1 to .U7 > .nrst",
  "port_4_shunt_in",
  "status_cc1_adc",
  "port_5_cc2",
  ".U7 > .pa7LedData to .U10 > .serialIn",
  "status_i2c_sda",
  ".R56 > .pin1 to .U10 > .qd",
]

function orderNets(nets) {
  const rest = nets.filter((n) => !preferred.includes(n))
  return [...preferred.filter((n) => nets.includes(n)), ...rest]
}

await access(pcb)
await access(kicadPython)
await ensureTopola()

let state = await listUnconnected()
console.log("start", {
  unconnected_count: state.unconnected_count,
  nets: state.nets,
})
const log = {
  started_unconnected: state.unconnected_count,
  attempts: [],
  final: null,
}

let nets = orderNets(state.nets)
let stuck = 0
let prevCount = state.unconnected_count

while (nets.length && stuck < 3) {
  for (const net of [...nets]) {
    const tag = net.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48)
    const dsn = resolve(workDir, `v3-finish-${tag}.dsn`)
    const ses = resolve(workDir, `v3-finish-${tag}.ses`)
    const entry = { net, ok: false, before: state.unconnected_count, after: null }

    console.log(`\n=== finish net: ${net} ===`)
    try {
      await py(`
import pcbnew, os
board = pcbnew.LoadBoard(${JSON.stringify(pcb)})
ok = pcbnew.ExportSpecctraDSN(board, ${JSON.stringify(dsn)})
print("dsn_ok", ok, "size", os.path.getsize(${JSON.stringify(dsn)}) if ok else 0)
raise SystemExit(0 if ok else 1)
`)

      await run(topolaBin, [
        dsn,
        "--remaining",
        "--multilayer",
        "--nets",
        net,
        "--wall-timeout",
        String(wall),
        "--timeout-initial",
        "2",
        "--timeout-progress-bonus",
        "0",
        "-o",
        ses,
      ])

      await py(`
import pcbnew
board = pcbnew.LoadBoard(${JSON.stringify(pcb)})
ok = pcbnew.ImportSpecctraSES(board, ${JSON.stringify(ses)})
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
pcbnew.SaveBoard(${JSON.stringify(pcb)}, board)
pcbnew.SaveBoard(${JSON.stringify(defaultPcb)}, board)
cd = board.GetConnectivity(); cd.RecalculateRatsnest()
print("import_ok", ok, "unconnected", cd.GetUnconnectedCount(False))
raise SystemExit(0 if ok else 1)
`)
      entry.ok = true
    } catch (e) {
      entry.error = String(e)
      console.error("net failed:", e)
    }

    state = await listUnconnected()
    entry.after = state.unconnected_count
    log.attempts.push(entry)
    console.log("progress", entry)

    if (state.unconnected_count === 0) break
    nets = orderNets(state.nets)
  }

  if (state.unconnected_count === 0) break
  if (state.unconnected_count >= prevCount) stuck++
  else stuck = 0
  prevCount = state.unconnected_count
  nets = orderNets(state.nets)
}

log.final = {
  unconnected_count: state.unconnected_count,
  nets: state.nets,
}
await writeFile(reportPath, JSON.stringify(log, null, 2))
console.log("\nFinish report:", reportPath)
console.log(JSON.stringify(log.final, null, 2))
if (state.unconnected_count !== 0) process.exit(2)
