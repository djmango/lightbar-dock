//! USB-C flip-pad handling for KiCad Specctra boards (no Python / no pcbnew).
//!
//! Why this exists: a USB-C receptacle has two pads per D+/D− (A6/B6, A7/B7)
//! so the cable works either way up. Both pads share one net, but they sit on
//! opposite sides of a dense pad row at the board edge. Freerouting typically
//! routes one pad of the pair and then fails the mirrored pad (clearance /
//! rip-up deadlock in the USB escape channel) — historically the last
//! incomplete on this dock (`usb_dp` 7/8 connected).
//!
//! Fix: after Freerouting, bridge the flip pads with short F.Cu stubs to
//! offset vias and a B.Cu spine. Do **not** pre-wire these into the DSN —
//! protected pre-wires block Freerouting's escape from USB1 and leave more
//! incompletes overall.

use crate::kicad_pcb::{KicadCopper, KicadSegment, KicadVia};
use pcbkit_core::{Profile, RepairSpec};
use regex::Regex;

#[derive(Debug, Clone)]
pub struct PadAt {
    pub x: f64,
    pub y: f64,
    pub layer: String,
}

/// Append profile repairs (USB-C flip bridges) onto existing copper.
pub fn apply_kicad_repairs(pcb_text: &str, copper: &mut KicadCopper, profile: &Profile) {
    for r in &profile.repairs {
        match r {
            RepairSpec::UsbCFlipPads {
                component,
                net,
                via_offset_mm,
            } => {
                let pads = footprint_pads(pcb_text, component, net);
                if pads.len() < 2 {
                    continue;
                }
                extend_usb_flip(copper, &pads, net, *via_offset_mm, profile);
            }
        }
    }
}

