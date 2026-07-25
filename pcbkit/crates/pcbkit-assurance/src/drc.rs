//! Gate KiCad DRC JSON reports (Rust only — no Python).

use crate::report::CheckItem;
use pcbkit_core::Result;
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;

const WARNING_OK: &[&str] = &[
    "silk_over_copper",
    "silk_edge_clearance",
    "lib_footprint_mismatch",
    "track_dangling",
];

const FATAL_ERROR_TYPES: &[&str] = &[
    "unconnected_items",
    "shorting_items",
    "clearance",
    "hole_clearance",
    "copper_edge_clearance",
    "tracks_crossing",
    "via_dangling",
    "starved_thermal",
    "isolated_copper",
];

#[derive(Debug, Deserialize)]
struct DrcReport {
    #[serde(default)]
    unconnected_items: Vec<serde_json::Value>,
    #[serde(default)]
    violations: Vec<DrcViolation>,
}

#[derive(Debug, Deserialize)]
struct DrcViolation {
    #[serde(default)]
    severity: String,
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Clone)]
pub struct DrcGateSpec {
    pub max_unconnected: usize,
    pub max_fatal_errors: usize,
}

impl Default for DrcGateSpec {
    fn default() -> Self {
        Self {
            max_unconnected: 0,
            max_fatal_errors: 0,
        }
    }
}

/// Evaluate a KiCad DRC JSON file. Returns (passed, check items).
pub fn evaluate_drc_json(path: &Path, spec: &DrcGateSpec) -> Result<(bool, Vec<CheckItem>)> {
    let text = std::fs::read_to_string(path)?;
    let report: DrcReport = serde_json::from_str(&text)?;

    let warning_ok: HashSet<&str> = WARNING_OK.iter().copied().collect();
    let fatal_types: HashSet<&str> = FATAL_ERROR_TYPES.iter().copied().collect();

    let errors: Vec<&DrcViolation> = report
        .violations
        .iter()
        .filter(|v| v.severity == "error")
        .collect();
    let warnings = report
        .violations
        .iter()
        .filter(|v| v.severity == "warning")
        .count();

    let mut fatal: Vec<&DrcViolation> = Vec::new();
    for v in &errors {
        if warning_ok.contains(v.r#type.as_str()) {
            continue;
        }
        if fatal_types.contains(v.r#type.as_str()) || v.severity == "error" {
            // Any non-warning-ok error is fatal for V3.
            if !fatal.iter().any(|f| std::ptr::eq(*f, *v)) {
                fatal.push(*v);
            }
        }
    }

    let unconnected = report.unconnected_items.len();
    let mut items = Vec::new();
    items.push(CheckItem {
        name: "drc unconnected".into(),
        passed: unconnected <= spec.max_unconnected,
        details: format!("{unconnected} (max {})", spec.max_unconnected),
    });
    items.push(CheckItem {
        name: "drc fatal copper/layout errors".into(),
        passed: fatal.len() <= spec.max_fatal_errors,
        details: format!(
            "{} fatal / {} errors / {} warnings (max fatal {})",
            fatal.len(),
            errors.len(),
            warnings,
            spec.max_fatal_errors
        ),
    });
    for v in fatal.iter().take(20) {
        items.push(CheckItem::fail(
            format!("drc {}", v.r#type),
            v.description.chars().take(140).collect::<String>(),
        ));
    }

    let passed = unconnected <= spec.max_unconnected && fatal.len() <= spec.max_fatal_errors;
    Ok((passed, items))
}
