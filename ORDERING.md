# Ordering checklist (JLCPCB PCBA)

Specs: [`docs/SPECS.md`](docs/SPECS.md). Design gates:
[`docs/DESIGN_ASSURANCE.md`](docs/DESIGN_ASSURANCE.md).

Lessons from the v1.0 order (July 2026) are in [`docs/HISTORY.md`](docs/HISTORY.md).
For **V3**, fab from the pinned manufacturing board under `ci/artifacts/`
(after verify + `pcbkit:assure`), not from unrouted `export:kicad` output.

## 1. Design freeze

- [ ] Confirm revision: **V3** from tscircuit (not historical Rev 1.0 `fab/`).
- [ ] `git status` is clean for the commit you will tag.
- [ ] `bun install && bun run verify` green.
- [ ] `bun run pcbkit:assure` green against
      `ci/artifacts/v3-manufacturing.kicad_pcb`. Open that `.kicad_pro` in
      KiCad; DRC manufacturing categories clean (USB footprint-internal
      waivers only). Vias ≥ 0.6 / 0.3 mm.
- [ ] Manual rows in `docs/DESIGN_ASSURANCE.md` signed off (F6P6, INA, RGB).
- [ ] Visual check in KiCad — connectors, 240×47 mm outline,
      status LEDs aligned with ports.

## 2. Part availability (BEFORE finalizing the BOM)

- [ ] Check **JLCPCB assembly** stock (not just LCSC) for every Extended part:
      CH32V203F6P6 (`C3040880`), INA3221 (`C181255`), RGB LED (`C5119723`),
      HT7533-1 (`C2686823`).
- [ ] Prefer Basic passives. Record substitutions in the BOM immediately
      (do not invent a second specs doc).

## 3. Upload and BOM matching

- [ ] Upload V3 gerbers/BOM/CPL from `generated/` (or refreshed `fab/`).
- [ ] Board: 2 layers, 1.6 mm FR-4, 240×47 mm, assembly **top**.
- [ ] Every BOM line confirmed; resolve inventory shortages per section 2.

## 4. Placement review (JLC 3D viewer)

- [ ] Polarized parts and IC pin-1 correct.
- [ ] Vertical USB-C plugs centered; MCU TSSOP-20 orientation correct.
- [ ] **USB1 PD receptacle opening faces the left edge** (pads inboard),
      same as barrel jack — not flipped inboard.
- [ ] BOOT switch SW1 accessible; nothing off-board.

## 5. Before paying

- [ ] Screenshot final BOM match page.
- [ ] Tag the commit (`git tag v3.0 && git push --tags`) and attach fab zips
      to a GitHub release.

## 6. After ordering / bring-up

- [ ] Power via USB1 or limited bench supply; check `rail_3v3` and both 5 V rails.
- [ ] Flash firmware over USB1 + BOOT0 with `wchisp` (barrel unplugged). See
      `firmware/status-controller/README.md`.
- [ ] Confirm OE keeps LEDs dark until firmware enables outputs; calibrate
      thresholds in `status_config.h` against a real bar (meanings in
      [`docs/SPECS.md`](docs/SPECS.md)).
