# V3 design assurance

Product / electrical / indicator specs: **[`SPECS.md`](SPECS.md)** (do not
restate them here).

Schematic/PCB source of truth: `circuit/`. Gates:

```bash
npm run verify         # test + check:circuit + build + electrical + vias
npm run route:circuit  # optional Freerouting (slow); then verify:vias
```

Manual rows below cover what scripts cannot invent from datasheets.

## Per-IC sign-off (manual)

| MPN | LCSC | Variant traps | Footprint | Boot / flash | JLC |
| --- | --- | --- | --- | --- | --- |
| CH32V203F6P6 | C3040880 | **Not F8P6** (USB on PB6/7) | TSSOP-20 custom — check pin 1 | USB ISP via USB1; BOOT0 button; no crystal | Extended |
| HT7533-1 | C2686823 | Wide-Vin; not AP2112 | SOT-23 1=GND 2=OUT 3=VIN | — | Basic/Ext |
| CH224K | C970725 | VDD 3.0–3.6 V via 1k; PD-only (DP–DM short on chip) | ESSOP-10 | — | Basic |
| INA3221AIRGVR | C181255 | RGV pin 1 + EP vs TI drawing | Custom QFN — **sign off before fab** | I2C | Extended |
| E6C0603 RGB | C5119723 | Common-anode pad order vs LCSC; blue NC | Custom 0603 — **sign off before fab** | — | Extended |
| SN74HC4051DR / 74HC595 | C13627 / C18164493 | 5 V VCC OK; MCU GPIO is 3.3 V | SOIC-16 | — | Basic |

## Automated checks (`verify:electrical`)

- MCU MPN lock (F6P6)
- `rail_3v3` / `ch224k_vdd` present; CH224K VDD not shorted to `vin_pd`
- MCU-domain nets not shorted to 5 V / PD rails
- R69/R71 on 3.3 V
- Via size ≥ 0.6 / 0.3 mm
- Golden pad centers for INA + RGB (`circuit/assurance/golden-footprints.json`)

## Flash

Procedure and pin map: `firmware/status-controller/README.md` (not duplicated
here).

## Pre-order

- [ ] Manual footprint sign-off for INA RGV + RGB C5119723
- [ ] `npm run verify` green
- [ ] KiCad DRC on exported PCB manufacturing-clean
- [ ] JLC Extended assembly stock for F6P6, INA3221, RGB, HT7533
