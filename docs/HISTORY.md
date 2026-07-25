# Historical notes (Rev 1.0)

Not current. Product / electrical specs for V3 are in [`SPECS.md`](SPECS.md).

## Rev 1.0 as-built (ordered 2026-07-04)

`fab/bom_jlcpcb.csv` reflects parts ordered then. Substitutions at order time:

| Refs | Part ordered | LCSC | Notes |
| --- | --- | --- | --- |
| L1, L2 | Sunlord SWPA8040S4R7NT 4.7µH | C36417 | (was 5.6µH C96972) |
| R7, R11 | RALEC RTT023401FTH 3.4kΩ 1% | C102987 | (was C4940) buck fsw |
| R52 | YAGEO RC0402FR-0710KL 10kΩ 1% | C60490 | (was C25744) power LED series R |

USB2–9 plugs (C399938) were bought into the JLC parts library via parts
pre-order (40 pcs).

Rev 1.0 used per-bank **LM339** comparators and a single green LED per port
(not firmware RGB). KiCad/`fab/` under this tree may still describe that
layout.

## v1 status LED ghost-glow

The v1 LM339 circuit compared each post-shunt port voltage against one shared
reference per four-port bank (~21 mV below the 5 V rail). Long 5 V traces and
polyfuses can drop more than that when neighbors draw current, so idle ports
could look active and LEDs ghost-glowed.

Bodges (pull-ups, raise threshold resistors, per-port references) never
distinguished empty vs fully charged. V3 uses CC attach + INA3221 current and
firmware-driven red/green LEDs — see [`SPECS.md`](SPECS.md).

## Rev 1 routing notes

Rev 1 was routed with Freerouting + KiCad cleanup, B.Cu GND plane, and JLC
2-layer rules of that era (including some 0.45/0.25 mm vias). V3 via policy is
≥ 0.6 mm pad / 0.3 mm hole (`bun run verify:vias`).
