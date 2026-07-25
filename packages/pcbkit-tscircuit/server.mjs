#!/usr/bin/env bun
/**
 * tscircuit autorouting solve-endpoint → pcbkit.
 *
 * Config is CLI flags only (no env):
 *   bun packages/pcbkit-tscircuit/server.mjs --port 3099 --profile pcbkit/profiles/lightbar-dock.toml
 *
 * POST /autorouting/solve
 *   { "input_simple_route_json": { ... } }
 * → { "output_simple_route_json": { ... } }
 *
 * Note: full circuit-json routing uses `pcbkit route`. This adapter accepts
 * SimpleRouteJson for tscircuit's solve-endpoint, writes a minimal circuit-json
 * shim, runs pcbkit, and returns traces.
 */
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { existsSync } from "node:fs"

const root = resolve(import.meta.dirname, "../..")

function parseArgs(argv) {
  const out = {
    port: 3099,
    profile: resolve(root, "pcbkit/profiles/lightbar-dock.toml"),
    pcbkit: resolve(root, "pcbkit/target/release/pcbkit"),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--port") out.port = Number(argv[++i])
    else if (a === "--profile") out.profile = resolve(argv[++i])
    else if (a === "--pcbkit") out.pcbkit = resolve(argv[++i])
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: server.mjs [--port N] [--profile PATH] [--pcbkit PATH]",
      )
      process.exit(0)
    }
  }
  return out
}

const cfg = parseArgs(process.argv.slice(2))

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => {
      stdout += d
    })
    child.stderr.on("data", (d) => {
      stderr += d
    })
    child.on("exit", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else reject(new Error(`${cmd} exit ${code}\n${stderr || stdout}`))
    })
  })
}

/** Minimal circuit-json so pcbkit can extract pads/nets from SimpleRouteJson. */
function simpleRouteToCircuitJson(srj) {
  const bounds = srj.bounds || { minX: 0, maxX: 100, minY: 0, maxY: 50 }
  const width = (bounds.maxX ?? 100) - (bounds.minX ?? 0)
  const height = (bounds.maxY ?? 50) - (bounds.minY ?? 0)
  const cx = ((bounds.minX ?? 0) + (bounds.maxX ?? 100)) / 2
  let cy = ((bounds.minY ?? 0) + (bounds.maxY ?? 50)) / 2
  const elements = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      width,
      height,
      center: { x: cx, y: cy },
      min_trace_width: srj.minTraceWidth || 0.15,
    },
  ]
  let n = 0
  for (const conn of srj.connections || []) {
    const net = String(conn.name || `net_${n}`)
    const netId = `source_net_${n}`
    elements.push({
      type: "source_net",
      source_net_id: netId,
      name: net,
      subcircuit_connectivity_map_key: net,
    })
    const portIds = []
    for (const pt of conn.pointsToConnect || []) {
      n += 1
      const sp = `source_port_${n}`
      const pp = `pcb_port_${n}`
      const pad = `pcb_smtpad_${n}`
      const comp = `source_component_${n}`
      portIds.push(sp)
      elements.push({
        type: "source_component",
        source_component_id: comp,
        name: `T${n}`,
      })
      elements.push({
        type: "source_port",
        source_port_id: sp,
        source_component_id: comp,
        name: "1",
        subcircuit_connectivity_map_key: net,
      })
      elements.push({
        type: "pcb_port",
        pcb_port_id: pp,
        source_port_id: sp,
      })
      elements.push({
        type: "pcb_smtpad",
        pcb_smtpad_id: pad,
        pcb_port_id: pp,
        x: pt.x,
        y: pt.y,
        width: 0.6,
        height: 0.6,
        layer: pt.layer || "top",
      })
    }
    elements.push({
      type: "source_trace",
      source_trace_id: `source_trace_${netId}`,
      connected_source_net_ids: [netId],
      connected_source_port_ids: portIds,
    })
  }
  return elements
}

function tracesFromCircuitJson(elements) {
  const traces = []
  for (const e of elements) {
    if (e.type !== "pcb_trace") continue
    traces.push({
      type: "pcb_trace",
      pcb_trace_id: e.pcb_trace_id,
      route: e.route || [],
    })
  }
  return traces
}

async function ensurePcbkit() {
  if (existsSync(cfg.pcbkit)) return
  await run("cargo", ["build", "--release", "-p", "pcbkit-cli"], {
    cwd: resolve(root, "pcbkit"),
  })
}

async function solve(srj) {
  await ensurePcbkit()
  const dir = await mkdtemp(join(tmpdir(), "pcbkit-ts-"))
  const input = join(dir, "in.circuit.json")
  const output = join(dir, "out.circuit.json")
  try {
    await writeFile(input, JSON.stringify(simpleRouteToCircuitJson(srj), null, 2))
    await run(
      cfg.pcbkit,
      [
        "route",
        "--input",
        input,
        "--profile",
        cfg.profile,
        "--out",
        output,
        "--allow-fail",
      ],
      { cwd: root },
    )
    const elements = JSON.parse(await readFile(output, "utf8"))
    return { traces: tracesFromCircuitJson(elements) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: true, pcbkit: cfg.pcbkit }))
    return
  }
  if (req.method !== "POST" || !req.url?.startsWith("/autorouting/solve")) {
    res.writeHead(404)
    res.end("not found")
    return
  }
  const chunks = []
  for await (const c of req) chunks.push(c)
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    const srj = body.input_simple_route_json || body
    const { traces } = await solve(srj)
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ output_simple_route_json: { traces } }))
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: String(e?.stack || e) }))
  }
})

server.listen(cfg.port, "127.0.0.1", () => {
  console.log(
    `pcbkit-tscircuit listening on http://127.0.0.1:${cfg.port} profile=${cfg.profile}`,
  )
})
