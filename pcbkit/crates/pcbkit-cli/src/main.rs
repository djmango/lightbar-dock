use clap::{Parser, Subcommand};
use pcbkit_assurance::{
    evaluate_drc_json, run_assurance, verify_manifest, DrcGateSpec, FabRules,
};
use pcbkit_core::{load_circuit, save_circuit, Profile};
use pcbkit_route::{
    apply_ses_board, attach_3d_to_pcb_files, check_document, route_document, route_kicad_board,
};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    name = "pcbkit",
    version,
    about = "Rust-first PCB routing + assurance toolkit (circuit-json IR)"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Autoroute a circuit-json board using a TOML profile (no env config).
    Route {
        #[arg(long, short = 'i')]
        input: PathBuf,
        #[arg(long, short = 'p')]
        profile: PathBuf,
        #[arg(long, short = 'o')]
        out: Option<PathBuf>,
        #[arg(long)]
        allow_fail: bool,
    },
    /// Full Specctra stack on a KiCad board: DSN → engine → SES → PCB (no Python).
    RouteBoard {
        /// Unrouted (or to-be-stripped) `.kicad_pcb`
        #[arg(long)]
        pcb: PathBuf,
        /// KiCad-exported Specctra DSN matching the PCB
        #[arg(long)]
        dsn: PathBuf,
        #[arg(long, short = 'p')]
        profile: PathBuf,
        #[arg(long, short = 'o')]
        out: PathBuf,
        /// Inject empty GND zone outlines when no `--zones-from` is given
        #[arg(long, default_value_t = true)]
        gnd_zones: bool,
        /// Copy filled `(zone …)` sexps from this KiCad PCB (e.g. prior green board)
        #[arg(long)]
        zones_from: Option<PathBuf>,
        /// Skip the engine and apply an existing SES instead
        #[arg(long)]
        ses: Option<PathBuf>,
    },
    /// Connectivity check only
    Check {
        #[arg(long, short = 'i')]
        input: PathBuf,
        #[arg(long, default_value_t = 0.15)]
        clearance_mm: f64,
    },
    /// Fab / footprint / power / bring-up / artifact pinning gates
    Assure {
        #[arg(long, short = 'i')]
        input: PathBuf,
        #[arg(long, default_value = "pcbkit/profiles/fab-jlcpcb-2layer.toml")]
        fab: PathBuf,
        #[arg(long, default_value = "circuit/assurance/golden-footprints.json")]
        golden: PathBuf,
        #[arg(long)]
        pcb: Option<PathBuf>,
        #[arg(long, default_value = "ci/artifacts/manifest.toml")]
        manifest: PathBuf,
        #[arg(long, default_value = "circuit/assurance/bringup.toml")]
        bringup: PathBuf,
        #[arg(long)]
        skip_manifest: bool,
        #[arg(long)]
        skip_bringup: bool,
    },
    /// Gate a KiCad DRC JSON report (Rust only — no Python).
    DrcGate {
        /// Path to kicad-cli DRC JSON
        #[arg(long, short = 'j')]
        json: PathBuf,
        #[arg(long, default_value_t = 0)]
        max_unconnected: usize,
        #[arg(long, default_value_t = 0)]
        max_fatal_errors: usize,
    },
    /// Verify pinned artifact sha256 manifest.
    Pin {
        #[arg(long, default_value = "ci/artifacts/manifest.toml")]
        manifest: PathBuf,
    },
    /// Attach STEP 3D models from tscircuit modelcdn (EasyEDA/jscad) onto footprints.
    #[command(name = "attach-3d")]
    Attach3d {
        #[arg(long)]
        pcb: PathBuf,
        #[arg(long, short = 'o')]
        out: Option<PathBuf>,
        /// Project STEP overrides (`{LCSC}.step`). Default: `circuit/3dmodels` if present.
        #[arg(long, default_value = "circuit/3dmodels")]
        models_dir: PathBuf,
        /// Optional TOML map: C12345 = "${KIPRJMOD}/3dmodels/custom.step"
        #[arg(long)]
        map: Option<PathBuf>,
        /// Exit non-zero if any LCSC on the board has no STEP
        #[arg(long, default_value_t = false)]
        strict: bool,
    },
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => code,
        Err(e) => {
            eprintln!("pcbkit error: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<ExitCode, Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Route {
            input,
            profile,
            out,
            allow_fail,
        } => {
            let profile = Profile::load(&profile)?;
            let mut doc = load_circuit(&input)?;
            match route_document(&mut doc, &profile) {
                Ok(outcome) => {
                    let out_path = out.unwrap_or(input);
                    save_circuit(&doc, &out_path)?;
                    println!(
                        "pcbkit route OK: {} segs, unconnected={}, shorts={}",
                        outcome.route_count, outcome.unconnected, outcome.shorts
                    );
                    for d in &outcome.details {
                        println!("  {d}");
                    }
                    println!("work: {}", outcome.work_dir.display());
                    Ok(ExitCode::SUCCESS)
                }
                Err(e) => {
                    let out_path = out.as_ref().unwrap_or(&input);
                    let _ = save_circuit(&doc, out_path);
                    eprintln!("pcbkit route failed: {e}");
                    if allow_fail {
                        Ok(ExitCode::SUCCESS)
                    } else {
                        Ok(ExitCode::FAILURE)
                    }
                }
            }
        }
        Cmd::RouteBoard {
            pcb,
            dsn,
            profile,
            out,
            gnd_zones,
            zones_from,
            ses,
        } => {
            let profile = Profile::load(&profile)?;
            let zones = zones_from.as_deref();
            let outcome = if let Some(ses) = ses {
                apply_ses_board(&pcb, &ses, &out, &profile, gnd_zones, zones)?
            } else {
                route_kicad_board(&pcb, &dsn, &out, &profile, gnd_zones, zones)?
            };
            println!(
                "pcbkit route-board OK: {} segments, {} vias → {}",
                outcome.segments,
                outcome.vias,
                outcome.out_pcb.display()
            );
            println!("ses: {}", outcome.ses_path.display());
            println!("work: {}", outcome.work_dir.display());
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Check {
            input,
            clearance_mm,
        } => {
            let doc = load_circuit(&input)?;
            let outcome = check_document(&doc, clearance_mm)?;
            println!(
                "unconnected={} shorts={} route_points={}",
                outcome.unconnected, outcome.shorts, outcome.route_count
            );
            for d in &outcome.details {
                println!("  {d}");
            }
            if outcome.unconnected == 0 && outcome.shorts == 0 {
                Ok(ExitCode::SUCCESS)
            } else {
                Ok(ExitCode::FAILURE)
            }
        }
        Cmd::Assure {
            input,
            fab,
            golden,
            pcb,
            manifest,
            bringup,
            skip_manifest,
            skip_bringup,
        } => {
            let rules = if fab.exists() {
                FabRules::load(&fab)?
            } else {
                FabRules::default()
            };
            let report = run_assurance(
                &input,
                if golden.exists() {
                    Some(golden.as_path())
                } else {
                    None
                },
                &rules,
                pcb.as_deref(),
                if skip_manifest || !manifest.exists() {
                    None
                } else {
                    Some(manifest.as_path())
                },
                if skip_bringup || !bringup.exists() {
                    None
                } else {
                    Some(bringup.as_path())
                },
            )?;
            report.print();
            if report.passed() {
                println!("pcbkit assure OK ({} checks)", report.checks.len());
                Ok(ExitCode::SUCCESS)
            } else {
                let failed = report.checks.iter().filter(|c| !c.passed).count();
                eprintln!("pcbkit assure FAILED ({failed} checks)");
                Ok(ExitCode::FAILURE)
            }
        }
        Cmd::DrcGate {
            json,
            max_unconnected,
            max_fatal_errors,
        } => {
            let spec = DrcGateSpec {
                max_unconnected,
                max_fatal_errors,
            };
            let (passed, items) = evaluate_drc_json(&json, &spec)?;
            for c in &items {
                println!(
                    "{} {}{}",
                    if c.passed { "PASS" } else { "FAIL" },
                    c.name,
                    if c.details.is_empty() {
                        String::new()
                    } else {
                        format!(" — {}", c.details)
                    }
                );
            }
            if passed {
                println!("pcbkit drc-gate OK");
                Ok(ExitCode::SUCCESS)
            } else {
                eprintln!("pcbkit drc-gate FAILED");
                Ok(ExitCode::FAILURE)
            }
        }
        Cmd::Pin { manifest } => {
            let items = verify_manifest(&manifest)?;
            let mut ok = true;
            for c in &items {
                println!(
                    "{} {}{}",
                    if c.passed { "PASS" } else { "FAIL" },
                    c.name,
                    if c.details.is_empty() {
                        String::new()
                    } else {
                        format!(" — {}", c.details)
                    }
                );
                ok &= c.passed;
            }
            if ok {
                println!("pcbkit pin OK");
                Ok(ExitCode::SUCCESS)
            } else {
                eprintln!("pcbkit pin FAILED");
                Ok(ExitCode::FAILURE)
            }
        }
        Cmd::Attach3d {
            pcb,
            out,
            models_dir,
            map,
            strict,
        } => {
            let out_path = out.unwrap_or_else(|| pcb.clone());
            let models = if models_dir.is_dir() {
                Some(models_dir.as_path())
            } else {
                None
            };
            let report = attach_3d_to_pcb_files(&pcb, &out_path, map.as_deref(), models)?;
            println!(
                "pcbkit attach-3d: footprints={} attached={} replaced={} downloaded={} project={} no_lcsc={} missing={}",
                report.footprints,
                report.attached,
                report.already_had,
                report.downloaded,
                report.from_project,
                report.skipped_no_lcsc,
                report.missing.len()
            );
            for m in &report.missing {
                println!("  missing STEP: {m}");
            }
            println!(
                "models: {}/3dmodels/",
                out_path.parent().unwrap_or_else(|| Path::new(".")).display()
            );
            println!("→ {}", out_path.display());
            if strict && !report.missing.is_empty() {
                Ok(ExitCode::FAILURE)
            } else {
                Ok(ExitCode::SUCCESS)
            }
        }
    }
}
