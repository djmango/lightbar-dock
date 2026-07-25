import { Fragment } from "react"
import { PORT_NETS, POWER_NETS, portRail } from "../nets"
import { chargePortPlacement, fromKiCad } from "../placement"
import {
  Ch32v203f6p6,
  CommonAnodeStatusLed,
  Hc4051,
  Hc595,
  Ina3221,
} from "./status-parts"

const STATUS_SDA = "status_i2c_sda"
const STATUS_SCL = "status_i2c_scl"
const LED_OUTPUT_ENABLE = "status_led_output_enable"
const LED_CLOCK = "status_led_clock"
const LED_LATCH = "status_led_latch"
const USB_DP = "usb_dp"
const USB_DM = "usb_dm"
const CC1_ADC = "status_cc1_adc"
const CC2_ADC = "status_cc2_adc"
const BOOT0 = "status_boot0"

const inaChannels = [
  {
    reference: "U1",
    channels: [
      { port: 2, channel: 1 },
      { port: 1, channel: 2 },
      { port: 0, channel: 3 },
    ],
    placement: fromKiCad(145, 77),
  },
  {
    reference: "U2",
    channels: [
      { port: 5, channel: 1 },
      { port: 4, channel: 2 },
      { port: 3, channel: 3 },
    ],
    placement: fromKiCad(215, 77),
  },
  {
    reference: "U6",
    channels: [
      { port: 7, channel: 1 },
      { port: 6, channel: 3 },
    ],
    placement: fromKiCad(270, 77),
  },
] as const

const shiftOutput = (output: number) =>
  ["qa", "qb", "qc", "qd", "qe", "qf", "qg", "qh"][output]
const muxChannelByPort = [0, 1, 2, 3, 4, 5, 6, 7] as const

function inaEscape(
  placement: { pcbX: number; pcbY: number },
  pin: number,
) {
  if (pin >= 1 && pin <= 4) {
    return [
      {
        x: placement.pcbX - 2.8,
        y: placement.pcbY + 0.975 - (pin - 1) * 0.65,
      },
    ]
  }
  if (pin >= 5 && pin <= 8) {
    return [
      {
        x: placement.pcbX - 0.975 + (pin - 5) * 0.65,
        y: placement.pcbY - 2.8,
      },
    ]
  }
  if (pin >= 9 && pin <= 12) {
    return [
      {
        x: placement.pcbX + 2.8,
        y: placement.pcbY - 0.975 + (pin - 9) * 0.65,
      },
    ]
  }
  return [
    {
      x: placement.pcbX + 0.975 - (pin - 13) * 0.65,
      y: placement.pcbY + 2.8,
    },
  ]
}

