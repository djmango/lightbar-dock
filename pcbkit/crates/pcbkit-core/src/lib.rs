//! pcbkit-core: circuit-json board model, profiles, connectivity gate.

mod circuit;
mod connectivity;
mod profile;

pub use circuit::{
    apply_routes, load_circuit, save_circuit, Board, CircuitDocument, Pad, Point, RouteSeg,
    Via, LAYER_BOTTOM, LAYER_TOP,
};
pub use connectivity::{connectivity_report, ConnectivityReport};
pub use profile::{EngineKind, GateSpec, Profile, RepairSpec};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("toml: {0}")]
    Toml(#[from] toml::de::Error),
    #[error("{0}")]
    Msg(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// Evaluate gate against a connectivity report. Returns Ok(()) if pass.
pub fn gate(report: &ConnectivityReport, spec: &GateSpec) -> Result<()> {
    let mut fails = Vec::new();
    if report.unconnected > spec.unconnected {
        fails.push(format!(
            "unconnected {} > {}",
            report.unconnected, spec.unconnected
        ));
    }
    if report.shorts > spec.shorts {
        fails.push(format!("shorts {} > {}", report.shorts, spec.shorts));
    }
    if fails.is_empty() {
        Ok(())
    } else {
        Err(Error::Msg(format!("gate failed: {}", fails.join("; "))))
    }
}
