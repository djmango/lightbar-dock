#!/usr/bin/env bun
/**
 * Ensure `third_party/java/bin/java` resolves for pcbkit Freerouting.
 * No env-var config — only creates a repo-local symlink when a JDK is found.
 */
import { existsSync, mkdirSync, symlinkSync, readlinkSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(import.meta.dirname, "..")
const link = resolve(root, "third_party/java/bin/java")

function which(bin) {
  const r = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" })
  return r.status === 0 ? r.stdout.trim() : ""
}

if (existsSync(link)) {
  try {
    const target = readlinkSync(link)
    if (existsSync(resolve(dirname(link), target)) || existsSync(target)) {
      console.log("java:", link, "->", target)
      process.exit(0)
    }
  } catch {
    // not a symlink or broken — recreate below
  }
}

const candidates = [
  resolve(process.env.HOME || "", "tools/java/jdk-25.0.3+9/bin/java"),
  which("java"),
].filter(Boolean)

const java = candidates.find((p) => existsSync(p))
if (!java) {
  console.error(
    "No Java found. Install a JDK and re-run, or place java at third_party/java/bin/java",
  )
  process.exit(1)
}

mkdirSync(dirname(link), { recursive: true })
try {
  symlinkSync(java, link)
} catch (e) {
  if (e.code !== "EEXIST") throw e
}
console.log("java:", link, "->", java)
