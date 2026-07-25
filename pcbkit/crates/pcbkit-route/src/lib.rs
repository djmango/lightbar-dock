//! pcbkit-route: Specctra engines, SES apply, finish, repairs.

mod dsn;
mod engine;
mod finish;
mod repairs;
mod ses;

use pcbkit_core::{
    apply_routes, connectivity_report, gate, CircuitDocument, Profile, Result, RouteSeg,
};

pub use dsn::board_to_dsn;
pub use engine::{run_engine, EngineResult};
pub use finish::grid_finish;
pub use repairs::apply_repairs;
pub use ses::{paths_to_segs, ses_to_paths, RoutedPath};

#[derive(Debug)]
pub struct RouteOutcome {
    pub unconnected: usize,
    pub shorts: usize,
    pub details: Vec<String>,
    pub route_count: usize,
    pub work_dir: std::path::PathBuf,
}

/// Full pipeline: clear → engine → repairs → finish → apply → gate.
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
        work_dir: std::path::PathBuf::new(),
    })
}
