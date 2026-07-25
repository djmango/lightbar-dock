import { BarrelJackFootprint } from "../footprints/BarrelJack"
import { ChargeUsbCFootprint } from "../footprints/ChargeUsbC"
import { Ch224kFootprint } from "../footprints/Ch224k"
import { InputUsbCFootprint } from "../footprints/InputUsbC"
import { Polyfuse1812Footprint } from "../footprints/Polyfuse1812"
import { Ss54Footprint } from "../footprints/Ss54"
import { Stps340Footprint } from "../footprints/Stps340"
import { Swpa8040Footprint } from "../footprints/Swpa8040"
import { Tps54560Footprint } from "../footprints/Tps54560"

export type PositionedPartProps = {
  name: string
  pcbX: number
  pcbY: number
  pcbRotation?: number
}

export function PdInputConnector(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TYPE-C 16PIN 2MD(073)"
      supplierPartNumbers={{ jlcpcb: ["C2765186"] }}
      footprint={InputUsbCFootprint}
      pinLabels={{
        1: "gndA",
        2: "gndB",
        3: "vbusA",
        4: "vbusB",
        5: "cc1",
        6: "cc2",
        7: "dp1",
        8: "dn1",
        9: "dp2",
        10: "dn2",
        11: "sbu1",
        12: "sbu2",
        13: "shield1",
        14: "shield2",
      }}
      noConnect={["sbu1", "sbu2"]}
    />
  )
}

export function ChargePortConnector(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="918-118A2021Y40006"
      supplierPartNumbers={{ jlcpcb: ["C399938"] }}
      footprint={ChargeUsbCFootprint}
      pinLabels={{
        1: "gnd1",
        2: "vbus1",
        3: "cc1",
        4: "dp1",
        5: "dn1",
        6: "sbu1",
        7: "vbus2",
        8: "gnd2",
        9: "gnd3",
        10: "vbus3",
        11: "cc2",
        12: "dp2",
        13: "dn2",
        14: "sbu2",
        15: "vbus4",
        16: "gnd4",
        17: "shield1",
        18: "shield2",
      }}
      noConnect={["sbu1", "sbu2"]}
    />
  )
}

export function BarrelJack(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="DC-005-5A-2.0"
      supplierPartNumbers={{ jlcpcb: ["C381116"] }}
      footprint={BarrelJackFootprint}
      pinLabels={{ 1: "positive", 2: "ground", 3: "detect" }}
      noConnect={["detect"]}
    />
  )
}

export function Ch224k(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="CH224K"
      supplierPartNumbers={{ jlcpcb: ["C970725"] }}
      footprint={Ch224kFootprint}
      pinLabels={{
        1: "vdd",
        2: "cfg2",
        3: "cfg3",
        4: "dp",
        5: "dm",
        6: "cc2",
        7: "cc1",
        8: "vbusSense",
        9: "cfg1",
        10: "powerGood",
        11: "ground",
      }}
      noConnect={["cfg2", "cfg3"]}
      pinAttributes={{
        vdd: { requiresPower: true, requiresVoltage: 3.6 },
        ground: { requiresGround: true },
        vbusSense: { requiresVoltage: 13.5 },
      }}
    />
  )
}

/** Holtek HT7533-1 wide-Vin 3.3 V LDO, SOT-23 */
export function Ht7533(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="HT7533-1"
      supplierPartNumbers={{ jlcpcb: ["C2686823"] }}
      pinLabels={{
        1: "gnd",
        2: "vout",
        3: "vin",
      }}
      pinAttributes={{
        vin: { requiresPower: true, requiresVoltage: 24 },
        vout: { providesPower: true, providesVoltage: 3.3 },
        gnd: { requiresGround: true },
      }}
      footprint={
        <footprint>
          <smtpad
            portHints={["1"]}
            pcbX="-0.95mm"
            pcbY="-0.95mm"
            width="0.8mm"
            height="0.7mm"
            layer="top"
            shape="rect"
          />
          <smtpad
            portHints={["2"]}
            pcbX="0.95mm"
            pcbY="-0.95mm"
            width="0.8mm"
            height="0.7mm"
            layer="top"
            shape="rect"
          />
          <smtpad
            portHints={["3"]}
            pcbX="0"
            pcbY="0.95mm"
            width="0.8mm"
            height="0.7mm"
            layer="top"
            shape="rect"
          />
        </footprint>
      }
    />
  )
}

export function Tps54560(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TPS54560DDAR"
      supplierPartNumbers={{ jlcpcb: ["C31966"] }}
      footprint={Tps54560Footprint}
      pinLabels={{
        1: "boot",
        2: "vin",
        3: "enable",
        4: "rtClock",
        5: "feedback",
        6: "compensation",
        7: "ground",
        8: "switch",
        9: "exposedGround",
      }}
    />
  )
}

export function BuckDiode(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="STPS340U"
      supplierPartNumbers={{ jlcpcb: ["C50706"] }}
      footprint={Stps340Footprint}
      pinLabels={{ 1: "cathode", 2: "anode" }}
    />
  )
}

export function OringDiode(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SS54"
      supplierPartNumbers={{ jlcpcb: ["C5204950"] }}
      footprint={Ss54Footprint}
      pinLabels={{ 1: "cathode", 2: "anode" }}
    />
  )
}

export function BuckInductor(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SWPA8040S5R6NT"
      supplierPartNumbers={{ jlcpcb: ["C96972"] }}
      footprint={Swpa8040Footprint}
      pinLabels={{ 1: "input", 2: "output" }}
    />
  )
}

export function PortPolyfuse(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="BSMD1812-150-33V"
      supplierPartNumbers={{ jlcpcb: ["C883154"] }}
      footprint={Polyfuse1812Footprint}
      pinLabels={{ 1: "input", 2: "output" }}
    />
  )
}
