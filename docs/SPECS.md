# Lightbar dock — V3 specifications

**This file is the only human-readable product / electrical / indicator
spec.** Do not restate these numbers in `README.md`, `ORDERING.md`, or
`docs/DESIGN_ASSURANCE.md`; link here instead.

Machine sources of truth (do not duplicate into prose elsewhere either):

| Concern | Canonical location |
| --- | --- |
| Schematic / PCB / net names | `circuit/` (entry: `circuit/index.circuit.tsx`) |
| Firmware thresholds & timing | `firmware/status-controller/include/status_config.h` |
| MCU pin map | `firmware/status-controller/README.md` |
| Fabrication gates / IC sign-off | `docs/DESIGN_ASSURANCE.md` |

Rev‑1 history (LM339 ghost-glow, old routing notes) lives in
[`HISTORY.md`](HISTORY.md) and is not current.

---

## Product

- 1×8 USB-C charging dock for stick-anywhere rechargeable light bars.
- Bars plug vertically onto upward-facing USB-C plugs.
- Board outline: **240 × 47 mm**, 2-layer FR-4, 1.6 mm.
- Eight identical port channels on a **22.5 mm** pitch (single row).
- Status RGB LEDs on the front edge, **centered on the same X** as each
  charge receptacle.

## Power architecture

- Dual input, OR-diode merged to `vin_12v`:
  - Barrel jack 12 V (opening on the left edge)
  - USB-C PD receptacle (**USB1**) + **CH224K** requesting **12 V**
    (24 kΩ on CFG1). **USB1 mating opening faces the left board edge**
    (`pcbRotation −90`; see comment on `INPUT_PLACEMENT.USB1`). If the
    brick has no 12 V PDO, VBUS stays ~5 V and the bucks stay off (UVLO);
    nothing charges, nothing breaks.
- Two **TPS54560** bucks → `rail_5v_a` (ports 0–3) and `rail_5v_b`
  (ports 4–7).
- MCU / logic **3.3 V**: **HT7533-1** LDO, Schottky-OR from `vin_pd` and
  `rail_5v_a` so USB1 alone can power flash/bring-up.
- CH224K VDD is **not** on raw PD VBUS: `vin_pd --1k-- ch224k_vdd` +
  local bypass (chip needs 3.0–3.6 V).

### Power budget

| Path | Rating |
| --- | --- |
| Per port | 5 V, ~1 A continuous (polyfuse 1.5 A hold / 3 A trip) |
| Barrel | 12 V / 5 A brick for full 8 × 1 A |
| USB-C PD | 12 V @ 3 A (36 W) → ~0.75 A/port if all eight charge at once |

## Per-port channel

Each of USB2–USB9:

1. Polyfuse → **100 mΩ** sense → vertical USB-C plug
   (Jing Extension **918-118A2021Y40006**, LCSC **C399938**)
2. **22 kΩ** CC1/CC2 pull-ups (both orientations) → 1.5 A @ 5 V source advert
3. D+/D− shorted → BC1.2 dedicated-charger signature
4. Local bulk cap on VBUS

## Status sensing & MCU

| Block | Part / role |
| --- | --- |
| MCU | **CH32V203F6P6** (LCSC **C3040880**) — **not** F8P6 |
| Current | 3× **INA3221** (I2C), 100 mΩ shunts |
| CC attach | 2× **74HC4051** mux → MCU ADC (2:1 dividers) |
| LED drive | 2× **74HC595**, OE pulled up to 3.3 V (LEDs dark until firmware) |
| Flash | USB ISP on shared **USB1** D+/D−; **SW1** = BOOT0 |

USB1 is shared: CC → CH224K (PD only; chip DP–DM shorted on the IC, not on
the receptacle data pair); D+/D− → MCU.

## Indicators

| LED | Meaning |
| --- | --- |
| **LED10** red (0603) | 12 V rail present (`vin_12v`) |
| **LED1** blue (0603) | PD power-good (CH224K PG) |
| **LED2–LED9** common-anode RGB (**C5119723**) | Per charge port (see below) |

Per-port RGB (firmware-driven; blue cathode NC):

| Color | State |
| --- | --- |
| Off | Empty / detached |
| **Red** | Attached and starting/charging (current ≥ charging threshold) |
| **Green** | Attached with sustained low current (“done”) — **not** battery SoC |

Defaults (override only in `status_config.h`): charging on **40 mA**, done
max **20 mA**, done dwell **10 s** (200 × 50 ms samples).

## Copper pour (GND)

Yes — a ground pour is normal on a 2-layer board (return path, lower
impedance, fewer long GND traces). Manufacturing boards use **GND zones on
F.Cu + B.Cu** with ~0.2 mm clearance and solid pad connections (see
`generated/kicad/v3-routed.kicad_pcb`). Do not leave an unfilled/mis-cleared
pour; that is what produced hundreds of false DRC hits earlier.

## Autorouting

Primary: **Topola** (Rust Specctra) via `bun run route:circuit` →
`scripts/route-with-topola.mjs` (submodule `third_party/topola`). CLI flags
include `--multilayer`, `--remaining`, `--nets`. Set `TOPOLA_TIMEOUT` (seconds)
for large boards; Topola is still pre-alpha on dense 2-layer layouts — use
`bun run route:freerouting` if a job exceeds the timeout. For tscircuit editor
solve API: `bun run autoroute:server`
([`packages/topola-autorouter`](../packages/topola-autorouter/README.md)).

## KiCad DRC

Open `generated/kicad/default.kicad_pro` (project, not bare PCB) so the
`tscircuit` footprint library loads from `circuit/kicad/tscircuit.pretty`
(`bun run fix:kicad-fp-lib` regenerates it). Copper **error**-level DRC
should be **0** after route + pour refill. A handful of unconnected items
may remain for hand touch-up. Remaining silk/text warnings are not fab
blockers. USB1 locating pegs are NPTH.

## Mechanical / enclosure notes

- Pitch leaves ~5 mm for printed dividers (Gritin bars ~10.5 mm thick,
  ~17 mm at bulge).
- Vertical plug is electrical only; the shell must cradle the bars.
  Mated plug height ~8.65 mm.
- Barrel jack pin 3 (insertion detect) is NC.
- M3 mounting holes for the printed shell.
