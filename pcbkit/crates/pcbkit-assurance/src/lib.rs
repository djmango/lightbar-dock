//! Programmatic design-assurance gates (fab / footprint / power / bring-up / artifacts).

mod artifacts;
mod bringup;
mod drc;
mod fab;
mod footprints;
mod power;
mod report;

pub use artifacts::{verify_manifest, ArtifactManifest};
pub use bringup::{load_bringup, BringupChecklist};
pub use drc::{evaluate_drc_json, DrcGateSpec};
pub use fab::{check_kicad_fab_rules, FabRules};
pub use footprints::check_golden_footprints;
pub use power::check_power_and_bom;
pub use report::{CheckItem, CheckReport};

use pcbkit_core::{load_circuit, Result};
use std::path::Path;

/// Run the full assurance suite against circuit-json + optional KiCad PCB + manifests.
pub fn run_assurance(
    circuit_path: &Path,
    golden_footprints: Option<&Path>,
    fab_rules: &FabRules,
    kicad_pcb: Option<&Path>,
    artifact_manifest: Option<&Path>,
    bringup_path: Option<&Path>,
) -> Result<CheckReport> {
    let mut report = CheckReport::default();
    let doc = load_circuit(circuit_path)?;

    report.extend(check_power_and_bom(&doc)?);

    if let Some(g) = golden_footprints {
        report.extend(check_golden_footprints(&doc, g)?);
    } else {
        report.push(CheckItem::fail(
            "golden footprints path",
            "not provided",
        ));
    }

    if let Some(pcb) = kicad_pcb {
        report.extend(check_kicad_fab_rules(pcb, fab_rules)?);
    } else {
        // Still check circuit-json vias as a weaker gate.
        report.extend(fab::check_circuit_via_rules(&doc, fab_rules));
    }

    if let Some(m) = artifact_manifest {
        report.extend(verify_manifest(m)?);
    }

    if let Some(b) = bringup_path {
        let checklist = load_bringup(b)?;
        report.extend(checklist.validate());
    }

    Ok(report)
}
