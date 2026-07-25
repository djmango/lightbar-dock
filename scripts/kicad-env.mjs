/**
 * Resolve KiCad CLI + pcbnew Python across macOS app bundle and Linux AppImage.
 *
 * Override with:
 *   KICAD_CLI, KICAD_PYTHON, KICAD_PYTHONHOME, KICAD_EXTRA_LIB
 * Optional search roots:
 *   KICAD_APPIMAGE_ROOT (default: ~/tools/kicad/squashfs-root)
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

  const macPython =
    "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9/bin/python3"
  const macPythonHome =
    "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/3.9"
  const macFrameworks =
    "/Applications/KiCad/KiCad.app/Contents/Frameworks"
  const macCli = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"

  const linuxPython = firstExisting([
    resolve(appImageRoot, "usr/bin/python3.11"),
    resolve(appImageRoot, "usr/bin/python3"),
    "/usr/bin/python3",
  ])
  const linuxCli = firstExisting([
    resolve(appImageRoot, "usr/bin/kicad-cli"),
    "/usr/bin/kicad-cli",
  ])

  const python =
    process.env.KICAD_PYTHON ||
    firstExisting([macPython, linuxPython])
  const cli =
    process.env.KICAD_CLI || firstExisting([macCli, linuxCli])

  const isMac = python === macPython || cli === macCli
  const pythonHome =
    process.env.KICAD_PYTHONHOME || (isMac ? macPythonHome : undefined)
  const dyldFallback =
    process.env.KICAD_EXTRA_LIB || (isMac ? macFrameworks : undefined)

  const env = { ...process.env }
  if (pythonHome) env.PYTHONHOME = pythonHome
  else delete env.PYTHONHOME
  if (dyldFallback) env.DYLD_FALLBACK_LIBRARY_PATH = dyldFallback

  // Linux AppImage: ensure bundled libs are visible when invoking python/cli directly.
  if (!isMac && appImageRoot && existsSync(appImageRoot)) {
    const libDirs = [
      resolve(appImageRoot, "usr/lib"),
      resolve(appImageRoot, "usr/lib/x86_64-linux-gnu"),
      resolve(appImageRoot, "usr/lib64"),
    ].filter((p) => existsSync(p))
    if (libDirs.length) {
      env.LD_LIBRARY_PATH = [...libDirs, env.LD_LIBRARY_PATH || ""]
        .filter(Boolean)
        .join(":")
    }
    const pathPrefix = resolve(appImageRoot, "usr/bin")
    if (existsSync(pathPrefix)) {
      env.PATH = `${pathPrefix}:${env.PATH || ""}`
    }
  }

  return {
    python,
    cli,
    env,
    isMac,
    appImageRoot: existsSync(appImageRoot) ? appImageRoot : null,
  }
}

export function requireKicadEnv() {
  const k = resolveKicadEnv()
  if (!k.python) {
    console.error(
      "KiCad Python not found. Install KiCad 10, extract the Linux AppImage to ~/tools/kicad/squashfs-root, or set KICAD_PYTHON.",
    )
    process.exit(1)
  }
  if (!k.cli) {
    console.error(
      "kicad-cli not found. Install KiCad 10 or set KICAD_CLI.",
    )
    process.exit(1)
  }
  return k
}