export function StatusController() {
  return (
    <>
      {inaChannels.map((monitor, monitorIndex) => (
        <Fragment key={monitor.reference}>
          <Ina3221 name={monitor.reference} {...monitor.placement} />
          <capacitor
            name={`C${32 + monitorIndex}`}
            capacitance="100nF"
            footprint="0402"
            supplierPartNumbers={{ jlcpcb: ["C307331"] }}
            {...fromKiCad(
              149 + monitorIndex * 65,
              monitorIndex === 2 ? 77 : 73.5,
              90,
            )}
          />
          <trace
            from={`.${monitor.reference} > .vcc`}
            to={`net.${POWER_NETS.rail3v3}`}
            pcbRouteHints={inaEscape(monitor.placement, 4)}
          />
          <trace
            from={`.${monitor.reference} > .pullupSupply`}
            to={`net.${POWER_NETS.rail3v3}`}
            pcbRouteHints={inaEscape(monitor.placement, 16)}
          />
          <trace
            from={`.${monitor.reference} > .gnd`}
            to={`net.${POWER_NETS.gnd}`}
            pcbRouteHints={inaEscape(monitor.placement, 3)}
          />
          <trace
            from={`.${monitor.reference} > .exposedGround`}
            to={`net.${POWER_NETS.gnd}`}
          />
          <via
            name={`${monitor.reference}_ep_via`}
            pcbX={monitor.placement.pcbX}
            pcbY={monitor.placement.pcbY}
            holeDiameter="0.3mm"
            outerDiameter="0.6mm"
            fromLayer="top"
            toLayer="bottom"
            connectsTo={`net.${POWER_NETS.gnd}`}
          />
          <trace
            from={`.${monitor.reference} > .sda`}
            to={`net.${STATUS_SDA}`}
            pcbRouteHints={inaEscape(monitor.placement, 7)}
          />
          <trace
            from={`.${monitor.reference} > .scl`}
            to={`net.${STATUS_SCL}`}
            pcbRouteHints={inaEscape(monitor.placement, 6)}
          />
          <trace
            from={`.C${32 + monitorIndex} > .pin1`}
            to={`net.${POWER_NETS.rail3v3}`}
          />
          <trace
            from={`.C${32 + monitorIndex} > .pin2`}
            to={`net.${POWER_NETS.gnd}`}
          />

          {monitor.channels.map(({ port: portIndex, channel }) => (
            <Fragment key={portIndex}>
              <trace
                from={`.${monitor.reference} > .inPlus${channel}`}
                to={`net.${PORT_NETS[portIndex].shuntIn}`}
                pcbRouteHints={inaEscape(
                  monitor.placement,
                  { 1: 12, 2: 15, 3: 2 }[channel],
                )}
              />
              <trace
                from={`.${monitor.reference} > .inMinus${channel}`}
                to={`net.${PORT_NETS[portIndex].vbus}`}
                pcbRouteHints={inaEscape(
                  monitor.placement,
                  { 1: 11, 2: 14, 3: 1 }[channel],
                )}
              />
            </Fragment>
          ))}
        </Fragment>
      ))}

      <trace
        from=".U1 > .address"
        to={`net.${STATUS_SDA}`}
        pcbRouteHints={inaEscape(inaChannels[0].placement, 5)}
      />
      <trace
        from=".U2 > .address"
        to={`net.${POWER_NETS.rail3v3}`}
        pcbRouteHints={inaEscape(inaChannels[1].placement, 5)}
      />
      <trace
        from=".U6 > .address"
        to={`net.${POWER_NETS.gnd}`}
        pcbRouteHints={inaEscape(inaChannels[2].placement, 5)}
      />
      <trace
        from=".U6 > .inPlus2"
        to={`net.${POWER_NETS.gnd}`}
        pcbRouteHints={inaEscape(inaChannels[2].placement, 15)}
      />
      <trace
        from=".U6 > .inMinus2"
        to={`net.${POWER_NETS.gnd}`}
        pcbRouteHints={inaEscape(inaChannels[2].placement, 14)}
      />

      <Ch32v203f6p6 name="U7" {...fromKiCad(180, 84, 180)} />
      <Hc4051 name="U8" {...fromKiCad(155, 84)} />
      <Hc4051 name="U9" {...fromKiCad(202, 84)} />
      <Hc595 name="U10" {...fromKiCad(225, 84)} />
      <Hc595 name="U11" {...fromKiCad(242, 78)} />

      {[
        ["C35", 182.5, 93],
        ["C36", 159, 84],
        ["C37", 206, 84],
        ["C38", 229, 84],
        ["C39", 246, 78],
      ].map(([name, x, y]) => (
        <capacitor
          key={String(name)}
          name={String(name)}
          capacitance="100nF"
          footprint="0402"
          supplierPartNumbers={{ jlcpcb: ["C307331"] }}
          {...fromKiCad(Number(x), Number(y), 90)}
        />
      ))}

      <resistor
        name="R69"
        resistance="4.7k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25900"] }}
        {...fromKiCad(216.5, 82)}
      />
      <resistor
        name="R70"
        resistance="4.7k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25900"] }}
        {...fromKiCad(212.5, 82)}
      />
      <resistor
        name="R71"
        resistance="10k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25744"] }}
        {...fromKiCad(220, 89)}
      />

      {/* 2:1 dividers so CC commons stay within 3.3 V ADC range. */}
      <resistor
        name="R73"
        resistance="10k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25744"] }}
        {...fromKiCad(162, 89)}
      />
      <resistor
        name="R74"
        resistance="10k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25744"] }}
        {...fromKiCad(165, 89)}
      />
      <resistor
        name="R75"
        resistance="10k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25744"] }}
        {...fromKiCad(195, 89)}
      />
      <resistor
        name="R76"
        resistance="10k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25744"] }}
        {...fromKiCad(198, 89)}
      />

      <resistor
        name="R77"
        resistance="100k"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C25741"] }}
        {...fromKiCad(185, 76)}
      />
      <capacitor
        name="C42"
        capacitance="100nF"
        footprint="0402"
        supplierPartNumbers={{ jlcpcb: ["C307331"] }}
        {...fromKiCad(188, 76, 90)}
      />
      <chip
        name="SW1"
        manufacturerPartNumber="TS-1187A-B-A-B"
        supplierPartNumbers={{ jlcpcb: ["C318884"] }}
        pinLabels={{ 1: "pin1", 2: "pin2" }}
        {...fromKiCad(180, 76)}
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX="-1.5mm"
              pcbY="0"
              width="1.2mm"
              height="1.4mm"
              layer="top"
              shape="rect"
            />
            <smtpad
              portHints={["2"]}
              pcbX="1.5mm"
              pcbY="0"
              width="1.2mm"
              height="1.4mm"
              layer="top"
              shape="rect"
            />
          </footprint>
        }
      />

      <trace from=".U7 > .vdd" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".U7 > .vdda" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".U7 > .vss" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".U7 > .pa0Sda" to={`net.${STATUS_SDA}`} />
      <trace from=".U7 > .pa1Scl" to={`net.${STATUS_SCL}`} />
      <trace from=".U7 > .pa11UsbDm" to={`net.${USB_DM}`} />
      <trace from=".U7 > .pa12UsbDp" to={`net.${USB_DP}`} />
      <trace from=".U7 > .boot0" to={`net.${BOOT0}`} />
      <trace from=".R77 > .pin1" to={`net.${BOOT0}`} />
      <trace from=".R77 > .pin2" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".SW1 > .pin1" to={`net.${BOOT0}`} />
      <trace from=".SW1 > .pin2" to={`net.${POWER_NETS.rail3v3}`} />
      {/* NRST uses internal pull-up; local 100 nF to GND. */}
      <trace from=".C42 > .pin1" to=".U7 > .nrst" />
      <trace from=".C42 > .pin2" to={`net.${POWER_NETS.gnd}`} />

      <trace from=".R69 > .pin1" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".R69 > .pin2" to={`net.${STATUS_SDA}`} />
      <trace from=".R70 > .pin1" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".R70 > .pin2" to={`net.${STATUS_SCL}`} />

      {[8, 9].map((reference) => (
        <Fragment key={reference}>
          <trace
            from={`.U${reference} > .vcc`}
            to={`net.${POWER_NETS.rail5vA}`}
          />
          <trace from={`.U${reference} > .gnd`} to={`net.${POWER_NETS.gnd}`} />
          <trace from={`.U${reference} > .vee`} to={`net.${POWER_NETS.gnd}`} />
          <trace
            from={`.U${reference} > .enable`}
            to={`net.${POWER_NETS.gnd}`}
          />
        </Fragment>
      ))}
      {["s0", "s1", "s2"].map((select, index) => (
        <Fragment key={select}>
          <trace
            from={`.U7 > .pa${4 + index}MuxS${index}`}
            to={`.U8 > .${select}`}
          />
          <trace
            from={`.U7 > .pa${4 + index}MuxS${index}`}
            to={`.U9 > .${select}`}
          />
        </Fragment>
      ))}
      {PORT_NETS.map((nets, index) => (
        <Fragment key={nets.cc1}>
          <trace
            from={`.U8 > .y${muxChannelByPort[index]}`}
            to={`net.${nets.cc1}`}
          />
          <trace
            from={`.U9 > .y${muxChannelByPort[index]}`}
            to={`net.${nets.cc2}`}
          />
        </Fragment>
      ))}
      <trace from=".U8 > .common" to=".R73 > .pin1" />
      <trace from=".R73 > .pin2" to={`net.${CC1_ADC}`} />
      <trace from=".R74 > .pin1" to={`net.${CC1_ADC}`} />
      <trace from=".R74 > .pin2" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".U9 > .common" to=".R75 > .pin1" />
      <trace from=".R75 > .pin2" to={`net.${CC2_ADC}`} />
      <trace from=".R76 > .pin1" to={`net.${CC2_ADC}`} />
      <trace from=".R76 > .pin2" to={`net.${POWER_NETS.gnd}`} />
      <trace from=".U7 > .pa2Cc1Adc" to={`net.${CC1_ADC}`} />
      <trace from=".U7 > .pa3Cc2Adc" to={`net.${CC2_ADC}`} />

      {[10, 11].map((reference) => (
        <Fragment key={reference}>
          <trace
            from={`.U${reference} > .vcc`}
            to={`net.${POWER_NETS.rail5vA}`}
          />
          <trace from={`.U${reference} > .gnd`} to={`net.${POWER_NETS.gnd}`} />
          <trace
            from={`.U${reference} > .clear`}
            to={`net.${POWER_NETS.rail5vA}`}
          />
          <trace
            from={`.U${reference} > .outputEnable`}
            to={`net.${LED_OUTPUT_ENABLE}`}
          />
          <trace from={`.U${reference} > .clock`} to={`net.${LED_CLOCK}`} />
          <trace from={`.U${reference} > .latch`} to={`net.${LED_LATCH}`} />
        </Fragment>
      ))}
      <trace from=".U7 > .pa7LedData" to=".U10 > .serialIn" />
      <trace from=".U10 > .serialOut" to=".U11 > .serialIn" />
      <trace from=".U7 > .pb1LedClock" to={`net.${LED_CLOCK}`} />
      <trace from=".U7 > .pd0LedLatch" to={`net.${LED_LATCH}`} />
      <trace
        from=".U7 > .pd1LedOutputEnable"
        to={`net.${LED_OUTPUT_ENABLE}`}
      />
      <trace from=".R71 > .pin1" to={`net.${POWER_NETS.rail3v3}`} />
      <trace from=".R71 > .pin2" to={`net.${LED_OUTPUT_ENABLE}`} />

      {PORT_NETS.map((_, index) => {
        const led = `LED${index + 2}`
        const redResistor = `R${53 + index * 2}`
        const greenResistor = `R${54 + index * 2}`
        const placement = chargePortPlacement(index)
        const shiftRegister = index < 4 ? 10 : 11
        const bankChannel = index % 4
        return (
          <Fragment key={led}>
            <CommonAnodeStatusLed name={led} {...placement.statusLed} />
            <resistor
              name={redResistor}
              resistance="1k"
              footprint="0402"
              supplierPartNumbers={{ jlcpcb: ["C11702"] }}
              {...placement.statusLedRedResistor}
            />
            <resistor
              name={greenResistor}
              resistance="1k"
              footprint="0402"
              supplierPartNumbers={{ jlcpcb: ["C11702"] }}
              {...placement.statusLedGreenResistor}
            />
            <trace from={`.${led} > .commonAnode`} to={`net.${portRail(index)}`} />
            <trace from={`.${led} > .redCathode`} to={`.${redResistor} > .pin2`} />
            <trace
              from={`.${led} > .greenCathode`}
              to={`.${greenResistor} > .pin2`}
            />
            <trace
              from={`.${redResistor} > .pin1`}
              to={`.U${shiftRegister} > .${shiftOutput(bankChannel * 2)}`}
            />
            <trace
              from={`.${greenResistor} > .pin1`}
              to={`.U${shiftRegister} > .${shiftOutput(bankChannel * 2 + 1)}`}
            />
          </Fragment>
        )
      })}

      {[
        ["C35", POWER_NETS.rail3v3],
        ["C36", POWER_NETS.rail5vA],
        ["C37", POWER_NETS.rail5vA],
        ["C38", POWER_NETS.rail5vA],
        ["C39", POWER_NETS.rail5vA],
      ].map(([capacitor, supply]) => (
        <Fragment key={capacitor}>
          <trace from={`.${capacitor} > .pin1`} to={`net.${supply}`} />
          <trace from={`.${capacitor} > .pin2`} to={`net.${POWER_NETS.gnd}`} />
        </Fragment>
      ))}
    </>
  )
}
