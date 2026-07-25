# tscircuit Topola Autorouter Example

HTTP `solve-endpoint` adapter that shells [Topola](https://topola.dev/)
(Rust Specctra DSN→SES) for tscircuit boards.

Related: [tscircuit/tscircuit#4078](https://github.com/tscircuit/tscircuit/issues/4078)

## Quick start

1. Install a Topola CLI that supports `--multilayer` (see
   [djmango/topola](https://github.com/djmango/topola) /
   [upstream PR](https://github.com/mikwielgus/topola/pull/1)) and put it on
   `PATH`, or set `TOPOLA_BIN`.

2. Install and run the adapter + demo board:

```bash
bun install
bun run autoroute:server   # http://127.0.0.1:3099
# other terminal:
bun run dev
```

The demo board uses:

```tsx
autorouter={{
  serverUrl: "http://127.0.0.1:3099",
  serverMode: "solve-endpoint",
  inputFormat: "simplified",
}}
```

Once the `topola` preset lands in `@tscircuit/core`, you can write
`autorouter="topola"` instead.

## API

| Endpoint | Body | Response |
| --- | --- | --- |
| `POST /autorouting/solve` | `{ input_simple_route_json }` | `{ output_simple_route_json }` with `traces` |
| `GET /health` | — | `{ ok, topola, binary }` |

See the [Autorouting API](https://docs.tscircuit.com/web-apis/autorouting-api)
and [custom autorouters](https://docs.tscircuit.com/advanced/create-or-use-custom-autorouter).

## Env

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOPOLA_BIN` | `topola` on `PATH` | Path to Topola CLI |
| `TOPOLA_AUTOROUTER_PORT` | `3099` | Listen port |
| `TOPOLA_TIMEOUT` | `120` | Wall timeout seconds per solve |
