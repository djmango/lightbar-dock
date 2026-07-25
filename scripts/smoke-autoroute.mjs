#!/usr/bin/env bun
/**
 * End-to-end smoke test for packages/topola-autorouter (no KiCad required).
 * Spawns the solve server, posts a tiny SRJ, asserts traces come back.
 */
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

const root = resolve(import.meta.dirname, "..")
const port = Number(process.env.TOPOLA_AUTOROUTER_PORT || "3098")
const serverPath = resolve(root, "packages/topola-autorouter/server.mjs")

const child = spawn(process.execPath, [serverPath], {
  cwd: root,
  env: { ...process.env, TOPOLA_AUTOROUTER_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
})

let stderr = ""
child.stderr.on("data", (d) => {
  stderr += d
})
child.stdout.on("data", (d) => {
  stderr += d
})

async function waitHealthy(ms = 15000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`)
      if (r.ok) return await r.json()
    } catch {
      /* retry */
    }
    await sleep(100)
  }
  throw new Error(`server not healthy\n${stderr}`)
}

try {
  const health = await waitHealthy()
  if (!health.topola) throw new Error("health.topola is false — build Topola CLI")

  const body = {
    input_simple_route_json: {
      bounds: { minX: 0, maxX: 20, minY: 0, maxY: 10 },
      layerCount: 2,
      minTraceWidth: 0.2,
      obstacles: [{ center: { x: 10, y: 5 }, width: 2, height: 4, layers: ["top"] }],
      connections: [
        {
          name: "net1",
          pointsToConnect: [
            { x: 2, y: 5, layer: "top" },
            { x: 18, y: 5, layer: "top" },
          ],
        },
        {
          name: "via_net",
          pointsToConnect: [
            { x: 4, y: 2, layer: "top" },
            { x: 16, y: 8, layer: "bottom" },
          ],
        },
      ],
    },
  }

  const res = await fetch(`http://127.0.0.1:${port}/autorouting/solve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`solve ${res.status}: ${JSON.stringify(json)}`)

  const traces = json.output_simple_route_json?.traces || []
  if (traces.length < 1) throw new Error(`expected traces, got ${JSON.stringify(json)}`)

  console.log("smoke:autoroute OK")
  console.log(`  health: topola=${health.topola}`)
  console.log(`  traces: ${traces.length}`)
  for (const t of traces) {
    const vias = (t.route || []).filter((r) => r.route_type === "via").length
    const wires = (t.route || []).filter((r) => r.route_type === "wire").length
    console.log(`  - ${t.pcb_trace_id}: wires=${wires} vias=${vias}`)
  }
  process.exitCode = 0
} catch (err) {
  console.error("smoke:autoroute FAIL:", err.message || err)
  process.exitCode = 1
} finally {
  child.kill("SIGTERM")
  await sleep(200)
  try {
    child.kill("SIGKILL")
  } catch {
    /* already dead */
  }
}
