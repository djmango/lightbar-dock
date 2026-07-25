import { Fragment } from "react"

type PositionedPartProps = {
  name: string
  pcbX: number
  pcbY: number
  pcbRotation?: number
}

export function Ina3221(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="INA3221AIRGVR"
      supplierPartNumbers={{ jlcpcb: ["C181255"] }}
      pinLabels={{
        1: "inMinus3",
        2: "inPlus3",
        3: "gnd",
        4: "vcc",
        5: "address",
        6: "scl",
        7: "sda",
        8: "warning",
        9: "critical",
        10: "powerValid",
        11: "inMinus1",
        12: "inPlus1",
        13: "timingControl",
        14: "inMinus2",
        15: "inPlus2",
        16: "pullupSupply",
        17: "exposedGround",
      }}
      noConnect={["warning", "critical", "powerValid", "timingControl"]}
      pinAttributes={{
        vcc: { requiresPower: true, requiresVoltage: 5.5 },
        gnd: { requiresGround: true },
        pullupSupply: { requiresVoltage: 5.5 },
      }}
      footprint={
        <footprint>
          {[1, 2, 3, 4].map((pin, index) => (
            <Fragment key={pin}>
              <smtpad
                portHints={[String(pin)]}
                pcbX="-2mm"
                pcbY={`${0.975 - index * 0.65}mm`}
                width="0.9mm"
                height="0.25mm"
                layer="top"
                shape="rect"
              />
            </Fragment>
          ))}
          {[5, 6, 7, 8].map((pin, index) => (
            <Fragment key={pin}>
              <smtpad
                portHints={[String(pin)]}
                pcbX={`${-0.975 + index * 0.65}mm`}
                pcbY="-2mm"
                width="0.25mm"
                height="0.9mm"
                layer="top"
                shape="rect"
              />
            </Fragment>
          ))}
          {[9, 10, 11, 12].map((pin, index) => (
            <Fragment key={pin}>
              <smtpad
                portHints={[String(pin)]}
                pcbX="2mm"
                pcbY={`${-0.975 + index * 0.65}mm`}
                width="0.9mm"
                height="0.25mm"
                layer="top"
                shape="rect"
              />
            </Fragment>
          ))}
          {[13, 14, 15, 16].map((pin, index) => (
            <Fragment key={pin}>
              <smtpad
                portHints={[String(pin)]}
                pcbX={`${0.975 - index * 0.65}mm`}
                pcbY="2mm"
                width="0.25mm"
                height="0.9mm"
                layer="top"
                shape="rect"
              />
            </Fragment>
          ))}
          <smtpad
            portHints={["17"]}
            pcbX={0}
            pcbY={0}
            width="2mm"
            height="2mm"
            layer="top"
            shape="rect"
          />
        </footprint>
      }
    />
  )
}

export function Hc4051(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SN74HC4051DR"
      supplierPartNumbers={{ jlcpcb: ["C13627"] }}
      footprint="soic16"
      pinLabels={{
        1: "y4",
        2: "y6",
        3: "common",
        4: "y7",
        5: "y5",
        6: "enable",
        7: "vee",
        8: "gnd",
        9: "s2",
        10: "s1",
        11: "s0",
        12: "y3",
        13: "y0",
        14: "y1",
        15: "y2",
        16: "vcc",
      }}
    />
  )
}

export function Hc595(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="74HC595"
      supplierPartNumbers={{ jlcpcb: ["C18164493"] }}
      footprint="soic16"
      pinLabels={{
        1: "qb",
        2: "qc",
        3: "qd",
        4: "qe",
        5: "qf",
        6: "qg",
        7: "qh",
        8: "gnd",
        9: "serialOut",
        10: "clear",
        11: "clock",
        12: "latch",
        13: "outputEnable",
        14: "serialIn",
        15: "qa",
        16: "vcc",
      }}
    />
  )
}

