/**
 * Resolve KiCad CLI across macOS app bundle and Linux AppImage.
 * CLI only — no Python. Mutation/DRC gating lives in Rust pcbkit.
 *
 * Override: KICAD_CLI, KICAD_APPIMAGE_ROOT
 */
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"

function firstExisting(candidates) {
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}

export function resolveKicadEnv() {
  const home = homedir()
  const appImageRoot =
    process.env.KICAD_APPIMAGE_ROOT ||
    resolve(home, "tools/kicad/squashfs-root")

  const macCli = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
  const linuxCli = firstExisting([
    resolve(appImageRoot, "usr/bin/kicad-cli"),
    "/usr/bin/kicad-cli",
  ])

  const cli = process.env.KICAD_CLI || firstExisting([macCli, linuxCli])
  const env = { ...process.env }

  if (cli && cli.includes("squashfs-root")) {
    const root = cli.split("/usr/bin/kicad-cli")[0]
    const lib = resolve(root, "usr/lib")
    env.LD_LIBRARY_PATH = [lib, env.LD_LIBRARY_PATH].filter(Boolean).join(":")
  }

  return { cli, env }
}

export function requireKicadEnv() {
  const k = resolveKicadEnv()
  if (!k.cli) {
    throw new Error(
      "kicad-cli not found. Set KICAD_CLI or install KiCad AppImage under ~/tools/kicad/squashfs-root",
    )
  }
  return k
}
