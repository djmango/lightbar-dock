use crate::report::CheckItem;
use pcbkit_core::Result;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct ArtifactManifest {
    pub artifacts: Vec<ArtifactPin>,
}

#[derive(Debug, Deserialize)]
pub struct ArtifactPin {
    pub path: PathBuf,
    pub sha256: String,
    #[serde(default)]
    pub role: String,
}

pub fn verify_manifest(manifest_path: &Path) -> Result<Vec<CheckItem>> {
    let text = std::fs::read_to_string(manifest_path)?;
    let manifest: ArtifactManifest = toml::from_str(&text)?;
    let base = manifest_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    // Also try repo root (cwd) for paths like ci/artifacts/...
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    let mut items = Vec::new();
    if manifest.artifacts.is_empty() {
        items.push(CheckItem::fail(
            "artifact manifest",
            "no artifacts listed",
        ));
        return Ok(items);
    }

    for art in &manifest.artifacts {
        let candidates = [cwd.join(&art.path), base.join(&art.path), art.path.clone()];
        let path = candidates.into_iter().find(|p| p.exists());
        let Some(path) = path else {
            items.push(CheckItem::fail(
                format!("artifact {}", art.path.display()),
                "file missing",
            ));
            continue;
        };
        let bytes = std::fs::read(&path)?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let got = hex::encode(hasher.finalize());
        let expect = art.sha256.to_ascii_lowercase();
        let ok = got == expect;
        items.push(CheckItem {
            name: format!(
                "artifact pin {} ({})",
                art.path.display(),
                if art.role.is_empty() {
                    "unspecified"
                } else {
                    art.role.as_str()
                }
            ),
            passed: ok,
            details: if ok {
                format!("sha256={got}")
            } else {
                format!("expected={expect} got={got}")
            },
        });
    }
    Ok(items)
}
