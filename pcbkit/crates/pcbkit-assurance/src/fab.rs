use crate::report::CheckItem;
use pcbkit_core::{CircuitDocument, Result};
use serde::Deserialize;
use std::path::Path;

/// JLCPCB-oriented 2-layer fab defaults (mm). Override via TOML profile.
#[derive(Debug, Clone, Deserialize)]
pub struct FabRules {
    #[serde(default = "d_via_hole")]
    pub min_via_hole_mm: f64,
    #[serde(default = "d_via_pad")]
    pub min_via_pad_mm: f64,
    #[serde(default = "d_trace")]
    pub min_trace_mm: f64,
    #[serde(default = "d_clearance")]
    pub min_clearance_mm: f64,
    #[serde(default = "d_annular")]
    pub min_annular_ring_mm: f64,
}

impl Default for FabRules {
    fn default() -> Self {
        Self {
            min_via_hole_mm: d_via_hole(),
            min_via_pad_mm: d_via_pad(),
            min_trace_mm: d_trace(),
            min_clearance_mm: d_clearance(),
            min_annular_ring_mm: d_annular(),
        }
    }
}

fn d_via_hole() -> f64 {
    0.3
}
fn d_via_pad() -> f64 {
    0.6
}
fn d_trace() -> f64 {
    0.15
}
fn d_clearance() -> f64 {
    0.15
}
fn d_annular() -> f64 {
    0.15
}

impl FabRules {
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)?;
        Ok(toml::from_str(&text)?)
    }
}

pub fn check_circuit_via_rules(doc: &CircuitDocument, rules: &FabRules) -> Vec<CheckItem> {
    let mut illegal = 0usize;
    let mut total = 0usize;
    for e in &doc.elements {
        if e.get("type").and_then(|t| t.as_str()) != Some("pcb_via") {
            continue;
        }
        total += 1;
        let hole = e
            .get("hole_diameter")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let outer = e
            .get("outer_diameter")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if hole + 1e-9 < rules.min_via_hole_mm || outer + 1e-9 < rules.min_via_pad_mm {
            illegal += 1;
        }
    }
    vec![CheckItem {
        name: format!(
            "circuit-json vias >= {}/{} mm",
            rules.min_via_pad_mm, rules.min_via_hole_mm
        ),
        passed: illegal == 0,
        details: format!("total={total} illegal={illegal}"),
    }]
}

/// Scan KiCad PCB text for via/track minimums (no regex lookaround — Rust regex crate).
pub fn check_kicad_fab_rules(pcb_path: &Path, rules: &FabRules) -> Result<Vec<CheckItem>> {
    let text = std::fs::read_to_string(pcb_path)?;
    let mut items = Vec::new();

    let mut via_total = 0usize;
    let mut via_illegal = 0usize;
    let mut annular_fail = 0usize;

    // Walk each `(via` block until its balancing close at indent depth roughly.
    for block in split_sexpr_blocks(&text, "via") {
        let size = find_num_after(&block, "(size ");
        let drill = find_num_after(&block, "(drill ");
        let (Some(size), Some(drill)) = (size, drill) else {
            continue;
        };
        via_total += 1;
        if drill + 1e-9 < rules.min_via_hole_mm || size + 1e-9 < rules.min_via_pad_mm {
            via_illegal += 1;
        }
        let annular = (size - drill) / 2.0;
        if annular + 1e-9 < rules.min_annular_ring_mm {
            annular_fail += 1;
        }
    }

    items.push(CheckItem {
        name: format!(
            "kicad vias >= {}/{} mm",
            rules.min_via_pad_mm, rules.min_via_hole_mm
        ),
        passed: via_total > 0 && via_illegal == 0,
        details: format!("total={via_total} illegal={via_illegal}"),
    });
    if via_total > 0 {
        items.push(CheckItem {
            name: format!(
                "kicad via annular ring >= {} mm",
                rules.min_annular_ring_mm
            ),
            passed: annular_fail == 0,
            details: format!("failing={annular_fail}"),
        });
    }

    let mut seg_total = 0usize;
    let mut seg_thin = 0usize;
    let mut min_w = f64::MAX;
    for block in split_sexpr_blocks(&text, "segment") {
        let Some(w) = find_num_after(&block, "(width ") else {
            continue;
        };
        seg_total += 1;
        min_w = min_w.min(w);
        if w + 1e-9 < rules.min_trace_mm {
            seg_thin += 1;
        }
    }
    items.push(CheckItem {
        name: format!("kicad track width >= {} mm", rules.min_trace_mm),
        passed: seg_total > 0 && seg_thin == 0,
        details: format!(
            "segments={seg_total} thin={seg_thin} min_width={}",
            if min_w == f64::MAX { 0.0 } else { min_w }
        ),
    });

    items.push(CheckItem::pass(
        "fab rules loaded",
        format!(
            "clearance_target={}mm (enforced by KiCad DRC + pcbkit drc-gate)",
            rules.min_clearance_mm
        ),
    ));

    Ok(items)
}

fn split_sexpr_blocks<'a>(text: &'a str, head: &str) -> Vec<&'a str> {
    let needle = format!("({head}");
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find(&needle) {
        let start = search_from + rel;
        let mut depth = 0i32;
        let mut end = start;
        for (i, &b) in bytes[start..].iter().enumerate() {
            if b == b'(' {
                depth += 1;
            } else if b == b')' {
                depth -= 1;
                if depth == 0 {
                    end = start + i + 1;
                    break;
                }
            }
        }
        if end > start {
            out.push(&text[start..end]);
            search_from = end;
        } else {
            break;
        }
    }
    out
}

fn find_num_after(block: &str, key: &str) -> Option<f64> {
    let i = block.find(key)?;
    let rest = &block[i + key.len()..];
    let num: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    num.parse().ok()
}
