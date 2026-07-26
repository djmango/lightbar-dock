//! Gate KiCad DRC JSON reports (Rust only — no Python).

use crate::report::CheckItem;
use pcbkit_core::Result;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Warning types that are never treated as fatal copper errors even if
/// KiCad marks them severity=error.
const WARNING_OK: &[&str] = &[
    "silk_over_copper",
    "silk_edge_clearance",
    "lib_footprint_mismatch",
    "lib_footprint_issues",
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
    /// Cap counts of specific violation types (any severity).
    /// Example: `silk_edge_clearance=0`, `lib_footprint_issues=0`.
    pub max_by_type: HashMap<String, usize>,
}

impl Default for DrcGateSpec {
    fn default() -> Self {
        Self {
            max_unconnected: 0,
            max_fatal_errors: 0,
            max_by_type: HashMap::new(),
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

    let mut type_counts: HashMap<&str, usize> = HashMap::new();
    for v in &report.violations {
        *type_counts.entry(v.r#type.as_str()).or_default() += 1;
    }

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

    let mut type_ok = true;
    for (ty, max) in &spec.max_by_type {
        let count = type_counts.get(ty.as_str()).copied().unwrap_or(0);
        let passed = count <= *max;
        type_ok &= passed;
        items.push(CheckItem {
            name: format!("drc type {ty}"),
            passed,
            details: format!("{count} (max {max})"),
        });
    }

    let passed =
        unconnected <= spec.max_unconnected && fatal.len() <= spec.max_fatal_errors && type_ok;
    Ok((passed, items))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn max_by_type_fails_on_silk_edge() {
        let path = std::env::temp_dir().join("pcbkit-drc-gate-test.json");
        {
            let mut f = std::fs::File::create(&path).unwrap();
            write!(
                f,
                r#"{{
              "unconnected_items": [],
              "violations": [
                {{"severity":"warning","type":"silk_edge_clearance","description":"edge"}},
                {{"severity":"warning","type":"silk_over_copper","description":"pad"}}
              ]
            }}"#
            )
            .unwrap();
        }
        let mut spec = DrcGateSpec::default();
        spec.max_by_type
            .insert("silk_edge_clearance".into(), 0);
        let (passed, items) = evaluate_drc_json(&path, &spec).unwrap();
        let _ = std::fs::remove_file(&path);
        assert!(!passed);
        assert!(items
            .iter()
            .any(|i| i.name.contains("silk_edge_clearance") && !i.passed));
    }
}
