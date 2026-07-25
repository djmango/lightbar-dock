# @lightbar-dock/topola-autorouter

tscircuit HTTP autorouting adapter for **[Topola](https://topola.dev/)** (Rust Specctra DSN→SES).

## Run

From the repo root (builds `third_party/topola` CLI if needed):

```sh
npm run autoroute:server
```

## Use from a tscircuit board

```tsx
<board
  autorouter={{
    serverUrl: "http://127.0.0.1:3099",
    serverMode: "solve-endpoint",
    inputFormat: "simplified",
  }}
>
  …
</board>
```

`lightbar-dock` keeps `autorouter="none"` / KiCad Specctra (`npm run route:circuit`) for manufacturing so `npm run verify` stays deterministic without the server.

## API

- `POST /autorouting/solve` with `{ input_simple_route_json }` → `{ output_simple_route_json }` (adds `traces`)
- Optional body `options`: `{ planar, permutate, skipNets, nets, remaining, wallTimeout, timeoutSec }`
- `GET /health` → `{ ok, topola, binary, defaultArgs }`

Smoke test (no KiCad): `npm run smoke:autoroute`.

See [tscircuit autorouting API](https://docs.tscircuit.com/web-apis/autorouting-api) and [custom autorouters](https://docs.tscircuit.com/advanced/create-or-use-custom-autorouter).

## Env

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOPOLA_BIN` | `third_party/topola/target/release/topola` | Path to Topola CLI |
| `TOPOLA_AUTOROUTER_PORT` | `3099` | Listen port |
| `TOPOLA_TIMEOUT` | `120` | Outer `timeout(1)` seconds per solve |
| `TOPOLA_ARGS` | `--multilayer --timeout-progress-bonus 0 --wall-timeout 90` | Extra CLI flags |

## Upstream

Maturation patches live on the Topola fork branch `feature/cli-multilayer-remaining` (djmango/topola), intended for PRs to [codeberg.org/topola/topola](https://codeberg.org/topola/topola).
