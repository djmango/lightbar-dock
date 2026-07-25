import { Fragment } from "react"
import { POWER_NETS } from "../nets"
import { BUCK_PLACEMENT } from "../placement"
import {
  BuckDiode,
  BuckInductor,
  Tps54560,
} from "./legacy-parts"

type BuckVariant = "A" | "B"

const CONFIG = {
  A: {
    refs: {
      u: "U3",
      diode: "D1",
      inductor: "L1",
      bootCap: "C3",
      inputCaps: ["C6", "C7", "C8"],
      outputCaps: ["C9", "C10", "C11", "C12"],
      compCaps: ["C4", "C5"],
      compResistor: "R5",
      feedbackResistors: ["R6", "R7"],
      frequencyResistor: "R8",
      enableResistors: ["R15", "R13"],
    },
    output: POWER_NETS.rail5vA,
  },
  B: {
    refs: {
      u: "U4",
      diode: "D2",
      inductor: "L2",
      bootCap: "C13",
      inputCaps: ["C16", "C17", "C18"],
      outputCaps: ["C19", "C20", "C21", "C22"],
      compCaps: ["C14", "C15"],
      compResistor: "R9",
      feedbackResistors: ["R10", "R11"],
      frequencyResistor: "R12",
      enableResistors: ["R16", "R14"],
    },
    output: POWER_NETS.rail5vB,
  },
} as const

