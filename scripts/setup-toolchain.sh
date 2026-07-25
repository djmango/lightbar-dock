#!/usr/bin/env bash
# Bootstrap local tooling for lightbar-dock (Bun, Topola, optional KiCad AppImage).
# Routing/IR is Rust (pcbkit + Topola). Bun only runs tscircuit/scripts glue.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "==> installing Bun"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
echo "==> bun: $(command -v bun) ($(bun --version))"

echo "==> bun install"
bun install

echo "==> git submodules"
git submodule update --init --recursive

echo "==> applying local Topola patches (contrib/topola)"
shopt -s nullglob
for patch in "$ROOT"/contrib/topola/*.patch; do
  # Idempotent: reverse-check, then apply if needed.
  if git -C third_party/topola apply --reverse --check "$patch" >/dev/null 2>&1; then
    echo "    already applied: $(basename "$patch")"
  else
    git -C third_party/topola apply "$patch"
    echo "    applied: $(basename "$patch")"
  fi
done

echo "==> building Topola CLI (release)"
cargo build --release -p topola-cli --manifest-path third_party/topola/Cargo.toml
echo "    binary: third_party/topola/target/release/topola"

echo "==> building pcbkit CLI (release)"
cargo build --release --manifest-path pcbkit/Cargo.toml
echo "    binary: pcbkit/target/release/pcbkit"

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
echo "  bun run verify"
echo "  bun run pcbkit:smoke        # Rust circuit-json route smoke"
echo "  bun run autoroute:pcbkit    # optional tscircuit HTTP adapter"
echo "  bun run route:circuit       # legacy KiCad Specctra path (needs KiCad)"
