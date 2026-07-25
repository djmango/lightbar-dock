use crate::report::CheckItem;
use pcbkit_core::{CircuitDocument, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct GoldenFile {
    components: HashMap<String, Vec<GoldenPad>>,
}

#[derive(Debug, Deserialize)]
struct GoldenPad {
    x: f64,
    y: f64,
}

pub fn check_golden_footprints(
    doc: &CircuitDocument,
    golden_path: &Path,
) -> Result<Vec<CheckItem>> {
    let text = std::fs::read_to_string(golden_path)?;
    let golden: GoldenFile = serde_json::from_str(&text)?;

    let mut source_name: HashMap<String, String> = HashMap::new();
    let mut pcb_comp_source: HashMap<String, String> = HashMap::new();
    for e in &doc.elements {
        match e.get("type").and_then(|t| t.as_str()).unwrap_or("") {
            "source_component" => {
                if let (Some(id), Some(name)) = (
                    e.get("source_component_id").and_then(|v| v.as_str()),
                    e.get("name").and_then(|v| v.as_str()),
                ) {
                    source_name.insert(id.to_string(), name.to_string());
                }
            }
            "pcb_component" => {
                if let (Some(id), Some(sid)) = (
                    e.get("pcb_component_id").and_then(|v| v.as_str()),
                    e.get("source_component_id").and_then(|v| v.as_str()),
                ) {
                    pcb_comp_source.insert(id.to_string(), sid.to_string());
                }
            }
            _ => {}
        }
    }

    let mut name_to_pcb: HashMap<String, String> = HashMap::new();
    for (pcb_id, sid) in &pcb_comp_source {
        if let Some(name) = source_name.get(sid) {
            name_to_pcb.insert(name.clone(), pcb_id.clone());
        }
    }

    let mut items = Vec::new();
    for (name, expected) in &golden.components {
        let Some(pcb_id) = name_to_pcb.get(name) else {
            items.push(CheckItem::fail(
                format!("golden footprint {name}"),
                "component missing",
            ));
            continue;
        };
        let mut actual: Vec<(f64, f64)> = Vec::new();
        for e in &doc.elements {
            let ty = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty != "pcb_smtpad" && ty != "pcb_plated_hole" {
                continue;
            }
            if e.get("pcb_component_id").and_then(|v| v.as_str()) != Some(pcb_id.as_str())
            {
                continue;
            }
            let x = e
                .get("x")
                .and_then(|v| v.as_f64())
                .or_else(|| e.pointer("/center/x").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);
            let y = e
                .get("y")
                .and_then(|v| v.as_f64())
                .or_else(|| e.pointer("/center/y").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);
            actual.push((
                (x * 1000.0).round() / 1000.0,
                (y * 1000.0).round() / 1000.0,
            ));
        }
        actual.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        });
        let mut exp: Vec<(f64, f64)> = expected.iter().map(|p| (p.x, p.y)).collect();
        exp.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        });
        let ok = actual.len() == exp.len()
            && actual
                .iter()
                .zip(exp.iter())
                .all(|(a, e)| (a.0 - e.0).abs() < 0.05 && (a.1 - e.1).abs() < 0.05);
        items.push(if ok {
            CheckItem::pass(format!("golden footprint {name}"), format!("{} pads", actual.len()))
        } else {
            CheckItem::fail(
                format!("golden footprint {name}"),
                format!("actual={} expected={}", actual.len(), exp.len()),
            )
        });
    }
    Ok(items)
}
