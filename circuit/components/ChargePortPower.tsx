import { Fragment } from "react"
import { PORT_NETS, POWER_NETS, portRail } from "../nets"
import { chargePortPlacement } from "../placement"
import {
  ChargePortConnector,
  PortPolyfuse,
} from "./legacy-parts"

export function ChargePortPower({ index }: { index: number }) {
  const placement = chargePortPlacement(index)
  const nets = PORT_NETS[index]
  const rail = portRail(index)
  const connector = `USB${index + 2}`
  const fuse = `F${index + 1}`
  const senseResistor = `R${23 + index * 4}`
  const cc1Pullup = `R${20 + index * 4}`
  const cc2Pullup = `R${21 + index * 4}`
  const capacitor = `C${24 + index}`

  return (
    <>
      <PortPolyfuse name={fuse} {...placement.fuse} />
      <resistor
        name={senseResistor}
        resistance="100m"
        footprint="1206"
        supplierPartNumbers={{ jlcpcb: ["C25334"] }}
        {...placement.senseResistor}
        pcbRotation={index === 6 ? 180 : placement.senseResistor.pcbRotation}
      />
      <resistor
        name={cc1Pullup}
        resistance="22k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25768"] }}
        {...placement.cc1Pullup}
      />
      <resistor
        name={cc2Pullup}
        resistance="22k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25768"] }}
        {...placement.cc2Pullup}
      />
      <ChargePortConnector name={connector} {...placement.connector} />
      <capacitor
        name={capacitor}
        capacitance="22uF"
        footprint="0805"
        supplierPartNumbers={{ jlcpcb: ["C45783"] }}
        {...placement.capacitor}
      />

      <trace from={`.${fuse} > .input`} to={`net.${rail}`} width="1.2mm" />
      <trace
        from={`.${fuse} > .output`}
        to={`net.${nets.shuntIn}`}
        width="1.2mm"
      />
      <trace
        from={`.${senseResistor} > .pin1`}
        to={`net.${nets.shuntIn}`}
        width="1.2mm"
      />
      <trace
        from={`.${senseResistor} > .pin2`}
        to={`net.${nets.vbus}`}
        width="1.2mm"
      />

      {["vbus1", "vbus2", "vbus3", "vbus4"].map((pin) => (
        <Fragment key={pin}>
          <trace
            from={`.${connector} > .${pin}`}
            to={`net.${nets.vbus}`}
            width="1.2mm"
          />
        </Fragment>
      ))}
      {["gnd1", "gnd2", "gnd3", "gnd4", "shield1", "shield2"].map(
        (pin) => (
          <Fragment key={pin}>
            <trace
              from={`.${connector} > .${pin}`}
              to={`net.${POWER_NETS.gnd}`}
            />
          </Fragment>
        ),
      )}

      <trace from={`.${connector} > .cc1`} to={`net.${nets.cc1}`} />
      <trace from={`.${connector} > .cc2`} to={`net.${nets.cc2}`} />
      {["dp1", "dp2", "dn1", "dn2"].map((pin) => (
        <Fragment key={pin}>
          <trace
            from={`.${connector} > .${pin}`}
            to={`net.${nets.data}`}
          />
        </Fragment>
      ))}

      {[
        [cc1Pullup, nets.cc1],
        [cc2Pullup, nets.cc2],
      ].map(([resistor, ccNet]) => (
        <Fragment key={resistor}>
          <trace from={`.${resistor} > .pin1`} to={`net.${nets.vbus}`} />
          <trace from={`.${resistor} > .pin2`} to={`net.${ccNet}`} />
        </Fragment>
      ))}
      <trace from={`.${capacitor} > .pin1`} to={`net.${nets.vbus}`} />
      <trace
        from={`.${capacitor} > .pin2`}
        to={`net.${POWER_NETS.gnd}`}
      />
    </>
  )
}