export function Tps54560Buck({ variant }: { variant: BuckVariant }) {
  const config = CONFIG[variant]
  const refs = config.refs
  const placement = BUCK_PLACEMENT[variant]
  const prefix = `buck_${variant.toLowerCase()}`
  const switchNet = `${prefix}_switch`
  const bootNet = `${prefix}_boot`
  const feedbackNet = `${prefix}_feedback`
  const compensationNet = `${prefix}_compensation`
  const compensationSeriesNet = `${prefix}_compensation_series`
  const enableNet = `${prefix}_enable`
  const rtNet = `${prefix}_rt`

  return (
    <>
      <Tps54560 name={refs.u} {...placement.U} />
      <BuckDiode name={refs.diode} {...placement.D} />
      <BuckInductor name={refs.inductor} {...placement.L} />
      <capacitor
        name={refs.bootCap}
        capacitance="100nF"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C307331"] }}
        {...placement.boot}
      />

      {refs.inputCaps.map((name, index) => (
        <capacitor
          key={name}
          name={name}
          capacitance="10uF"
          footprint="0805"
          supplierPartNumbers={{ jlcpcb: ["C440198"] }}
          {...placement.inputCaps[index]}
        />
      ))}
      {refs.outputCaps.map((name, index) => (
        <capacitor
          key={name}
          name={name}
          capacitance="22uF"
          footprint="0805"
          supplierPartNumbers={{ jlcpcb: ["C45783"] }}
          {...placement.outputCaps[index]}
        />
      ))}

      <resistor
        name={refs.compResistor}
        resistance="23.7k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C327362"] }}
        {...placement.compensationResistor}
      />
      <capacitor
        name={refs.compCaps[0]}
        capacitance="4.7nF"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C281757"] }}
        {...placement.compensationCapacitors[0]}
      />
      <capacitor
        name={refs.compCaps[1]}
        capacitance="10pF"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C466222"] }}
        {...placement.compensationCapacitors[1]}
      />
      <resistor
        name={refs.frequencyResistor}
        resistance="162k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C54068"] }}
        {...placement.frequencyResistor}
      />
      <resistor
        name={refs.feedbackResistors[0]}
        resistance="17.8k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C129766"] }}
        {...placement.feedbackResistors[0]}
      />
      <resistor
        name={refs.feedbackResistors[1]}
        resistance="3.4k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C4940"] }}
        {...placement.feedbackResistors[1]}
      />
      <resistor
        name={refs.enableResistors[0]}
        resistance="100k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25741"] }}
        {...placement.enableResistors[0]}
      />
      <resistor
        name={refs.enableResistors[1]}
        resistance="24k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25769"] }}
        {...placement.enableResistors[1]}
      />

      <trace
        from={`.${refs.u} > .vin`}
        to={`net.${POWER_NETS.vin12}`}
        width="1.2mm"
      />
      <trace from={`.${refs.u} > .ground`} to={`net.${POWER_NETS.gnd}`} />
      <trace
        from={`.${refs.u} > .exposedGround`}
        to={`net.${POWER_NETS.gnd}`}
      />
      <trace from={`.${refs.u} > .boot`} to={`net.${bootNet}`} />
      <trace from={`.${refs.u} > .switch`} to={`net.${switchNet}`} width="1mm" />
      <trace from={`.${refs.u} > .feedback`} to={`net.${feedbackNet}`} />
      <trace
        from={`.${refs.u} > .compensation`}
        to={`net.${compensationNet}`}
      />
      <trace from={`.${refs.u} > .enable`} to={`net.${enableNet}`} />
      <trace from={`.${refs.u} > .rtClock`} to={`net.${rtNet}`} />

      <trace from={`.${refs.bootCap} > .pin1`} to={`net.${bootNet}`} />
      <trace from={`.${refs.bootCap} > .pin2`} to={`net.${switchNet}`} />
      <trace from={`.${refs.diode} > .cathode`} to={`net.${switchNet}`} width="1mm" />
      <trace from={`.${refs.diode} > .anode`} to={`net.${POWER_NETS.gnd}`} />
      <trace from={`.${refs.inductor} > .input`} to={`net.${switchNet}`} width="1mm" />
      <trace
        from={`.${refs.inductor} > .output`}
        to={`net.${config.output}`}
        width="1.2mm"
      />

      {refs.inputCaps.map((name) => (
        <Fragment key={name}>
          <trace
            from={`.${name} > .pin1`}
            to={`net.${POWER_NETS.vin12}`}
            width="1.2mm"
          />
          <trace from={`.${name} > .pin2`} to={`net.${POWER_NETS.gnd}`} />
        </Fragment>
      ))}
      {refs.outputCaps.map((name) => (
        <Fragment key={name}>
          <trace
            from={`.${name} > .pin1`}
            to={`net.${config.output}`}
            width="1.2mm"
          />
          <trace from={`.${name} > .pin2`} to={`net.${POWER_NETS.gnd}`} />
        </Fragment>
      ))}

      <trace from={`.${refs.compResistor} > .pin1`} to={`net.${compensationNet}`} />
      <trace
        from={`.${refs.compResistor} > .pin2`}
        to={`net.${compensationSeriesNet}`}
      />
      <trace from={`.${refs.compCaps[0]} > .pin1`} to={`net.${compensationSeriesNet}`} />
      <trace from={`.${refs.compCaps[0]} > .pin2`} to={`net.${POWER_NETS.gnd}`} />
      <trace from={`.${refs.compCaps[1]} > .pin1`} to={`net.${compensationNet}`} />
      <trace from={`.${refs.compCaps[1]} > .pin2`} to={`net.${POWER_NETS.gnd}`} />

      <trace from={`.${refs.frequencyResistor} > .pin1`} to={`net.${rtNet}`} />
      <trace
        from={`.${refs.frequencyResistor} > .pin2`}
        to={`net.${POWER_NETS.gnd}`}
      />
      <trace
        from={`.${refs.feedbackResistors[0]} > .pin1`}
        to={`net.${config.output}`}
      />
      <trace
        from={`.${refs.feedbackResistors[0]} > .pin2`}
        to={`net.${feedbackNet}`}
      />
      <trace
        from={`.${refs.feedbackResistors[1]} > .pin1`}
        to={`net.${feedbackNet}`}
      />
      <trace
        from={`.${refs.feedbackResistors[1]} > .pin2`}
        to={`net.${POWER_NETS.gnd}`}
      />
      <trace
        from={`.${refs.enableResistors[0]} > .pin1`}
        to={`net.${POWER_NETS.vin12}`}
      />
      <trace
        from={`.${refs.enableResistors[0]} > .pin2`}
        to={`net.${enableNet}`}
      />
      <trace
        from={`.${refs.enableResistors[1]} > .pin1`}
        to={`net.${enableNet}`}
      />
      <trace
        from={`.${refs.enableResistors[1]} > .pin2`}
        to={`net.${POWER_NETS.gnd}`}
      />
    </>
  )
}
