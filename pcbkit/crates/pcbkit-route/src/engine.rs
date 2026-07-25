use crate::dsn::board_to_dsn;
use crate::ses::{ses_to_paths, RoutedPath};
use pcbkit_core::{Board, EngineKind, Error, Profile, Result};
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct EngineResult {
    pub paths: Vec<RoutedPath>,
    pub work_dir: PathBuf,
}

/// Run the configured autorouter engine; return routes in board coordinates (mm).
pub fn run_engine(board: &Board, profile: &Profile) -> Result<EngineResult> {
    let persist = PathBuf::from("target/pcbkit-work");
    std::fs::create_dir_all(&persist)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let work_dir = persist.join(format!("run-{stamp}"));
    std::fs::create_dir_all(&work_dir)?;

    let dsn = board_to_dsn(board, profile);
    let dsn_path = work_dir.join("board.dsn");
    let ses_path = work_dir.join("board.ses");
    std::fs::write(&dsn_path, &dsn)?;

    match profile.engine {
        EngineKind::Topola => run_topola(profile, &dsn_path, &ses_path)?,
        EngineKind::Freerouting => run_freerouting(profile, &dsn_path, &ses_path)?,
    }

    if !ses_path.exists() {
        return Err(Error::Msg(format!(
            "engine produced no SES at {}",
            ses_path.display()
        )));
    }
    let ses_text = std::fs::read_to_string(&ses_path)?;
    let paths = ses_to_paths(&ses_text, profile.trace_width_mm);
    Ok(EngineResult { paths, work_dir })
}

fn run_topola(profile: &Profile, dsn: &Path, ses: &Path) -> Result<()> {
    if !profile.topola_bin.exists() {
        return Err(Error::Msg(format!(
            "topola binary not found at {} (set topola_bin in profile)",
            profile.topola_bin.display()
        )));
    }
    let mut cmd = Command::new(&profile.topola_bin);
    cmd.arg(dsn).arg("-o").arg(ses);
    for a in &profile.topola_args {
        cmd.arg(a);
    }
    let status = cmd.status().map_err(|e| {
        Error::Msg(format!(
            "failed to spawn topola ({}): {e}",
            profile.topola_bin.display()
        ))
    })?;
    if !status.success() && !ses.exists() {
        return Err(Error::Msg(format!(
            "topola exited with status {status} and produced no SES"
        )));
    }
    Ok(())
}

fn run_freerouting(profile: &Profile, dsn: &Path, ses: &Path) -> Result<()> {
    let jar = profile
        .freerouting_jar
        .as_ref()
        .ok_or_else(|| Error::Msg("freerouting_jar not set in profile".into()))?;
    if !jar.exists() {
        return Err(Error::Msg(format!(
            "freerouting jar not found at {}",
            jar.display()
        )));
    }
    let status = Command::new(&profile.java_bin)
        .arg("-jar")
        .arg(jar)
        .arg("-de")
        .arg(dsn)
        .arg("-do")
        .arg(ses)
        .arg("-mp")
        .arg(profile.freerouting_passes.to_string())
        .arg("-dct")
        .arg("0")
        .status()
        .map_err(|e| Error::Msg(format!("failed to spawn java/freerouting: {e}")))?;
    if !status.success() && !ses.exists() {
        return Err(Error::Msg(format!(
            "freerouting exited with status {status} and produced no SES"
        )));
    }
    Ok(())
}