pub fn footprint_pads(pcb_text: &str, component: &str, net: &str) -> Vec<PadAt> {
    // KiCad 10: `(property "Reference" "USB1"` then nested `(at …)` — no close paren yet.
    let needle = format!("(property \"Reference\" \"{component}\"");
    let Some(idx) = pcb_text.find(&needle) else {
        return vec![];
    };
    let start = pcb_text[..idx].rfind("\n\t(footprint").unwrap_or(0);
    let end = pcb_text[idx..]
        .find("\n\t(footprint")
        .map(|i| idx + i)
        .unwrap_or(pcb_text.len());
    let chunk = &pcb_text[start..end];

    // Footprint placement is the first `(at x y [rot])` after `(footprint …)`.
    let at_re = Regex::new(r#"\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)"#).unwrap();
    let Some(at) = at_re.captures(chunk) else {
        return vec![];
    };
    let fx: f64 = at.get(1).unwrap().as_str().parse().unwrap_or(0.0);
    let fy: f64 = at.get(2).unwrap().as_str().parse().unwrap_or(0.0);
    let rot_deg: f64 = at
        .get(3)
        .map(|g| g.as_str().parse().unwrap_or(0.0))
        .unwrap_or(0.0);
    // KiCad PCB Y+ is down. Negate the stored angle so local pad offsets match
    // `kicad-cli`/pcbnew absolute positions (e.g. USB1 at … -90 → use +90 here).
    let rot = (-rot_deg).to_radians();
    let (c, s) = (rot.cos(), rot.sin());

    let pad_re = Regex::new(
        r#"\(pad "[^"]+"\s+\w+\s+\w+\s*\n\s*\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)[\s\S]*?\(layers "([^"]+)"[\s\S]*?\(net "([^"]+)"\)"#,
    )
    .unwrap();
    let mut pads = Vec::new();
    for cap in pad_re.captures_iter(chunk) {
        let px: f64 = cap.get(1).unwrap().as_str().parse().unwrap_or(0.0);
        let py: f64 = cap.get(2).unwrap().as_str().parse().unwrap_or(0.0);
        let layers = cap.get(4).unwrap().as_str();
        let pnet = cap.get(5).unwrap().as_str();
        if pnet != net {
            continue;
        }
        let x = fx + px * c - py * s;
        let y = fy + px * s + py * c;
        let layer = if layers.contains("B.Cu") && !layers.contains("F.Cu") {
            "B.Cu"
        } else {
            "F.Cu"
        };
        pads.push(PadAt {
            x,
            y,
            layer: layer.to_string(),
        });
    }
    pads
}

fn via_xy(pads: &[PadAt], via_offset_mm: f64) -> f64 {
    let mean_x: f64 = pads.iter().map(|p| p.x).sum::<f64>() / pads.len() as f64;
    let sign = if mean_x >= 0.0 { -1.0 } else { 1.0 };
    mean_x + sign * via_offset_mm.abs()
}

fn extend_usb_flip(
    copper: &mut KicadCopper,
    pads: &[PadAt],
    net: &str,
    via_offset_mm: f64,
    profile: &Profile,
) {
    let via_x = via_xy(pads, via_offset_mm);
    let width = profile.trace_width_mm;
    let mut sorted = pads.to_vec();
    sorted.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal));

    for p in &sorted {
        copper.segments.push(KicadSegment {
            x1: p.x,
            y1: p.y,
            x2: via_x,
            y2: p.y,
            width,
            layer: p.layer.clone(),
            net: net.to_string(),
        });
        copper.vias.push(KicadVia {
            x: via_x,
            y: p.y,
            size: profile.via_diameter_mm,
            drill: profile.via_drill_mm,
            net: net.to_string(),
        });
    }
    if sorted.len() >= 2 {
        let first = &sorted[0];
        let last = sorted.last().unwrap();
        copper.segments.push(KicadSegment {
            x1: via_x,
            y1: first.y,
            x2: via_x,
            y2: last.y,
            width,
            layer: "B.Cu".into(),
            net: net.to_string(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pcbkit_core::{EngineKind, GateSpec, RepairSpec};

    fn profile() -> Profile {
        Profile {
            topola_bin: "topola".into(),
            freerouting_jar: None,
            java_bin: "java".into(),
            engine: EngineKind::Freerouting,
            topola_args: vec![],
            freerouting_passes: 1,
            trace_width_mm: 0.15,
            via_diameter_mm: 0.6,
            via_drill_mm: 0.3,
            clearance_mm: 0.15,
            skip_nets: vec![],
            repairs: vec![RepairSpec::UsbCFlipPads {
                component: "USB1".into(),
                net: "usb_dp".into(),
                via_offset_mm: 2.0,
            }],
            gate: GateSpec::default(),
            finish: false,
            finish_grid_mm: 0.1,
        }
    }

    #[test]
    fn usb_flip_pads_and_bridge() {
        let pcb = r#"
	(footprint "USB"
		(layer "F.Cu")
		(uuid "a")
		(at -15.1625 88.5 -90)
		(property "Reference" "USB1"
			(at 0 0 0)
			(layer "F.SilkS")
			(uuid "b")
		)
		(pad "7" smd rect
			(at -0.25 -2.5425)
			(size 1.1 0.3)
			(layers "F.Cu" "F.Mask")
			(net "usb_dp")
			(uuid "c")
		)
		(pad "9" smd rect
			(at 0.75 -2.5425)
			(size 1.1 0.3)
			(layers "F.Cu" "F.Mask")
			(net "usb_dp")
			(uuid "d")
		)
	)
"#;
        let pads = footprint_pads(pcb, "USB1", "usb_dp");
        assert_eq!(pads.len(), 2);
        // KiCad abs for pad7 / pad9 with footprint at (-15.1625, 88.5, -90).
        let xs: Vec<f64> = pads.iter().map(|p| p.x).collect();
        let ys: Vec<f64> = pads.iter().map(|p| p.y).collect();
        assert!(xs.iter().all(|x| (x - (-12.62)).abs() < 1e-2));
        assert!(ys.iter().any(|y| (y - 88.25).abs() < 1e-2));
        assert!(ys.iter().any(|y| (y - 89.25).abs() < 1e-2));
        let mut copper = KicadCopper {
            segments: vec![],
            vias: vec![],
        };
        apply_kicad_repairs(pcb, &mut copper, &profile());
        assert_eq!(copper.vias.len(), 2);
        assert_eq!(copper.segments.len(), 3); // 2 stubs + 1 bridge
        // mean_x=-12.62, offset +2 toward board interior → via_x=-10.62
        assert!(copper.vias.iter().all(|v| (v.x - (-10.62)).abs() < 1e-2));
    }
}
