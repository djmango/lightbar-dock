//! Apply Specctra SES copper into a KiCad 10 `.kicad_pcb` (Rust only).
//!
//! Additive strategy: strip existing top-level `(segment)` / `(via)` copper, then
//! append new segments/vias. Does **not** emulate `pcbnew.ImportSpecctraSES`
//! (which rewrites the board and historically destroyed pre-routed copper).

use crate::kicad_repairs::apply_kicad_repairs;
use crate::ses::{ses_to_paths, SesScale};
use pcbkit_core::{Error, Profile, Result, RouteSeg, LAYER_BOTTOM};
use regex::Regex;
use std::path::Path;

/// Parsed copper to write into a KiCad PCB.
#[derive(Debug, Clone)]
pub struct KicadCopper {
    pub segments: Vec<KicadSegment>,
    pub vias: Vec<KicadVia>,
}

#[derive(Debug, Clone)]
pub struct KicadSegment {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub width: f64,
    pub layer: String,
    pub net: String,
}

#[derive(Debug, Clone)]
pub struct KicadVia {
    pub x: f64,
    pub y: f64,
    pub size: f64,
    pub drill: f64,
    pub net: String,
}

/// Convert SES text into KiCad copper primitives (mm, KiCad Y+ down).
pub fn ses_to_kicad_copper(
    ses_text: &str,
    default_width_mm: f64,
    via_size_mm: f64,
    via_drill_mm: f64,
) -> KicadCopper {
    let scale = SesScale::parse(ses_text);
    let paths = ses_to_paths(ses_text, default_width_mm);
    let mut segments = Vec::new();
    let mut vias = Vec::new();

    for path in &paths {
        let mut prev: Option<(f64, f64, f64, String, String)> = None;
        for seg in &path.segs {
            match seg {
                RouteSeg::Wire {
                    x,
                    y,
                    width,
                    layer,
                    net,
                } => {
                    let layer_k = if layer == LAYER_BOTTOM {
                        "B.Cu"
                    } else {
                        "F.Cu"
                    };
                    if let Some((px, py, pw, pl, pn)) = prev {
                        if pl == layer_k && pn == *net {
                            segments.push(KicadSegment {
                                x1: px,
                                y1: py,
                                x2: *x,
                                y2: *y,
                                width: pw.min(*width).max(0.05),
                                layer: pl,
                                net: pn,
                            });
                        }
                    }
                    prev = Some((*x, *y, *width, layer_k.to_string(), net.clone()));
                }
                RouteSeg::Via { x, y, net } => {
                    prev = None;
                    let (size, drill) = via_size_from_ses(ses_text, scale)
                        .unwrap_or((via_size_mm, via_drill_mm));
                    vias.push(KicadVia {
                        x: *x,
                        y: *y,
                        size,
                        drill,
                        net: net.clone(),
                    });
                }
            }
        }
    }

    // Also catch Freerouting flat vias that sit outside network_out net chunks
    // (already covered by ses_to_paths for nested form).
    let _ = scale;
    KicadCopper { segments, vias }
}

