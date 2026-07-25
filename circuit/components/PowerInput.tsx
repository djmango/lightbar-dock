import { Fragment } from "react"
import { POWER_NETS } from "../nets"
import { INPUT_PLACEMENT } from "../placement"
import {
  BarrelJack,
  Ch224k,
  Ht7533,
  OringDiode,
  PdInputConnector,
} from "./legacy-parts"

const PD_CC1 = "pd_cc1"
const PD_CC2 = "pd_cc2"
const USB_DP = "usb_dp"
const USB_DM = "usb_dm"
const PD_VBUS_SENSE = "pd_vbus_sense"
const PD_CFG1 = "pd_cfg1"
const PD_POWER_GOOD = "pd_power_good"
const CH224K_QC_SHORT = "ch224k_qc_short"

export function PowerInput() {
  return (
    <>
      <PdInputConnector name="USB1" {...INPUT_PLACEMENT.USB1} />
      <Ch224k name="U5" {...INPUT_PLACEMENT.U5} />
      <resistor
        name="R19"
        resistance="1k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C11702"] }}
        {...INPUT_PLACEMENT.R19}
      />
      {/* Series drop for CH224K VDD (3.0–3.6 V abs); not the VBUS sense resistor. */}
      <resistor
        name="R72"
        resistance="1k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C11702"] }}
        {...INPUT_PLACEMENT.R72}
      />
      <capacitor
        name="C23"
        capacitance="1uF"
        footprint="0603"
        supplierPartNumbers={{ jlcpcb: ["C15849"] }}
        {...INPUT_PLACEMENT.C23}
      />
      <resistor
        name="R17"
        resistance="24k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25769"] }}
        {...INPUT_PLACEMENT.R17}
      />
      <led
        name="LED1"
        color="blue"
        footprint="0603"
        supplierPartNumbers={{ jlcpcb: ["C2288"] }}
        {...INPUT_PLACEMENT.LED1}
      />
      <resistor
        name="R18"
        resistance="4.7k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25900"] }}
        {...INPUT_PLACEMENT.R18}
      />

      <BarrelJack name="DC1" {...INPUT_PLACEMENT.DC1} />
      <OringDiode name="D3" {...INPUT_PLACEMENT.D3} />
      <OringDiode name="D4" {...INPUT_PLACEMENT.D4} />
      <led
        name="LED10"
        color="red"
        footprint="0603"
        supplierPartNumbers={{ jlcpcb: ["C2286"] }}
        {...INPUT_PLACEMENT.LED10}
      />
      <resistor
        name="R52"
        resistance="10k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25744"] }}
        {...INPUT_PLACEMENT.R52}
      />

      {/* Schottky-OR so MCU 3.3 V is up from USB PD (flash) or buck rail A. */}
      <OringDiode name="D5" {...INPUT_PLACEMENT.D5} />
      <OringDiode name="D6" {...INPUT_PLACEMENT.D6} />
      <Ht7533 name="U12" {...INPUT_PLACEMENT.U12} />
      <capacitor
        name="C40"
        capacitance="1uF"
        footprint="0603"
        supplierPartNumbers={{ jlcpcb: ["C15849"] }}
        {...INPUT_PLACEMENT.C40}
      />
      <capacitor
        name="C41"
        capacitance="1uF"
        footprint="0603"
        supplierPartNumbers={{ jlcpcb: ["C15849"] }}
        {...INPUT_PLACEMENT.C41}
      />

      {["gndA", "gndB", "shield1", "shield2"].map((pin) => (
        <Fragment key={pin}>
          <trace from={`.USB1 > .${pin}`} to={`net.${POWER_NETS.gnd}`} />
        </Fragment>
      ))}
      {["vbusA", "vbusB"].map((pin) => (
        <Fragment key={pin}>
          <trace
            from={`.USB1 > .${pin}`}
            to={`net.${POWER_NETS.vinPd}`}
          />
        </Fragment>
      ))}
      <trace from=".USB1 > .cc1" to={`net.${PD_CC1}`} />
      <trace from=".USB1 > .cc2" to={`net.${PD_CC2}`} />
      {/* USB data to MCU only; CH224K is PD-only (chip DP–DM shorted). */}
      <trace from=".USB1 > .dp1" to={`net.${USB_DP}`} />
      <trace from=".USB1 > .dp2" to={`net.${USB_DP}`} />
      <trace from=".USB1 > .dn1" to={`net.${USB_DM}`} />
      <trace from=".USB1 > .dn2" to={`net.${USB_DM}`} />

      <trace from=".U5 > .vdd" to={`net.${POWER_NETS.ch224kVdd}`} />
      <trace from=".U5 > .ground" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".U5 > .cc1" to={`net.${PD_CC1}`} />
      <trace from=".U5 > .cc2" to={`net.${PD_CC2}`} />
      <trace from=".U5 > .dp" to={`net.${CH224K_QC_SHORT}`} />
      <trace from=".U5 > .dm" to={`net.${CH224K_QC_SHORT}`} />
      <trace from=".U5 > .vbusSense" to={`net.${PD_VBUS_SENSE}`} />
      <trace from=".U5 > .cfg1" to={`net.${PD_CFG1}`} />
      <trace from=".U5 > .powerGood" to={`net.${PD_POWER_GOOD}`} />

      <trace from=".R72 > .pin1" to={`net.${POWER_NETS.vinPd}`} />
      <trace from=".R72 > .pin2" to={`net.${POWER_NETS.ch224kVdd}`} />
      <trace from=".R19 > .pin1" to={`net.${POWER_NETS.vinPd}`} />
      <trace from=".R19 > .pin2" to={`net.${PD_VBUS_SENSE}`} />
      <trace from=".C23 > .pin1" to={`net.${POWER_NETS.ch224kVdd}`} />
      <trace from=".C23 > .pin2" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".R17 > .pin1" to={`net.${PD_CFG1}`} />
      <trace from=".R17 > .pin2" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".LED1 > .anode" to={`net.${POWER_NETS.vinPd}`} />
      <trace from=".LED1 > .cathode" to=".R18 > .pin1" />
      <trace from=".R18 > .pin2" to={`net.${PD_POWER_GOOD}`} />

      <trace from=".DC1 > .positive" to={`net.${POWER_NETS.vinBarrel}`} />
      <trace from=".DC1 > .ground" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".D3 > .anode" to={`net.${POWER_NETS.vinBarrel}`} />
      <trace from=".D3 > .cathode" to={`net.${POWER_NETS.vin12}`} />
      <trace from=".D4 > .anode" to={`net.${POWER_NETS.vinPd}`} />
      <trace from=".D4 > .cathode" to={`net.${POWER_NETS.vin12}`} />
      <trace from=".LED10 > .anode" to={`net.${POWER_NETS.vin12}`} />
      <trace from=".LED10 > .cathode" to=".R52 > .pin1" />
      <trace from=".R52 > .pin2" to={`net.${POWER_NETS.gnd}`} />

      <trace from=".D5 > .anode" to={`net.${POWER_NETS.vinPd}`} />
      <trace from=".D5 > .cathode" to={`net.${POWER_NETS.ldoVin}`} />
      <trace from=".D6 > .anode" to={`net.${POWER_NETS.rail5vA}`} />
      <trace from=".D6 > .cathode" to={`net.${POWER_NETS.ldoVin}`} />
      <trace from=".U12 > .vin" to={`net.${POWER_NETS.ldoVin}`} />
      <trace from=".U12 > .vout" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".U12 > .gnd" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".C41 > .pin1" to={`net.${POWER_NETS.ldoVin}`} />
      <trace from=".C41 > .pin2" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".C40 > .pin1" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".C40 > .pin2" to={`net.${POWER_NETS.gnd}`} />
    </>
  )
}
