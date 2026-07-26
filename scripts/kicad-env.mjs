/**
 * Resolve KiCad CLI as a pinned backend tool (not an AppImage lifestyle).
 *
 * Preference order:
 *   1. KICAD_CLI / PATH `kicad-cli` (system package, CI container)
 *   2. Docker image `kicad/kicad:10.0` (hermetic; matches CI)
 *   3. AppImage extract under ~/tools/kicad/squashfs-root (fallback)
 *
 * No Python. Zone fill + DRC only — routing lives in pcbkit.
 */
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

export const KICAD_DOCKER_IMAGE = "kicad/kicad:10.0"

function firstExisting(candidates) {
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}

function which(bin) {
  const r = spawnSync("bash", ["-lc", `command -v ${bin}`], {
    encoding: "utf8",
  })
  return r.status === 0 ? r.stdout.trim() : ""
}

/**
 * @returns {{
 *   mode: "native" | "docker" | "none",
 *   cli: string | null,
 *   dockerImage: string,
 *   env: NodeJS.ProcessEnv,
 * }}
 */
export function resolveKicadEnv() {
  const home = homedir()
  const appImageRoot =
    process.env.KICAD_APPIMAGE_ROOT ||
    resolve(home, "tools/kicad/squashfs-root")

  const macCli = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
  const native = process.env.KICAD_CLI ||
    firstExisting([
      macCli,
      resolve(appImageRoot, "usr/bin/kicad-cli"),
      "/usr/bin/kicad-cli",
      which("kicad-cli"),
    ])

  const env = { ...process.env }
  if (native && native.includes("squashfs-root")) {
    const root = native.split("/usr/bin/kicad-cli")[0]
    const lib = resolve(root, "usr/lib")
    env.LD_LIBRARY_PATH = [lib, env.LD_LIBRARY_PATH].filter(Boolean).join(":")
  }

  if (native) {
    return {
      mode: "native",
      cli: native,
      dockerImage: KICAD_DOCKER_IMAGE,
      env,
    }
  }

  const docker = which("docker")
  if (docker) {
    return {
      mode: "docker",
      cli: "kicad-cli",
      dockerImage: process.env.KICAD_DOCKER_IMAGE || KICAD_DOCKER_IMAGE,
      env,
    }
  }

  return {
    mode: "none",
    cli: null,
    dockerImage: KICAD_DOCKER_IMAGE,
    env,
  }
}

export function requireKicadEnv() {
  const k = resolveKicadEnv()
  if (k.mode === "none") {
    throw new Error(
      "kicad-cli not found. Install Docker (preferred: kicad/kicad:10.0), " +
        "or put kicad-cli on PATH, or extract AppImage under ~/tools/kicad/squashfs-root",
    )
  }
  return k
}

/**
 * Run kicad-cli with args. `workdir` is the host directory mounted at /work
 * when using Docker (and used as cwd for native).
 *
 * Args should use paths relative to `workdir` (or absolute host paths that
 * will be rewritten to /work/... for Docker).
 */
export function runKicadCli(args, { workdir, stdio = "inherit" } = {}) {
  const k = requireKicadEnv()
  const cwd = workdir || process.cwd()

  if (k.mode === "native") {
    const r = spawnSync(k.cli, args, { cwd, env: k.env, stdio })
    return r.status ?? 1
  }

  // Docker: mount repo workdir at /work, rewrite absolute paths under cwd → /work/...
  const rewritten = args.map((a) => {
    if (typeof a !== "string") return a
    if (a.startsWith(cwd + "/")) return "/work/" + a.slice(cwd.length + 1)
    if (a === cwd) return "/work"
    return a
  })
  const dockerArgs = [
    "run",
    "--rm",
    "--user",
    "root",
    "-v",
    `${cwd}:/work`,
    "-w",
    "/work",
    k.dockerImage,
    "kicad-cli",
    ...rewritten,
  ]
  console.log("+ docker", dockerArgs.join(" "))
  const r = spawnSync("docker", dockerArgs, { stdio })
  return r.status ?? 1
}
