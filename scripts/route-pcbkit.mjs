#!/usr/bin/env bun
/**
 * Route build/lightbar-dock.circuit.json with pcbkit (TOML profile, no env).
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const pcbkit = resolve(root, "pcbkit/target/release/pcbkit")
const profile = resolve(root, "pcbkit/profiles/lightbar-dock.toml")
const input = resolve(root, "build/lightbar-dock.circuit.json")
const out = resolve(root, "build/lightbar-dock.routed.circuit.json")

const extra = process.argv.slice(2)

async function ensure() {
  if (existsSync(pcbkit)) return
  await new Promise((resolvePromise, reject) => {
    const c = spawn("cargo", ["build", "--release", "-p", "pcbkit-cli"], {
      cwd: resolve(root, "pcbkit"),
      stdio: "inherit",
    })
    c.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`cargo exit ${code}`)),
    )
  })
}

await ensure()
const args = [
  "route",
  "--input",
  input,
  "--profile",
  profile,
  "--out",
  out,
  ...extra,
]
console.log("+", pcbkit, args.join(" "))
const child = spawn(pcbkit, args, { cwd: root, stdio: "inherit" })
const code = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)))
process.exit(code)
