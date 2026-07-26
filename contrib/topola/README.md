# Topola fork notes

The submodule pins `djmango/topola` @ `feature/cli-multilayer-remaining`
(includes CLI multilayer/remaining/nets flags and dense-board robustness:
skip failed anteroute fanouts and cross-layer navmesh pairs instead of
panicking).

Upstream PR: https://github.com/mikwielgus/topola/pull/1

Build:

```sh
cargo build --release -p topola-cli --manifest-path third_party/topola/Cargo.toml
```

`scripts/setup-toolchain.sh` still applies any `contrib/topola/*.patch` files
idempotently if present.
