import { Fragment } from "react"
import { ChargePortPower } from "./components/ChargePortPower"
import { PowerInput } from "./components/PowerInput"
import { StatusController } from "./components/StatusController"
import { Tps54560Buck } from "./components/Tps54560Buck"
import { MOUNTING_HOLES } from "./placement"

const BOARD_SILK = {
  // Native tscircuit board coordinates, origin at board center.
  // These live on the top-side bottom edge in the visual service strip above
  // the status LEDs. Text is split into short blocks to avoid mounting holes
  // and component bodies.
  brand: {
    text: "SKG // LIGHTBAR DOCK // V3",
    pcbX: 55,
    pcbY: -20.4,
    fontSize: "1.35mm",
  },
  input: {
    text: "IN: USB C PD 12V OR DC 12V",
    pcbX: -43,
    pcbY: -21.2,
    fontSize: "0.8mm",
  },
  output: {
    text: "OUT: 5V 1A/PORT",
    pcbX: -43,
    pcbY: -18.8,
    fontSize: "0.8mm",
  },
} as const

/**
 * Manufacturing routing: Rust pcbkit (`bun run pcbkit:route` / `route:board`).
 * Pinned board: ci/artifacts/v3-manufacturing.kicad_pcb.
 * Optional in-editor HTTP adapter: `bun run autoroute:pcbkit` (set
 * USE_TOPOLA_SERVER and point autorouter at http://127.0.0.1:3099).
 */
const USE_TOPOLA_SERVER = false
const topolaAutorouter = {
  serverUrl: "http://127.0.0.1:3099",
  serverMode: "solve-endpoint" as const,
  inputFormat: "simplified" as const,
}

export default function LightbarDock() {
  return (
    <board
      name="LIGHTBAR_DOCK"
      width="240mm"
      height="47mm"
      thickness="1.6mm"
      pcbX={0}
      pcbY={0}
      minTraceWidth="0.15mm"
      nominalTraceWidth="0.15mm"
      minTraceToPadEdgeClearance="0.15mm"
      minPadEdgeToPadEdgeClearance="0.15mm"
      minViaHoleEdgeToViaHoleEdgeClearance="0.15mm"
      minPlatedHoleDrillEdgeToDrillEdgeClearance="0.2mm"
      minBoardEdgeClearance="0.2mm"
      minViaHoleDiameter="0.3mm"
      minViaPadDiameter="0.6mm"
      autorouter={USE_TOPOLA_SERVER ? topolaAutorouter : "none"}
      schematicDisabled
    >
      <subcircuit
        name="MAIN"
        pcbX={0}
        pcbY={0}
        minTraceWidth="0.15mm"
        nominalTraceWidth="0.15mm"
        minTraceToPadEdgeClearance="0.15mm"
        minPadEdgeToPadEdgeClearance="0.15mm"
        minViaHoleEdgeToViaHoleEdgeClearance="0.15mm"
        minViaHoleDiameter="0.3mm"
        minViaPadDiameter="0.6mm"
        autorouter={USE_TOPOLA_SERVER ? topolaAutorouter : "none"}
        schAutoLayoutEnabled={false}
      >
        <PowerInput />
        <Tps54560Buck variant="A" />
        <Tps54560Buck variant="B" />
        {Array.from({ length: 8 }, (_, index) => (
          <ChargePortPower key={index} index={index} />
        ))}
        <StatusController />
        {Object.values(BOARD_SILK).map(({ text, pcbX, pcbY, fontSize }) => (
          <Fragment key={text}>
            <silkscreentext
              text={text}
              layer="top"
              pcbX={pcbX}
              pcbY={pcbY}
              fontSize={fontSize}
              anchorAlignment="center"
            />
          </Fragment>
        ))}

        {MOUNTING_HOLES.map((placement, index) => (
          <Fragment key={index}>
            <hole name={`H${index + 1}`} diameter="3.2mm" {...placement} />
          </Fragment>
        ))}
        {/* Copper pour re-enabled after routing — pour solve is very slow during export. */}
      </subcircuit>
    </board>
  )
}
