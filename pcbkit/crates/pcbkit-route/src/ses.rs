use pcbkit_core::{RouteSeg, LAYER_BOTTOM, LAYER_TOP};
use regex::Regex;

fn um_to_mm(v: f64) -> f64 {
    v / 1000.0
}

fn layer_to_simple(layer: &str) -> &'static str {
    match layer {
        "B.Cu" => LAYER_BOTTOM,
        _ => LAYER_TOP,
    }
}

/// One continuous routed path (one SES wire polyline, optionally with vias).
#[derive(Debug, Clone)]
pub struct RoutedPath {
    pub net: String,
    pub segs: Vec<RouteSeg>,
}

/// Parse Specctra SES into separate paths (do not merge wires of the same net).
pub fn ses_to_paths(ses_text: &str, default_width_mm: f64) -> Vec<RoutedPath> {
    let mut out = Vec::new();

    let wire_re = Regex::new(r#"\(wire\s*\(\s*path\s+(\S+)\s+([\d.eE+-]+)\s+([^)]+)\)"#).unwrap();
    let via_re = Regex::new(r#"\(via\s+"?([^"\s)]+)"?\s+([\d.eE+-]+)\s+([\d.eE+-]+)"#).unwrap();
    let net_re = Regex::new(r#"\(net\s+"?([^"\s)]+)"?"#).unwrap();

    // Prefer network_out nested form: walk each (net NAME …) block.
    if let Some(start) = ses_text.find("(network_out") {
        let region = &ses_text[start..];
        // Split on "(net " but keep scanning with depth-ish chunks via regex finds
        for net_cap in net_re.captures_iter(region) {
            let net = net_cap.get(1).unwrap().as_str().to_string();
            if net == "network_out" {
                continue;
            }
            let net_start = net_cap.get(0).unwrap().start();
            // Take until next "(net " or end of network_out — approximate with 50k window
            let rest = &region[net_start..];
            let end = rest[1..]
                .find("\n      (net ")
                .map(|i| i + 1)
                .unwrap_or(rest.len().min(200_000));
            let chunk = &rest[..end];

            for m in wire_re.captures_iter(chunk) {
                let layer = layer_to_simple(m.get(1).unwrap().as_str());
                let w_um: f64 = m.get(2).unwrap().as_str().parse().unwrap_or(200.0);
                let coords: Vec<f64> = m
                    .get(3)
                    .unwrap()
                    .as_str()
                    .split_whitespace()
                    .filter_map(|s| s.parse().ok())
                    .collect();
                let width = if w_um.is_finite() {
                    um_to_mm(w_um)
                } else {
                    default_width_mm
                };
                let mut segs = Vec::new();
                for j in (0..coords.len()).step_by(2) {
                    if j + 1 >= coords.len() {
                        break;
                    }
                    segs.push(RouteSeg::Wire {
                        x: um_to_mm(coords[j]),
                        y: -um_to_mm(coords[j + 1]),
                        width,
                        layer: layer.to_string(),
                        net: net.clone(),
                    });
                }
                if !segs.is_empty() {
                    out.push(RoutedPath {
                        net: net.clone(),
                        segs,
                    });
                }
            }

            for m in via_re.captures_iter(chunk) {
                let x: f64 = m.get(2).unwrap().as_str().parse().unwrap_or(0.0);
                let y: f64 = m.get(3).unwrap().as_str().parse().unwrap_or(0.0);
                out.push(RoutedPath {
                    net: net.clone(),
                    segs: vec![RouteSeg::Via {
                        x: um_to_mm(x),
                        y: -um_to_mm(y),
                        net: net.clone(),
                    }],
                });
            }
        }
        if !out.is_empty() {
            return out;
        }
    }

    // Freerouting flat: (wire (path ...)(net ...))
    let flat = Regex::new(
        r#"\(wire\s*\(path\s+(\S+)\s+([\d.eE+-]+)\s+([^)]+)\)\s*\(net\s+"?([^")]+)"?\)"#,
    )
    .unwrap();
    for m in flat.captures_iter(ses_text) {
        let layer = layer_to_simple(m.get(1).unwrap().as_str());
        let w_um: f64 = m.get(2).unwrap().as_str().parse().unwrap_or(200.0);
        let coords: Vec<f64> = m
            .get(3)
            .unwrap()
            .as_str()
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();
        let net = m.get(4).unwrap().as_str().trim().to_string();
        let width = if w_um.is_finite() {
            um_to_mm(w_um)
        } else {
            default_width_mm
        };
        let mut segs = Vec::new();
        for j in (0..coords.len()).step_by(2) {
            if j + 1 >= coords.len() {
                break;
            }
            segs.push(RouteSeg::Wire {
                x: um_to_mm(coords[j]),
                y: -um_to_mm(coords[j + 1]),
                width,
                layer: layer.to_string(),
                net: net.clone(),
            });
        }
        if !segs.is_empty() {
            out.push(RoutedPath { net, segs });
        }
    }

    out
}

/// Flatten paths to segments (for finish heuristics / counts).
pub fn paths_to_segs(paths: &[RoutedPath]) -> Vec<RouteSeg> {
    paths.iter().flat_map(|p| p.segs.iter().cloned()).collect()
}