/**
 * CH32V203F6P6 TSSOP-20 (not F8 — F8 has USBHD on PB6/7, no USBD PA11/12).
 * Locked map: USB PA11/12; I2C PA0/1; CC ADC PA2/3; mux PA4–6;
 * LED PA7/PB1/PD0/PD1; BOOT0+NRST; remapped PD0/PD1 (no crystal).
 */
export function Ch32v203f6p6(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="CH32V203F6P6"
      supplierPartNumbers={{ jlcpcb: ["C3040880"] }}
      pinLabels={{
        1: "boot0",
        2: "pd0LedLatch",
        3: "pd1LedOutputEnable",
        4: "nrst",
        5: "vdda",
        6: "pa0Sda",
        7: "pa1Scl",
        8: "pa2Cc1Adc",
        9: "pa3Cc2Adc",
        10: "pa4MuxS0",
        11: "pa5MuxS1",
        12: "pa6MuxS2",
        13: "pa7LedData",
        14: "pb1LedClock",
        15: "vss",
        16: "vdd",
        17: "pa11UsbDm",
        18: "pa12UsbDp",
        19: "pa13Swdio",
        20: "pa14Swclk",
      }}
      noConnect={["pa13Swdio", "pa14Swclk"]}
      pinAttributes={{
        vdd: { requiresPower: true, requiresVoltage: 3.6 },
        vdda: { requiresPower: true, requiresVoltage: 3.6 },
        vss: { requiresGround: true },
        pa0Sda: { requiresVoltage: 3.6 },
        pa1Scl: { requiresVoltage: 3.6 },
        pa7LedData: { requiresVoltage: 3.6 },
        pb1LedClock: { requiresVoltage: 3.6 },
        pd0LedLatch: { requiresVoltage: 3.6 },
        pd1LedOutputEnable: { requiresVoltage: 3.6 },
      }}
      footprint={
        <footprint>
          {Array.from({ length: 10 }, (_, index) => (
            <Fragment key={`l${index + 1}`}>
              <smtpad
                portHints={[String(index + 1)]}
                pcbX="-3.0mm"
                pcbY={`${2.925 - index * 0.65}mm`}
                width="1.2mm"
                height="0.4mm"
                layer="top"
                shape="rect"
              />
            </Fragment>
          ))}
          {Array.from({ length: 10 }, (_, index) => (
            <Fragment key={`r${index + 11}`}>
              <smtpad
                portHints={[String(index + 11)]}
                pcbX="3.0mm"
                pcbY={`${-2.925 + index * 0.65}mm`}
                width="1.2mm"
                height="0.4mm"
                layer="top"
                shape="rect"
              />
            </Fragment>
          ))}
        </footprint>
      }
    />
  )
}

export function CommonAnodeStatusLed(props: PositionedPartProps) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="E6C0603RGBC3-A19AH-0.60T-RGB01"
      supplierPartNumbers={{ jlcpcb: ["C5119723"] }}
      pinLabels={{
        1: "redCathode",
        2: "commonAnode",
        3: "greenCathode",
        4: "blueCathode",
      }}
      noConnect={["blueCathode"]}
      footprint={
        <footprint>
          <smtpad
            portHints={["1"]}
            pcbX="-0.55mm"
            pcbY="-0.35mm"
            width="0.5mm"
            height="0.35mm"
            layer="top"
            shape="rect"
          />
          <smtpad
            portHints={["2"]}
            pcbX="0.55mm"
            pcbY="-0.35mm"
            width="0.5mm"
            height="0.35mm"
            layer="top"
            shape="rect"
          />
          <smtpad
            portHints={["3"]}
            pcbX="-0.55mm"
            pcbY="0.35mm"
            width="0.5mm"
            height="0.35mm"
            layer="top"
            shape="rect"
          />
          <smtpad
            portHints={["4"]}
            pcbX="0.55mm"
            pcbY="0.35mm"
            width="0.5mm"
            height="0.35mm"
            layer="top"
            shape="rect"
          />
        </footprint>
      }
    />
  )
}

