#!/usr/bin/env node

/**
 * Finish open ratsnest edges with the clearance-aware KiCad grid A* finisher.
 *
 * Prefer this over Specctra SES re-import for already-routed boards —
 * ImportSpecctraSES of a Topola SES rewrites copper and can explode unconnected counts.
 *
 * Env: FINISH_* vars consumed by scripts/finish-remaining-grid.py
 */
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { requireKicadEnv } from "./kicad-env.mjs"

const root = resolve(import.meta.dirname, "..")
const { python: kicadPython, cli: kicadCli, env } = requireKicadEnv()
const pcb = resolve(root, process.env.FINISH_PCB || "generated/kicad/v3-routed.kicad_pcb")
const drc = resolve(root, "generated/reports/v3-drc.json")

function run(cmd, args, opts = {}) {
  console.log("+", cmd, args.join(" "))
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts })
    child.on("exit", (c) => (c === 0 ? resolvePromise() : reject(new Error(`${cmd} ${c}`))))
  })
}

await new Promise((r) => {
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
      drc,
      pcb,
    ],
    { cwd: root, stdio: "inherit" },
  )
  child.on("exit", () => r())
})

await run(kicadPython, ["-u", resolve(root, "scripts/finish-remaining-grid.py")], {
  env,
})

await new Promise((r) => {
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
      drc,
      pcb,
    ],
    { cwd: root, stdio: "inherit" },
  )
  child.on("exit", () => r())
})

console.log("Finished. Board:", pcb)
console.log("DRC:", drc)