fn via_size_from_ses(ses_text: &str, scale: SesScale) -> Option<(f64, f64)> {
    // Via[0-1]_600:300_um → 0.6 / 0.3 mm (name is in µm, not SES resolution units).
    let re = Regex::new(r#"Via\[\d+-\d+\]_(\d+):(\d+)_um"#).unwrap();
    let cap = re.captures(ses_text)?;
    let size = cap.get(1)?.as_str().parse::<f64>().ok()? / 1000.0;
    let drill = cap.get(2)?.as_str().parse::<f64>().ok()? / 1000.0;
    let _ = scale;
    Some((size, drill))
}

/// Remove top-level `(segment …)` / `(via …)` sexps from a KiCad PCB.
pub fn strip_copper_routes(pcb_text: &str) -> String {
    strip_top_level_tags(pcb_text, &["(segment", "(via"])
}

/// Remove top-level `(zone …)` sexps from a KiCad PCB.
pub fn strip_zones(pcb_text: &str) -> String {
    strip_top_level_tags(pcb_text, &["(zone"])
}

/// Extract top-level `(zone …)` sexps (including trailing newlines).
pub fn extract_zones(pcb_text: &str) -> Vec<String> {
    let bytes = pcb_text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if looks_like_top_level(bytes, i, b"(zone") { // tag: zone
            if let Some(end) = skip_sexp(bytes, i) {
                let mut j = end;
                if j < bytes.len() && bytes[j] == b'\n' {
                    j += 1;
                }
                // Include the leading tab when present.
                let start = if i >= 1 && bytes[i - 1] == b'\t' {
                    i - 1
                } else {
                    i
                };
                out.push(String::from_utf8_lossy(&bytes[start..j]).into_owned());
                i = j;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn strip_top_level_tags(pcb_text: &str, tags: &[&str]) -> String {
    let mut out = String::with_capacity(pcb_text.len());
    let bytes = pcb_text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if tags
            .iter()
            .any(|t| looks_like_top_level(bytes, i, t.as_bytes()))
        {
            if let Some(end) = skip_sexp(bytes, i) {
                let mut j = end;
                if j < bytes.len() && bytes[j] == b'\n' {
                    j += 1;
                }
                // Also drop the preceding tab so we don't leave blank indented lines.
                if !out.is_empty() && out.as_bytes().last() == Some(&b'\t') {
                    out.pop();
                }
                i = j;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

pub(crate) fn looks_like_top_level(bytes: &[u8], i: usize, tag: &[u8]) -> bool {
    if i + tag.len() > bytes.len() {
        return false;
    }
    if &bytes[i..i + tag.len()] != tag {
        return false;
    }
    // Top-level KiCad 10 items are `\n\t(segment` / `\n\t(via`.
    if i >= 2 && bytes[i - 1] == b'\t' && bytes[i - 2] == b'\n' {
        return true;
    }
    i == 0
}

pub(crate) fn skip_sexp(bytes: &[u8], start: usize) -> Option<usize> {
    if start >= bytes.len() || bytes[start] != b'(' {
        return None;
    }
    let mut depth = 0i32;
    let mut i = start;
    while i < bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            b'"' => {
                i += 1;
                while i < bytes.len() && bytes[i] != b'"' {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

fn fmt_mm(v: f64) -> String {
    let s = format!("{v:.6}");
    s.trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

fn new_uuid(n: u64) -> String {
    // Deterministic-ish UUIDs so rebuilds are stable for the same copper order.
    format!(
        "{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        (n >> 32) as u32,
        ((n >> 16) & 0xffff) as u16,
        (n & 0xfff) as u16,
        ((n >> 8) & 0xfff) as u16,
        n & 0xffff_ffff_ffff
    )
}

fn quote_net(net: &str) -> String {
    format!("\"{}\"", net.replace('"', ""))
}

fn layer_quoted(layer: &str) -> String {
    format!("\"{layer}\"")
}

/// Append copper and optional zone sexps before the closing `)`.
pub fn append_copper(
    pcb_text: &str,
    copper: &KicadCopper,
    zones: &[String],
    add_empty_gnd_zones: bool,
) -> Result<String> {
    let trimmed = pcb_text.trim_end();
    let Some(stripped) = trimmed.strip_suffix(')') else {
        return Err(Error::Msg("kicad_pcb: missing closing ')'".into()));
    };
    let mut body = stripped.to_string();
    if !body.ends_with('\n') {
        body.push('\n');
    }

    let mut id = 1u64;
    for s in &copper.segments {
        body.push_str(&format!(
            "\t(segment\n\t\t(start {} {})\n\t\t(end {} {})\n\t\t(width {})\n\t\t(layer {})\n\t\t(net {})\n\t\t(uuid \"{}\")\n\t)\n",
            fmt_mm(s.x1),
            fmt_mm(s.y1),
            fmt_mm(s.x2),
            fmt_mm(s.y2),
            fmt_mm(s.width),
            layer_quoted(&s.layer),
            quote_net(&s.net),
            new_uuid(id),
        ));
        id += 1;
    }
    for v in &copper.vias {
        body.push_str(&format!(
            "\t(via\n\t\t(at {} {})\n\t\t(size {})\n\t\t(drill {})\n\t\t(layers \"F.Cu\" \"B.Cu\")\n\t\t(net {})\n\t\t(uuid \"{}\")\n\t)\n",
            fmt_mm(v.x),
            fmt_mm(v.y),
            fmt_mm(v.size),
            fmt_mm(v.drill),
            quote_net(&v.net),
            new_uuid(id),
        ));
        id += 1;
    }

    if !zones.is_empty() {
        for z in zones {
            let z = z.trim_start_matches('\n');
            if !z.starts_with('\t') && !z.starts_with("(zone") {
                body.push('\t');
            } else if z.starts_with("(zone") {
                body.push('\t');
            }
            body.push_str(z);
            if !z.ends_with('\n') {
                body.push('\n');
            }
        }
    } else if add_empty_gnd_zones {
        for (layer, n) in [("F.Cu", id), ("B.Cu", id + 1)] {
            body.push_str(&format!(
                "\t(zone\n\t\t(net \"gnd\")\n\t\t(layer \"{layer}\")\n\t\t(uuid \"{}\")\n\t\t(hatch edge 0.5)\n\t\t(connect_pads yes\n\t\t\t(clearance 0.2)\n\t\t)\n\t\t(min_thickness 0.2)\n\t\t(fill yes\n\t\t\t(thermal_gap 0.5)\n\t\t\t(thermal_bridge_width 0.5)\n\t\t\t(island_removal_mode 0)\n\t\t)\n\t\t(polygon\n\t\t\t(pts\n\t\t\t\t(xy -19.75 76.75) (xy 219.75 76.75) (xy 219.75 123.25) (xy -19.75 123.25)\n\t\t\t)\n\t\t)\n\t)\n",
                new_uuid(n),
            ));
        }
    }

    body.push(')');
    body.push('\n');
    Ok(body)
}

/// Apply SES routes into a KiCad PCB string.
pub fn apply_ses_to_pcb_text(
    pcb_text: &str,
    ses_text: &str,
    profile: &Profile,
    add_empty_gnd_zones: bool,
    zones_from_pcb: Option<&str>,
) -> Result<(String, usize, usize)> {
    let mut copper = ses_to_kicad_copper(
        ses_text,
        profile.trace_width_mm,
        profile.via_diameter_mm,
        profile.via_drill_mm,
    );
    apply_kicad_repairs(pcb_text, &mut copper, profile);
    let seg_n = copper.segments.len();
    let via_n = copper.vias.len();
    let mut stripped = strip_copper_routes(pcb_text);
    stripped = strip_zones(&stripped);
    let zones = zones_from_pcb
        .map(extract_zones)
        .unwrap_or_default();
    let out = append_copper(
        &stripped,
        &copper,
        &zones,
        add_empty_gnd_zones && zones.is_empty(),
    )?;
    Ok((out, seg_n, via_n))
}

/// Apply SES file onto a KiCad PCB file and write `out`.
pub fn apply_ses_to_pcb_files(
    pcb_path: &Path,
    ses_path: &Path,
    out_path: &Path,
    profile: &Profile,
    add_empty_gnd_zones: bool,
    zones_from: Option<&Path>,
) -> Result<(usize, usize)> {
    let pcb = std::fs::read_to_string(pcb_path)?;
    let ses = std::fs::read_to_string(ses_path)?;
    let zones_src = match zones_from {
        Some(p) => Some(std::fs::read_to_string(p)?),
        None => None,
    };
    let (text, seg_n, via_n) = apply_ses_to_pcb_text(
        &pcb,
        &ses,
        profile,
        add_empty_gnd_zones,
        zones_src.as_deref(),
    )?;
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(out_path, text)?;
    Ok((seg_n, via_n))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pcbkit_core::{EngineKind, GateSpec};

    fn test_profile() -> Profile {
        Profile {
            topola_bin: "topola".into(),
            freerouting_jar: None,
            java_bin: "java".into(),
            engine: EngineKind::Topola,
            topola_args: vec![],
            freerouting_passes: 1,
            trace_width_mm: 0.15,
            via_diameter_mm: 0.6,
            via_drill_mm: 0.3,
            clearance_mm: 0.15,
            skip_nets: vec![],
            repairs: vec![],
            gate: GateSpec::default(),
            finish: false,
            finish_grid_mm: 0.1,
        }
    }

    #[test]
    fn strip_and_apply_roundtrip_coords() {
        let pcb = "(kicad_pcb\n\t(version 20240108)\n\t(generator \"pcbkit\")\n\t(segment\n\t\t(start 1 2)\n\t\t(end 3 4)\n\t\t(width 0.15)\n\t\t(layer \"F.Cu\")\n\t\t(net \"old\")\n\t\t(uuid \"00000000-0000-4000-a000-000000000001\")\n\t)\n\t(embedded_fonts no)\n)\n";
        let ses = r#"(session "x"
  (routes
    (resolution um 10)
    (network_out
      (net "rail_5v_b"
        (wire
          (path F.Cu 1500
            1407000 -1178500
            1401483 -1178500
          )
        )
        (via "Via[0-1]_600:300_um" 1267139 -1194638)
      )
    )
  )
)
"#;
        let (out, segs, vias) =
            apply_ses_to_pcb_text(pcb, ses, &test_profile(), false, None).unwrap();
        assert_eq!(segs, 1);
        assert_eq!(vias, 1);
        assert!(!out.contains("(net \"old\")"));
        assert!(out.contains("140.7 117.85"));
        assert!(out.contains("140.1483 117.85"));
        assert!(out.contains("126.7139 119.4638"));
        assert!(out.contains("rail_5v_b"));
    }
}
