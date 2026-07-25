#!/usr/bin/env node

/**
 * tscircuit autorouting solve-endpoint adapter for Topola.
 *
 *   npm run autoroute:server
 *   POST http://127.0.0.1:3099/autorouting/solve
 *     { "input_simple_route_json": { ... } }
 *   → { "output_simple_route_json": { ... traces } }
 *
 * Circuit:
 *   autorouter={{
 *     serverUrl: "http://127.0.0.1:3099",
 *     serverMode: "solve-endpoint",
 *     inputFormat: "simplified",
 *   }}
 */
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { existsSync } from "node:fs"
import { dsnFromSimpleRouteJson } from "./dsn-from-simple.mjs"
import { sesToSimplifiedTraces } from "./ses-to-traces.mjs"

const root = resolve(import.meta.dirname, "../..")
const port = Number(process.env.TOPOLA_AUTOROUTER_PORT || "3099")
const topolaBin =
  process.env.TOPOLA_BIN ||
  resolve(root, "third_party/topola/target/release/topola")
const timeoutSec = Number(process.env.TOPOLA_TIMEOUT || "120")

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

async function ensureTopola() {
  if (existsSync(topolaBin)) return
  await run("cargo", ["build", "--release", "-p", "topola-cli"], {
    cwd: resolve(root, "third_party/topola"),
  })
}

async function solveSimple(srj) {
  await ensureTopola()
  const dir = await mkdtemp(join(tmpdir(), "topola-srj-"))
  const dsnPath = join(dir, "board.dsn")
  const sesPath = join(dir, "board.ses")
  try {
    await writeFile(dsnPath, dsnFromSimpleRouteJson(srj))
    await run("timeout", [
      String(timeoutSec),
      topolaBin,
      dsnPath,
      "--multilayer",
      "-o",
      sesPath,
    ])
    const ses = await readFile(sesPath, "utf8")
    const traces = sesToSimplifiedTraces(ses, srj.minTraceWidth || 0.2)
    return { ...srj, traces }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString("utf8")
  return raw ? JSON.parse(raw) : {}
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`)
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, topola: existsSync(topolaBin) }))
    return
  }

  if (req.method === "POST" && url.pathname === "/autorouting/solve") {
    try {
      const body = await readJson(req)
      if (body.input_simple_route_json) {
        const out = await solveSimple(body.input_simple_route_json)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ output_simple_route_json: out }))
        return
      }
      if (body.input_circuit_json) {
        res.writeHead(501, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            error:
              "circuit_json not implemented here; use inputFormat simplified, or npm run route:circuit for KiCad Specctra",
          }),
        )
        return
      }
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "expected input_simple_route_json" }))
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: String(err?.stack || err) }))
    }
    return
  }

  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "not found" }))
})

server.listen(port, "127.0.0.1", () => {
  console.log(`Topola autorouting server on http://127.0.0.1:${port}`)
  console.log(`  POST /autorouting/solve  (inputFormat: simplified)`)
  console.log(`  GET  /health`)
  console.log(`  binary: ${topolaBin}`)
})
