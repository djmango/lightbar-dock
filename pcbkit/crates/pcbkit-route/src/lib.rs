//! pcbkit-route: Specctra engines, SES apply, finish, repairs.

mod dsn;
mod engine;
mod finish;
mod kicad_3d;
mod kicad_pcb;
mod kicad_repairs;
mod repairs;
mod ses;

use pcbkit_core::{
    apply_routes, connectivity_report, gate, CircuitDocument, Profile, Result, RouteSeg,
};
use std::path::{Path, PathBuf};

pub use dsn::board_to_dsn;
pub use engine::{run_engine, run_engine_on_dsn, run_engine_on_dsn_text, EngineResult};
pub use finish::grid_finish;
pub use kicad_3d::{
    attach_3d_to_pcb_files, attach_3d_to_pcb_text, footprinter_from_lib_id, load_model_map,
    resolve_model, Attach3dReport, ModelSpec,
};
pub use kicad_pcb::{
    apply_ses_to_pcb_files, apply_ses_to_pcb_text, extract_zones, ses_to_kicad_copper,
    strip_copper_routes, strip_zones,
};
pub use repairs::apply_repairs;
pub use ses::{paths_to_segs, ses_to_paths, RoutedPath, SesScale};

#[derive(Debug)]
pub struct RouteOutcome {
    pub unconnected: usize,
    pub shorts: usize,
    pub details: Vec<String>,
    pub route_count: usize,
    pub work_dir: PathBuf,
}

#[derive(Debug)]
pub struct BoardRouteOutcome {
    pub segments: usize,
    pub vias: usize,
    pub work_dir: PathBuf,
    pub out_pcb: PathBuf,
    pub ses_path: PathBuf,
}

/// Full circuit-json pipeline: clear → engine → repairs → finish → apply → gate.
pub fn route_document(
    doc: &mut CircuitDocument,
    profile: &Profile,
) -> Result<RouteOutcome> {
    doc.clear_routes();
    let board = doc.board()?;

    let EngineResult {
        mut paths,
        work_dir,
    } = run_engine(&board, profile)?;

    let repair_segs = apply_repairs(&board, &profile.repairs);
    paths.extend(repair_paths(&repair_segs));

    let flat = paths_to_segs(&paths);
    let finish_segs = grid_finish(&board, &flat, profile);
    paths.extend(repair_paths(&finish_segs));

    let path_vecs: Vec<Vec<RouteSeg>> = paths.into_iter().map(|p| p.segs).collect();
    let route_count: usize = path_vecs.iter().map(|p| p.len()).sum();

    apply_routes(
        doc,
        &path_vecs,
        profile.via_diameter_mm,
        profile.via_drill_mm,
    )?;

    let board_after = doc.board()?;
    let report = connectivity_report(&board_after, profile.clearance_mm * 0.25);
    gate(&report, &profile.gate)?;

    Ok(RouteOutcome {
        unconnected: report.unconnected,
        shorts: report.shorts,
        details: report.details,
        route_count,
        work_dir,
    })
}

/// Full KiCad board pipeline: Freerouting/Topola on a Specctra DSN → SES → PCB.
///
/// `pcb` should be an unrouted (or copper-stripped) KiCad board whose nets match
/// the DSN. Existing top-level segments/vias/zones are replaced. Pass
/// `zones_from` to copy filled GND zones from a reference board (or leave
/// `add_empty_gnd_zones` to inject unfilled outlines for later KiCad fill).
pub fn route_kicad_board(
    pcb: &Path,
    dsn: &Path,
    out: &Path,
    profile: &Profile,
    add_empty_gnd_zones: bool,
    zones_from: Option<&Path>,
) -> Result<BoardRouteOutcome> {
    if !pcb.exists() {
        return Err(pcbkit_core::Error::Msg(format!(
            "PCB not found at {}",
            pcb.display()
        )));
    }
    let EngineResult { work_dir, .. } = run_engine_on_dsn(dsn, profile)?;
    let ses_path = work_dir.join("board.ses");
    // USB-C flip pads are bridged here (after the engine), not pre-wired into
    // the DSN — protected pre-wires block Freerouting's escape channel from
    // USB1 and leave more incompletes. See kicad_repairs module docs.
    let (segments, vias) = apply_ses_to_pcb_files(
        pcb,
        &ses_path,
        out,
        profile,
        add_empty_gnd_zones,
        zones_from,
    )?;
    Ok(BoardRouteOutcome {
        segments,
        vias,
        work_dir,
        out_pcb: out.to_path_buf(),
        ses_path,
    })
}

/// Apply an existing SES onto a KiCad PCB (no engine run).
pub fn apply_ses_board(
    pcb: &Path,
    ses: &Path,
    out: &Path,
    profile: &Profile,
    add_empty_gnd_zones: bool,
    zones_from: Option<&Path>,
) -> Result<BoardRouteOutcome> {
    let (segments, vias) = apply_ses_to_pcb_files(
        pcb,
        ses,
        out,
        profile,
        add_empty_gnd_zones,
        zones_from,
    )?;
    Ok(BoardRouteOutcome {
        segments,
        vias,
        work_dir: ses
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf(),
        out_pcb: out.to_path_buf(),
        ses_path: ses.to_path_buf(),
    })
}

fn repair_paths(segs: &[RouteSeg]) -> Vec<RoutedPath> {
    if segs.is_empty() {
        return vec![];
    }
    // USB repair emits per-pad stubs then a bottom bridge — keep as separate
    // short paths whenever net or layer jumps discontinuously is hard; emit
    // one path per seg-pair for wires (2 points) and singleton vias.
    let mut out = Vec::new();
    let mut i = 0;
    while i < segs.len() {
        match &segs[i] {
            RouteSeg::Via { net, .. } => {
                out.push(RoutedPath {
                    net: net.clone(),
                    segs: vec![segs[i].clone()],
                });
                i += 1;
            }
            RouteSeg::Wire { net, .. } => {
                if i + 1 < segs.len() {
                    if let RouteSeg::Wire { net: n2, .. } = &segs[i + 1] {
                        if n2 == net {
                            out.push(RoutedPath {
                                net: net.clone(),
                                segs: vec![segs[i].clone(), segs[i + 1].clone()],
                            });
                            i += 2;
                            continue;
                        }
                    }
                }
                out.push(RoutedPath {
                    net: net.clone(),
                    segs: vec![segs[i].clone()],
                });
                i += 1;
            }
        }
    }
    out
}

/// Dry connectivity check without routing.
pub fn check_document(doc: &CircuitDocument, clearance_mm: f64) -> Result<RouteOutcome> {
    let board = doc.board()?;
    let report = connectivity_report(&board, clearance_mm * 0.25);
    let route_count: usize = board.traces.iter().map(|t| t.len()).sum();
    Ok(RouteOutcome {
        unconnected: report.unconnected,
        shorts: report.shorts,
        details: report.details,
        route_count,
        work_dir: PathBuf::new(),
    })
}
