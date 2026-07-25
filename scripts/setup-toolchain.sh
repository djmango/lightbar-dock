#!/usr/bin/env bash
# Bootstrap local tooling for lightbar-dock (Node/Bun, Topola, optional KiCad AppImage).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm ci"
npm ci

echo "==> git submodules"
git submodule update --init --recursive

if ! command -v bun >/dev/null 2>&1; then
  echo "==> installing Bun (required for tsci)"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
echo "    bun: $(command -v bun) ($(bun --version))"

echo "==> building Topola CLI (release)"
cargo build --release -p topola-cli --manifest-path third_party/topola/Cargo.toml
echo "    binary: third_party/topola/target/release/topola"

KICAD_ROOT="${KICAD_APPIMAGE_ROOT:-$HOME/tools/kicad/squashfs-root}"
if [[ -x "$KICAD_ROOT/usr/bin/kicad-cli" ]]; then
  echo "==> KiCad CLI found: $KICAD_ROOT/usr/bin/kicad-cli"
elif [[ -x /Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli ]]; then
  echo "==> KiCad.app found (macOS)"
else
  echo "==> KiCad not found."
  echo "    Linux: download kicad-*-x86_64.AppImage from"
  echo "      https://github.com/KiCad/kicad-source-mirror/releases"
  echo "    then:  cd ~/tools/kicad && ./kicad-*.AppImage --appimage-extract"
  echo "    (creates squashfs-root/; scripts/kicad-env.mjs picks it up)."
fi

echo ""
echo "Next:"
echo "  npm run verify"
echo "  npm run autoroute:server   # optional HTTP adapter :3099"
echo "  npm run smoke:autoroute    # tiny SRJ solve"
echo "  npm run route:circuit      # needs unrouted PCB + KiCad"
