#!/usr/bin/env sh
set -eu

root="$(git rev-parse --show-toplevel)"
destination="$root/third_party/ch32fun"
commit="d60d0fd344c3d453020b4dd1500e386e87335c16"

if [ ! -d "$destination/.git" ]; then
  mkdir -p "$root/third_party"
  git clone https://github.com/cnlohr/ch32fun.git "$destination"
fi

git -C "$destination" fetch --depth 1 origin "$commit"
git -C "$destination" checkout --detach "$commit"
printf 'ch32fun ready at %s\n' "$commit"
