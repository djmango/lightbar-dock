use pcbkit_core::{Board, Profile};

fn mm_to_um(v: f64) -> i64 {
    (v * 1000.0).round() as i64
}

fn layer_name(layer: &str) -> &'static str {
    match layer.to_lowercase().as_str() {
        "bottom" | "b.cu" | "back" => "B.Cu",
        _ => "F.Cu",
    }
}

/// Build a Specctra DSN from the board IR (µm, Y flipped).
pub fn board_to_dsn(board: &Board, profile: &Profile) -> String {
    let width_um = mm_to_um(profile.trace_width_mm);
    let clearance_um = mm_to_um(profile.clearance_mm);
    let via_diam = mm_to_um(profile.via_diameter_mm);
    let via_drill = mm_to_um(profile.via_drill_mm);
    let min_pad = (width_um * 3).max(400);

    let half_w = board.width / 2.0;
    let half_h = board.height / 2.0;
    let min_x = mm_to_um(board.center.x - half_w);
    let max_x = mm_to_um(board.center.x + half_w);
    let min_y = mm_to_um(board.center.y - half_h);
    let max_y = mm_to_um(board.center.y + half_h);
    let boundary = format!(
        "{max_x} {}  {min_x} {}  {min_x} {}  {max_x} {}  {max_x} {}",
        -min_y, -min_y, -max_y, -max_y, -min_y
    );

    let skip: std::collections::HashSet<_> = profile
        .skip_nets
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let mut by_net: std::collections::BTreeMap<String, Vec<usize>> =
        std::collections::BTreeMap::new();
    for (i, p) in board.pads.iter().enumerate() {
        if skip.contains(&p.net.to_ascii_lowercase()) {
            continue;
        }
        by_net.entry(p.net.clone()).or_default().push(i);
    }

    // Keepouts for skipped-net pads (e.g. GND) so copper cannot run through them.
    let mut keepouts = Vec::new();
    for p in &board.pads {
        if !skip.contains(&p.net.to_ascii_lowercase()) {
            continue;
        }
        let cx = mm_to_um(p.x);
        let cy = -mm_to_um(p.y);
        let hw = mm_to_um(p.width / 2.0).max(min_pad / 2);
        let hh = mm_to_um(p.height / 2.0).max(min_pad / 2);
        let ly = layer_name(&p.layer);
        keepouts.push(format!(
            "    (keepout \"\" (rect {ly} {} {} {} {}))",
            cx - hw,
            cy - hh,
            cx + hw,
            cy + hh
        ));
    }

    let mut images = Vec::new();
    let mut places = Vec::new();
    let mut padstacks = Vec::new();
    let mut nets = Vec::new();
    let mut pin_idx = 0usize;

    for (net_name, idxs) in &by_net {
        if idxs.len() < 2 {
            continue;
        }
        let mut pins = Vec::new();
        for &i in idxs {
            let p = &board.pads[i];
            pin_idx += 1;
            let ref_name = format!("T{pin_idx}");
            let padstack = format!("Pad{pin_idx}");
            let x = mm_to_um(p.x);
            let y = -mm_to_um(p.y);
            let ly = layer_name(&p.layer);
            let pw = mm_to_um(p.width).max(min_pad);
            let ph = mm_to_um(p.height).max(min_pad);
            // Circle diameter = max dimension (conservative obstacle).
            let pd = pw.max(ph);
            images.push(format!(
                r#"    (image {ref_name}
      (outline (path {ly} 0  {} {}  {} {}  {} {}  {} {}  {} {}))
      (pin {padstack} 1 0 0)
    )"#,
                -pw / 2,
                -ph / 2,
                pw / 2,
                -ph / 2,
                pw / 2,
                ph / 2,
                -pw / 2,
                ph / 2,
                -pw / 2,
                -ph / 2
            ));
            // Pin only on its copper layer — avoids phantom bottom obstacles for top SMT.
            if ly == "B.Cu" {
                padstacks.push(format!(
                    r#"    (padstack {padstack}
      (shape (circle B.Cu {pd}))
    )"#
                ));
            } else {
                padstacks.push(format!(
                    r#"    (padstack {padstack}
      (shape (circle F.Cu {pd}))
    )"#
                ));
            }
            places.push(format!(
                r#"    (component {ref_name}
      (place {ref_name} {x} {y} front 0)
    )"#
            ));
            pins.push(format!("{ref_name}-1"));
        }
        let safe = net_name.replace('"', "");
        nets.push(format!(
            "    (net \"{safe}\"\n      (pins {})\n    )",
            pins.join(" ")
        ));
    }

    format!(
        r#"(pcb "pcbkit"
  (parser
    (string_quote ")
    (space_in_quoted_tokens on)
    (host_cad "pcbkit")
    (host_version "0.1.0")
  )
  (resolution um 10)
  (unit um)
  (structure
    (layer F.Cu
      (type signal)
      (property
        (index 0)
      )
    )
    (layer B.Cu
      (type signal)
      (property
        (index 1)
      )
    )
    (boundary
      (path pcb 0  {boundary})
    )
{}
    (via "Via[0-1]_{via_diam}:{via_drill}_um")
    (rule
      (width {width_um})
      (clearance {clearance_um})
    )
  )
  (placement
{}
  )
  (library
{}
{}
    (padstack "Via[0-1]_{via_diam}:{via_drill}_um"
      (shape (circle F.Cu {via_diam}))
      (shape (circle B.Cu {via_diam}))
    )
  )
  (network
{}
  )
  (wiring
  )
)
"#,
        keepouts.join("\n"),
        places.join("\n"),
        images.join("\n"),
        padstacks.join("\n"),
        nets.join("\n"),
    )
}
