# Status controller firmware (V3)

Target: **CH32V203F6P6** at 3.3 V (not F8P6, not CH32V003), built with ch32fun
commit `d60d0fd344c3d453020b4dd1500e386e87335c16`.

Product / indicator behavior: [`docs/SPECS.md`](../../docs/SPECS.md).
Thresholds and timing: [`include/status_config.h`](include/status_config.h)
only — do not restate those constants in markdown.

## Build

```sh
./scripts/fetch-ch32fun.sh
make -C firmware/status-controller verify-ch32fun build
```

Host unit tests (no MCU required):

```sh
npm run test:firmware
```

## Flash over USB1 (wchisp)

The dock shares USB1: CC → CH224K (PD), D+/D− → MCU USBD bootloader.

1. Unplug the barrel jack so USB1 alone powers the HT7533 OR path.
2. Hold **SW1 (BOOT0)**, plug USB1 into the host (or hold BOOT0 and cycle USB).
3. Release BOOT0 after the ISP device enumerates.
4. Flash:

```sh
wchisp flash firmware/status-controller/status-controller.bin
# or, if configured with ch32fun:
make -C firmware/status-controller flash
```

Keep light bars disconnected during first bring-up. OE has a 3.3 V pull-up, so
LEDs stay off until firmware enables the 74HC595 outputs.

## Pin map (locked)

| Function | Pin |
| --- | --- |
| I2C SDA / SCL (bitbang) | PA0 / PA1 |
| CC1 / CC2 ADC (after 2:1) | PA2 / PA3 |
| Mux S0–S2 | PA4–PA6 |
| LED data / clock / latch / OE | PA7 / PB1 / PD0 / PD1 |
| USB DM / DP | PA11 / PA12 |
| BOOT0 | pin 1 + SW1 to 3.3 V, 100 kΩ pulldown |

PD0/PD1 are remapped from OSC (no crystal). Current sense is I2C INA3221
(U1=0x42, U2=0x41, U6=0x40). Muxes only scan port CC lines for attach detect.
LED bit packing: port *N* red = bit `2N`, green = bit `2N+1` (active-low sinks
via 74HC595).
