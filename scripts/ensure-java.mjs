#!/usr/bin/env bun
/**
 * Ensure `third_party/java/bin/java` resolves for pcbkit Freerouting.
 * Freerouting 2.2.4 needs Java 25+ (class file 69).
 * No env-var config — only creates a repo-local symlink when a JDK is found.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(import.meta.dirname, "..")
const link = resolve(root, "third_party/java/bin/java")

function which(bin) {
  const r = spawnSync("bash", ["-lc", `command -v ${bin}`], { encoding: "utf8" })
  return r.status === 0 ? r.stdout.trim() : ""
}

function javaMajor(bin) {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" })
  const text = `${r.stderr || ""}\n${r.stdout || ""}`
  const m = text.match(/version "(\d+)/)
  return m ? Number(m[1]) : 0
}

function findTemurin() {
  const base = resolve(process.env.HOME || "", "tools/java")
  if (!existsSync(base)) return ""
  try {
    // Prefer newest JDK (Freerouting 2.2.4 needs Java 25+).
    const dirs = readdirSync(base)
      .filter((d) => d.startsWith("jdk-"))
      .sort()
      .reverse()
    for (const d of dirs) {
      const p = resolve(base, d, "bin/java")
      if (existsSync(p) && javaMajor(p) >= 25) return p
    }
    // Fall back to any temurin if nothing ≥25 (caller may still fail).
    for (const d of dirs) {
      const p = resolve(base, d, "bin/java")
      if (existsSync(p)) return p
    }
  } catch {
    /* ignore */
  }
  return ""
}

if (existsSync(link)) {
  try {
    const target = readlinkSync(link)
    const abs =
      existsSync(target) ? target : resolve(dirname(link), target)
    if (existsSync(abs) && javaMajor(abs) >= 25) {
      console.log("java:", link, "->", abs, `(${javaMajor(abs)})`)
      process.exit(0)
    }
    // Stale / too-old symlink — replace.
    unlinkSync(link)
  } catch {
    try {
      unlinkSync(link)
    } catch {
      /* ignore */
    }
  }
}

const candidates = [findTemurin(), which("java")].filter(Boolean)
const java = candidates.find((p) => existsSync(p) && javaMajor(p) >= 25)
if (!java) {
  console.error(
    "No Java 25+ found (required by Freerouting 2.2.4).\n" +
      "Install Temurin 25 under ~/tools/java/ or put java≥25 on PATH,\n" +
      "then re-run (symlink: third_party/java/bin/java).",
  )
  process.exit(1)
}

mkdirSync(dirname(link), { recursive: true })
symlinkSync(java, link)
console.log("java:", link, "->", java, `(${javaMajor(java)})`)
