# Upstream contribution for tscircuit/tscircuit#4078

Ready-to-open PRs adding a first-class `topola` autorouter preset + docs + example.

## Contents

| Path | Target |
| --- | --- |
| `patches/0001-props-…` | [tscircuit/props](https://github.com/tscircuit/props) — add `"topola"` to `AutorouterPreset` |
| `patches/0002-core-…` | [tscircuit/core](https://github.com/tscircuit/core) — `autorouter="topola"` → local solve-endpoint |
| `patches/0003-docs-…` | [tscircuit/docs](https://github.com/tscircuit/docs) — document Topola preset / adapter |
| `example-topola-autorouter/` | Standalone example (publish as `tscircuit/example-topola-autorouter` or under `djmango/`) |

## Apply

```bash
# props
git clone https://github.com/tscircuit/props.git && cd props
git checkout -b feature/topola-autorouter-preset
git apply /path/to/0001-props-add-topola-autorouter-preset.patch
# commit, push fork, open PR

# core (after props is available, or independently — only string preset wiring)
git clone https://github.com/tscircuit/core.git && cd core
git checkout -b feature/topola-autorouter-preset
git apply /path/to/0002-core-wire-topola-preset-to-local-solve-endpoint.patch
bun test tests/utils/autorouting/getPresetAutoroutingConfig.test.ts

# docs
git clone https://github.com/tscircuit/docs.git && cd docs
git checkout -b feature/topola-autorouter-preset
git apply /path/to/0003-docs-document-topola-autorouter-preset.patch
```

Reference adapter already shipping in this repo:
`packages/topola-autorouter/`.
