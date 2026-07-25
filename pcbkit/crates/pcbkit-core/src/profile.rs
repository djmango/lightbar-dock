use crate::Result;
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineKind {
    Topola,
    Freerouting,
}

impl Default for EngineKind {
    fn default() -> Self {
        Self::Topola
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct GateSpec {
    #[serde(default)]
    pub unconnected: usize,
    #[serde(default)]
    pub shorts: usize,
}

impl Default for GateSpec {
    fn default() -> Self {
        Self {
            unconnected: 0,
            shorts: 0,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RepairSpec {
    /// Bridge USB-C flip pads for a net with vias offset from the pad column.
    UsbCFlipPads {
        component: String,
        net: String,
        via_offset_mm: f64,
    },
}

#[derive(Debug, Clone, Deserialize)]
pub struct Profile {
    /// Absolute or repo-relative path to Topola binary.
    #[serde(default = "default_topola_bin")]
    pub topola_bin: PathBuf,
    /// Absolute or repo-relative path to Freerouting JAR (optional).
    #[serde(default)]
    pub freerouting_jar: Option<PathBuf>,
    /// Absolute or repo-relative path to Java binary for Freerouting.
    #[serde(default = "default_java_bin")]
    pub java_bin: PathBuf,

    #[serde(default)]
    pub engine: EngineKind,

    /// Extra CLI args for Topola (no shell env).
    #[serde(default = "default_topola_args")]
    pub topola_args: Vec<String>,

    /// Freerouting max passes.
    #[serde(default = "default_freerouting_passes")]
    pub freerouting_passes: u32,

    #[serde(default = "default_trace_width")]
    pub trace_width_mm: f64,
    #[serde(default = "default_via_diameter")]
    pub via_diameter_mm: f64,
    #[serde(default = "default_via_drill")]
    pub via_drill_mm: f64,
    #[serde(default = "default_clearance")]
    pub clearance_mm: f64,

    /// Nets skipped by the autorouter (still may be poured later).
    #[serde(default = "default_skip_nets")]
    pub skip_nets: Vec<String>,

    #[serde(default)]
    pub repairs: Vec<RepairSpec>,

    #[serde(default)]
    pub gate: GateSpec,

    /// Run grid finish after the bulk engine.
    #[serde(default = "default_true")]
    pub finish: bool,

    #[serde(default = "default_finish_grid")]
    pub finish_grid_mm: f64,
}

fn default_topola_bin() -> PathBuf {
    PathBuf::from("third_party/topola/target/release/topola")
}
fn default_java_bin() -> PathBuf {
    PathBuf::from("java")
}
fn default_topola_args() -> Vec<String> {
    vec![
        "--multilayer".into(),
        "--timeout-progress-bonus".into(),
        "0".into(),
        "--wall-timeout".into(),
        "600".into(),
    ]
}
fn default_freerouting_passes() -> u32 {
    50
}
fn default_trace_width() -> f64 {
    0.15
}
fn default_via_diameter() -> f64 {
    0.6
}
fn default_via_drill() -> f64 {
    0.3
}
fn default_clearance() -> f64 {
    0.15
}
fn default_skip_nets() -> Vec<String> {
    vec!["GND".into(), "gnd".into()]
}
fn default_true() -> bool {
    true
}
fn default_finish_grid() -> f64 {
    0.1
}

impl Profile {
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let mut p: Profile = toml::from_str(&text)?;
        // Canonicalize so walking parents works even when the profile arg is relative.
        let abs = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(path)
        };
        let base = abs
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        p.topola_bin = resolve_path(&base, &p.topola_bin);
        p.java_bin = resolve_path(&base, &p.java_bin);
        if let Some(jar) = p.freerouting_jar.take() {
            p.freerouting_jar = Some(resolve_path(&base, &jar));
        }
        Ok(p)
    }
}

fn resolve_path(base: &Path, p: &Path) -> PathBuf {
    if p.is_absolute() {
        return p.to_path_buf();
    }
    // Prefer path relative to cwd (repo root from npm), then walk up from profile dir.
    let from_cwd = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(p);
    if from_cwd.exists() {
        return from_cwd;
    }
    let from_base = base.join(p);
    if from_base.exists() {
        return from_base;
    }
    let mut dir = base.to_path_buf();
    for _ in 0..8 {
        let candidate = dir.join(p);
        if candidate.exists() {
            return candidate;
        }
        if !dir.pop() {
            break;
        }
    }
    from_cwd
}
