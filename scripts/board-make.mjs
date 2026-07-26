#!/usr/bin/env bun
/**
 * End-to-end board make: Specctra route → KiCad zone refill → DRC gate.
 *
 *   bun run board:make
 *   bun run board:make -- --route-only          # Freerouting + SES apply only
 *   bun run board:make -- --skip-route          # zone refill + DRC only
 *   bun run board:make -- --ses path/to.ses     # apply existing SES
 *   bun run board:make -- --pin                 # refresh ci/artifacts on pass
 *
 * KiCad backend: Docker kicad/kicad:10.0 (preferred) or PATH kicad-cli.
 * No Python. No env-var pcbkit config.
 *
 * DSN note: ci/artifacts/v3-for-route.dsn is the checked-in Specctra export.
 * When placement changes: `bun run for-route:promote` (or `bun run dsn:export` /
 * KiCad GUI Specctra export), then `bun run dsn:check`.
 */
import { spawn } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { createHash } from "node:crypto"
import { runKicadCli, resolveKicadEnv } from "./kicad-env.mjs"

const root = resolve(import.meta.dirname, "..")
// Drop bare `--` from `bun run board:make -- --flag`.
const args = process.argv.slice(2).filter((a) => a !== "--")

function flag(name) {
  return args.includes(name)
}
function opt(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const skipRoute = flag("--skip-route")
const routeOnly = flag("--route-only")
const doPin = flag("--pin")
const ses = opt("--ses", null)
if (skipRoute && routeOnly) {
  console.error("use only one of --skip-route / --route-only")
  process.exit(2)
}

const pcbkit = resolve(root, "pcbkit/target/release/pcbkit")
const profile = resolve(root, "pcbkit/profiles/lightbar-dock.toml")

// Prefer local generated/ working copies; fall back to pinned CI inputs.
const pcbIn = firstExisting([
  resolve(root, "generated/kicad/v3-for-route.kicad_pcb"),
  resolve(root, "ci/artifacts/v3-for-route.kicad_pcb"),
])
const dsnIn = firstExisting([
  resolve(root, "generated/kicad/v3-for-route.dsn"),
  resolve(root, "ci/artifacts/v3-for-route.dsn"),
])
const proIn = firstExisting([
  resolve(root, "generated/kicad/v3-for-route.kicad_pro"),
  resolve(root, "ci/artifacts/v3-manufacturing.kicad_pro"),
  resolve(root, "ci/artifacts/v3-for-route.kicad_pro"),
])

const outDir = resolve(root, "generated/kicad")
const outPcb = resolve(outDir, "v3-board-make.kicad_pcb")
const outPro = resolve(outDir, "v3-board-make.kicad_pro")
const drcJson = resolve(root, "generated/reports/v3-board-make-drc.json")

function firstExisting(paths) {
  for (const p of paths) if (existsSync(p)) return p
  return null
}

async function run(cmd, cmdArgs, cwd = root) {
  console.log("+", cmd, cmdArgs.join(" "))
  return new Promise((resolvePromise, reject) => {
    const c = spawn(cmd, cmdArgs, { cwd, stdio: "inherit" })
    c.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} exit ${code}`)),
    )
  })
}

function sha256File(path) {
  const h = createHash("sha256")
  h.update(readFileSync(path))
  return h.digest("hex")
}

function writeManifest(pcbPath, proPath) {
  const text = `# Pinned manufacturing artifacts. CI verifies sha256 before layout DRC.

[[artifacts]]
path = "ci/artifacts/v3-manufacturing.kicad_pcb"
sha256 = "${sha256File(pcbPath)}"
role = "manufacturing_pcb"

[[artifacts]]
path = "ci/artifacts/v3-manufacturing.kicad_pro"
sha256 = "${sha256File(proPath)}"
role = "manufacturing_project"
`
  writeFileSync(resolve(root, "ci/artifacts/manifest.toml"), text)
}

// --- ensure toolchain ---
// Java only needed when Freerouting runs (not --ses / --skip-route).
if (!skipRoute && !ses) {
  await run("bun", [resolve(root, "scripts/ensure-java.mjs")])
}
if (!existsSync(pcbkit)) {
  await run("cargo", ["build", "--release", "-p", "pcbkit-cli"], resolve(root, "pcbkit"))
}

mkdirSync(outDir, { recursive: true })
mkdirSync(dirname(drcJson), { recursive: true })

if (!pcbIn || !dsnIn) {
  console.error(
    "Missing unrouted PCB/DSN.\n" +
      "  Expected generated/kicad/v3-for-route.{kicad_pcb,dsn}\n" +
      "  or ci/artifacts/v3-for-route.{kicad_pcb,dsn}\n" +
      "DSN is regenerated manually from KiCad Specctra export when placement changes.",
  )
  process.exit(1)
}

// --- 1) route ---
if (!skipRoute) {
  const routeArgs = [
    "route-board",
    "--pcb",
    pcbIn,
    "--dsn",
    dsnIn,
    "--profile",
    profile,
    "--out",
    outPcb,
    // Default: empty GND outlines (no --zones-from). KiCad --refill-zones fills.
  ]
  if (ses) routeArgs.push("--ses", resolve(root, ses))
  await run(pcbkit, routeArgs)
} else if (!existsSync(outPcb)) {
  console.error(`--skip-route but missing ${outPcb}`)
  process.exit(1)
}

// Project rules beside the board so DRC/netclasses load.
if (proIn) {
  copyFileSync(proIn, outPro)
} else {
  console.warn("warn: no .kicad_pro found; DRC may use KiCad defaults")
}

// Footprint library table so KiCad can resolve `tscircuit:*` for lib checks.
const fpLibSrc = resolve(root, "ci/artifacts/fp-lib-table")
const fpLibDst = resolve(outDir, "fp-lib-table")
if (existsSync(fpLibSrc)) {
  copyFileSync(fpLibSrc, fpLibDst)
} else {
  console.warn("warn: missing ci/artifacts/fp-lib-table — lib_footprint_issues likely")
}

if (routeOnly) {
  console.log("board:make route-only OK:", outPcb)
  console.log("next: bun run board:make -- --skip-route   # zone refill + DRC")
  process.exit(0)
}

// --- 2) KiCad zone refill + DRC ---
const kicad = resolveKicadEnv()
console.log(
  `kicad backend: ${kicad.mode}${
    kicad.mode === "docker"
      ? ` (${kicad.dockerImage})`
      : kicad.cli
        ? ` (${kicad.cli})`
        : ""
  }`,
)

const pcbRel = relative(root, outPcb)
const drcRel = relative(root, drcJson)
const code = runKicadCli(
  [
    "pcb",
    "drc",
    "--format",
    "json",
    "--severity-error",
    "--severity-warning",
    "--refill-zones",
    "--save-board",
    "-o",
    drcRel,
    pcbRel,
  ],
  { workdir: root },
)
if (code !== 0) {
  console.error(`kicad-cli pcb drc failed (exit ${code})`)
  process.exit(code)
}

// --- 3) Rust DRC gate ---
await run(pcbkit, [
  "drc-gate",
  "-j",
  drcJson,
  "--max-unconnected",
  "0",
  "--max-fatal-errors",
  "0",
  // Hygiene: no silk/lib noise on the manufacturing path.
  "--max-type",
  "silk_edge_clearance=0",
  "--max-type",
  "lib_footprint_issues=0",
  "--max-type",
  "silk_over_copper=0",
  "--max-type",
  "lib_footprint_mismatch=0",
])

console.log("board:make OK:", outPcb)
console.log("drc:", drcJson)

// --- 4) optional pin refresh ---
if (doPin) {
  if (!proIn) {
    console.error("--pin requires a .kicad_pro source")
    process.exit(1)
  }
  copyFileSync(outPcb, resolve(root, "ci/artifacts/v3-manufacturing.kicad_pcb"))
  copyFileSync(outPro, resolve(root, "ci/artifacts/v3-manufacturing.kicad_pro"))
  writeManifest(
    resolve(root, "ci/artifacts/v3-manufacturing.kicad_pcb"),
    resolve(root, "ci/artifacts/v3-manufacturing.kicad_pro"),
  )
  await run(pcbkit, ["pin", "--manifest", "ci/artifacts/manifest.toml"])
  console.log("pinned ci/artifacts/v3-manufacturing.{kicad_pcb,kicad_pro}")
}
