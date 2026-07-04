# Ordering checklist (JLCPCB PCBA)

Lessons learned from the v1.0 order (July 2026). Run through this list top to bottom
before uploading anything, and again right before paying.

## 1. Design freeze

- [ ] `git status` is clean; the routed `layouts/default/default.kicad_pcb` is committed.
- [ ] Do NOT run `ato build` after routing — it re-syncs placement and destroys the
      routed layout. Generate fab outputs with `kicad-cli` directly (see README).
- [ ] DRC in KiCad: 0 errors, or every remaining violation is understood and waivable
      (write down why, e.g. padstack warnings on NPTH mounting holes).
- [ ] All nets connected: 0 unconnected items in the ratsnest.
- [ ] Visual check of the 3D render — connector orientation, silkscreen designators,
      nothing floating outside the board outline.

## 2. Part availability (do this BEFORE finalizing the BOM)

This bit us: 4 of 32 line items showed 0 JLC stock only after upload.

- [ ] For every LCSC part number in the BOM, check live stock on jlcpcb.com/parts
      (the "JLCPCB" stock column, not "Other"). LCSC stock ≠ JLCPCB assembly stock.
- [ ] Prefer **Basic** parts for passives — no extended-part setup fee, rarely out
      of stock. For generic R/C, search by value + package (e.g. "10k 0402") and pick
      a Basic part with tens of thousands in stock.
- [ ] For Extended parts with no stock, options in order of preference:
      1. Substitute an equivalent in-stock part (same value/package, equal-or-better
         specs — check current rating, tolerance, Rds(on), etc.).
      2. JLC "Pre-order" (formerly Global Sourcing) — adds ~1-2 weeks lead time.
      3. Consigned inventory (ship parts to JLC yourself) — last resort.
- [ ] Record every substitution in `fab/bom_jlcpcb.csv` and the README as-built table
      immediately, so the repo matches what was actually manufactured.

## 3. Upload and BOM matching

- [ ] Upload `fab/lightbar-dock-gerbers.zip`, `fab/bom_jlcpcb.csv`, `fab/cpl_jlcpcb.csv`.
- [ ] Board settings: 2 layers, 1.6 mm FR-4, HASL or ENIG, board size auto-detected
      (should read 240 x 47 mm).
- [ ] Assembly: **single-sided (top)** — all parts on F.Cu.
- [ ] Every BOM line shows "confirmed" with the intended LCSC part. Watch for JLC
      auto-matching a different part than the C-number you specified.
- [ ] "Inventory shortage" flags: resolve via section 2. Parts in your cart do NOT
      count toward assembly stock — pre-order/consign is a separate flow.

## 4. Placement review (JLC's 3D viewer)

- [ ] Polarized parts (diodes, LEDs, electrolytics): cathode marks match the board.
- [ ] ICs: pin-1 orientation correct (JLC sometimes rotates 90/180° from the CPL).
- [ ] Connectors sit on their pads; vertical USB-C plugs centered on each port.
- [ ] Nothing overlapping, nothing off-board.

## 5. Before paying

- [ ] Screenshot/save the final BOM match page (part numbers + prices).
- [ ] Tag the exact commit that produced the uploaded files
      (e.g. `git tag v1.0 && git push --tags`) and attach the fab zips to a GitHub
      release so the order is reproducible.
- [ ] Note the order number and date in the release notes.

## 6. After ordering

- [ ] Update BOM/README with any last-minute substitutions made in the JLC UI.
- [ ] Export `fab/lightbar-dock.step` for mechanical design if the board outline or
      connector positions changed.
- [ ] Plan bring-up: power via bench supply first with current limit (~100 mA), check
      both 5 V rails unloaded, then plug in one light bar at a time and confirm each
      status LED lights while charging.
