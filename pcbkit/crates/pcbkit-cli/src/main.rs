use clap::{Parser, Subcommand};
use pcbkit_assurance::{
    evaluate_drc_json, run_assurance, verify_manifest, DrcGateSpec, FabRules,
};
use pcbkit_core::{load_circuit, save_circuit, Profile};
use pcbkit_route::{check_document, route_document};
use std::path::PathBuf;
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
    }
}
