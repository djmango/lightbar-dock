/**
 * Demo board for the Topola HTTP autorouter adapter.
 *
 * Terminal A: bun run autoroute:server
 * Terminal B: bun run dev
 *
 * With the tscircuit `topola` preset (once merged): autorouter="topola"
 */
export default () => (
  <board
    width="30mm"
    height="20mm"
    autorouter={{
      serverUrl: "http://127.0.0.1:3099",
      serverMode: "solve-endpoint",
      inputFormat: "simplified",
    }}
  >
    <chip name="U1" footprint="soic8" pcbX={6} pcbY={0} />
    <resistor
      name="R1"
      pcbX={-6}
      pcbY={0}
      resistance={100}
      footprint="0402"
    />
    <resistor
      name="R2"
      pcbX={-6}
      pcbY={4}
      resistance={100}
      footprint="0402"
    />
    <trace from=".U1 > .pin1" to=".R1 > .pin1" />
    <trace from=".U1 > .pin2" to=".R2 > .pin1" />
  </board>
)
