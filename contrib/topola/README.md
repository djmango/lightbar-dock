# Topola fork patches (applied on top of submodule)

The submodule pins `djmango/topola` @ `feature/cli-multilayer-remaining`
(`5d10621`). Additional robustness fixes for dense boards live here until they
land on the fork / upstream:

| Patch | Purpose |
| --- | --- |
| `0001-skip-failed-fanouts-and-cross-layer-navmesh.patch` | Do not panic when anteroute fanout fails or navmesh origin/destination layers differ |

`scripts/setup-toolchain.sh` applies these after `git submodule update`.
Manual:

```sh
git -C third_party/topola apply contrib/topola/0001-skip-failed-fanouts-and-cross-layer-navmesh.patch
cargo build --release -p topola-cli --manifest-path third_party/topola/Cargo.toml
```
