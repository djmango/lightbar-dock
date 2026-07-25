use pcbkit_core::{RouteSeg, LAYER_BOTTOM, LAYER_TOP};
use regex::Regex;

/// Specctra coordinate scale parsed from `(resolution UNIT VALUE)`.
///
/// For KiCad/Topola/Freerouting SES with `(resolution um 10)`, coordinates are
/// in units of `VALUE` micrometers — i.e. `mm = coord / (1000 * VALUE)`.
#[derive(Debug, Clone, Copy)]
pub struct SesScale {
    /// Divide SES integers by this to get millimeters.
    pub to_mm: f64,
}

impl Default for SesScale {
    fn default() -> Self {
        // Specctra default when header missing: treat as plain µm.
        Self { to_mm: 1000.0 }
    }
}

impl SesScale {
    pub fn parse(ses_text: &str) -> Self {
        // Prefer the routes-block resolution (Topola/Freerouting write it there).
        let re = Regex::new(
            r#"\(resolution\s+(um|mm|inch)\s+([\d.eE+-]+)"#,
        )
        .unwrap();
        let mut last = None;
        for cap in re.captures_iter(ses_text) {
            let unit = cap.get(1).unwrap().as_str();
            let parsed: f64 = cap
                .get(2)
                .unwrap()
                .as_str()
                .parse()
                .unwrap_or(1.0);
            let value = if parsed > 1e-9 { parsed } else { 1e-9 };
            let to_mm = match unit {
                "um" => 1000.0 * value,
                "mm" => value,
                "inch" => value / 25.4,
                _ => 1000.0 * value,
            };
            last = Some(Self { to_mm });
        }
        last.unwrap_or_default()
    }

    pub fn coord_to_mm(self, v: f64) -> f64 {
        v / self.to_mm
    }
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
    let scale = SesScale::parse(ses_text);
    ses_to_paths_with_scale(ses_text, default_width_mm, scale)
}

pub fn ses_to_paths_with_scale(
    ses_text: &str,
    default_width_mm: f64,
    scale: SesScale,
) -> Vec<RoutedPath> {
    let mut out = Vec::new();

    let wire_re = Regex::new(r#"\(wire\s*\(\s*path\s+(\S+)\s+([\d.eE+-]+)\s+([^)]+)\)"#).unwrap();
    let via_re = Regex::new(r#"\(via\s+"?([^"\s)]+)"?\s+([\d.eE+-]+)\s+([\d.eE+-]+)"#).unwrap();
    // Quoted nets may contain spaces (`".LED6 > .redCathode to .R61 > .pin2"`).
    let net_re = Regex::new(r#"\(net\s+(?:"([^"]+)"|([^\s()]+))"#).unwrap();

    // Prefer network_out nested form: walk each (net NAME …) block.
    if let Some(start) = ses_text.find("(network_out") {
        let region = &ses_text[start..];
        for net_cap in net_re.captures_iter(region) {
            let net = net_cap
                .get(1)
                .or_else(|| net_cap.get(2))
                .unwrap()
                .as_str()
                .to_string();
            if net == "network_out" {
                continue;
            }
            let net_start = net_cap.get(0).unwrap().start();
            let rest = &region[net_start..];
            let end = rest[1..]
                .find("\n      (net ")
                .map(|i| i + 1)
                .unwrap_or(rest.len().min(200_000));
            let chunk = &rest[..end];

            for m in wire_re.captures_iter(chunk) {
                let layer = layer_to_simple(m.get(1).unwrap().as_str());
                let w_raw: f64 = m.get(2).unwrap().as_str().parse().unwrap_or(200.0);
                let coords: Vec<f64> = m
                    .get(3)
                    .unwrap()
                    .as_str()
                    .split_whitespace()
                    .filter_map(|s| s.parse().ok())
                    .collect();
                let width = if w_raw.is_finite() {
                    scale.coord_to_mm(w_raw)
                } else {
                    default_width_mm
                };
                let mut segs = Vec::new();
                for j in (0..coords.len()).step_by(2) {
                    if j + 1 >= coords.len() {
                        break;
                    }
                    segs.push(RouteSeg::Wire {
                        x: scale.coord_to_mm(coords[j]),
                        y: -scale.coord_to_mm(coords[j + 1]),
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
                        x: scale.coord_to_mm(x),
                        y: -scale.coord_to_mm(y),
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
        r#"\(wire\s*\(path\s+(\S+)\s+([\d.eE+-]+)\s+([^)]+)\)\s*\(net\s+(?:"([^"]+)"|([^\s()]+))\)"#,
    )
    .unwrap();
    for m in flat.captures_iter(ses_text) {
        let layer = layer_to_simple(m.get(1).unwrap().as_str());
        let w_raw: f64 = m.get(2).unwrap().as_str().parse().unwrap_or(200.0);
        let coords: Vec<f64> = m
            .get(3)
            .unwrap()
            .as_str()
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();
        let net = m
            .get(4)
            .or_else(|| m.get(5))
            .unwrap()
            .as_str()
            .trim()
            .to_string();
        let width = if w_raw.is_finite() {
            scale.coord_to_mm(w_raw)
        } else {
            default_width_mm
        };
        let mut segs = Vec::new();
        for j in (0..coords.len()).step_by(2) {
            if j + 1 >= coords.len() {
                break;
            }
            segs.push(RouteSeg::Wire {
                x: scale.coord_to_mm(coords[j]),
                y: -scale.coord_to_mm(coords[j + 1]),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolution_um_10_matches_kicad() {
        let ses = r#"(session "x"
  (routes
    (resolution um 10)
    (network_out
      (net "rail_5v_b"
        (wire
          (path F.Cu 2000
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
        let scale = SesScale::parse(ses);
        assert!((scale.to_mm - 10000.0).abs() < 1e-9);
        let paths = ses_to_paths(ses, 0.15);
        let wire = paths
            .iter()
            .find(|p| matches!(p.segs[0], RouteSeg::Wire { .. }))
            .unwrap();
        if let RouteSeg::Wire { x, y, width, .. } = &wire.segs[0] {
            assert!((x - 140.7).abs() < 1e-6);
            assert!((y - 117.85).abs() < 1e-6);
            assert!((width - 0.2).abs() < 1e-6);
        } else {
            panic!("expected wire");
        }
        let via = paths
            .iter()
            .find(|p| matches!(p.segs[0], RouteSeg::Via { .. }))
            .unwrap();
        if let RouteSeg::Via { x, y, .. } = &via.segs[0] {
            assert!((x - 126.7139).abs() < 1e-4);
            assert!((y - 119.4638).abs() < 1e-4);
        }
    }
}
