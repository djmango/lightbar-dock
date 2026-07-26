//! Attach STEP 3D models onto embedded KiCad footprints.
//!
//! Sources (in order):
//! 1. Project overrides: `circuit/3dmodels/{LCSC}.step` (or `--models-dir`)
//! 2. tscircuit EasyEDA CDN: `…/easyeda_models/assets/{LCSC}.step`
//! 3. Same CDN with EasyEDA SVGNODE `?uuid=` when (2) returns 400
//! 4. Footprinter CDN: `…/jscad_models/{fp}.step`
//!
//! Downloads land next to the output PCB as `3dmodels/*.step` and are referenced
//! as `${KIPRJMOD}/3dmodels/...`.

use crate::kicad_pcb::{looks_like_top_level, skip_sexp};
use pcbkit_core::{Error, Result};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const EASYEDA_CDN: &str = "https://modelcdn.tscircuit.com/easyeda_models/assets";
const JSCAD_CDN: &str = "https://modelcdn.tscircuit.com/jscad_models";
const UA: &str = "Mozilla/5.0 (compatible; pcbkit-attach-3d/0.1; +https://github.com/djmango/lightbar-dock)";
const DEFAULT_MODELS_DIR: &str = "circuit/3dmodels";

/// One STEP model ready to inject into a footprint.
#[derive(Debug, Clone)]
pub struct ModelSpec {
    /// KiCad model path, e.g. `${KIPRJMOD}/3dmodels/C3040880.step`
    pub path: String,
    pub offset: (f64, f64, f64),
    pub scale: (f64, f64, f64),
    pub rotate: (f64, f64, f64),
}

#[derive(Debug, Default, Clone)]
pub struct Attach3dReport {
    pub footprints: usize,
    pub attached: usize,
    pub already_had: usize,
    pub skipped_no_lcsc: usize,
    pub downloaded: usize,
    pub from_project: usize,
    pub missing: Vec<String>,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .user_agent(UA)
        .build()
}

fn looks_like_step(bytes: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(32)]);
    head.contains("ISO-10303")
}

fn http_get_bytes(url: &str) -> Result<Option<Vec<u8>>> {
    let agent = agent();
    match agent.get(url).call() {
        Ok(resp) => {
            let mut buf = Vec::new();
            resp.into_reader()
                .take(80 * 1024 * 1024)
                .read_to_end(&mut buf)
                .map_err(|e| Error::Msg(format!("read {url}: {e}")))?;
            if looks_like_step(&buf) {
                Ok(Some(buf))
            } else {
                Ok(None)
            }
        }
        Err(ureq::Error::Status(code, resp)) => {
            let _ = resp;
            if code == 404 || code == 400 {
                Ok(None)
            } else {
                Err(Error::Msg(format!("GET {url} → HTTP {code}")))
            }
        }
        Err(e) => Err(Error::Msg(format!("GET {url}: {e}"))),
    }
}

fn easyeda_search_uuid(lcsc: &str) -> Result<Option<String>> {
    let agent = agent();
    let body = format!(
        "type=3&doctype%5B%5D=2&uid=0819f05c4eef4c71ace90d822a990e87&returnListStyle=classifyarr&wd={lcsc}&version=6.4.7"
    );
    let resp = agent
        .post("https://easyeda.com/api/components/search")
        .set("content-type", "application/x-www-form-urlencoded; charset=UTF-8")
        .set("x-requested-with", "XMLHttpRequest")
        .set("origin", "https://easyeda.com")
        .set("referer", "https://easyeda.com/editor")
        .send_string(&body)
        .map_err(|e| Error::Msg(format!("easyeda search {lcsc}: {e}")))?;
    let v: Value = resp
        .into_json()
        .map_err(|e| Error::Msg(format!("easyeda search json: {e}")))?;
    let lists = v
        .pointer("/result/lists/lcsc")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    if lists.is_empty() {
        return Ok(None);
    }
    for item in &lists {
        let supplier = item
            .pointer("/dataStr/head/c_para/Supplier Part")
            .and_then(|x| x.as_str());
        if supplier == Some(lcsc) {
            return Ok(item.get("uuid").and_then(|x| x.as_str()).map(str::to_string));
        }
    }
    Ok(lists[0]
        .get("uuid")
        .and_then(|x| x.as_str())
        .map(str::to_string))
}

fn easyeda_model_uuid(component_uuid: &str) -> Result<Option<String>> {
    let agent = agent();
    let url = format!(
        "https://easyeda.com/api/components/{component_uuid}?version=6.4.7&uuid={component_uuid}&datastrid="
    );
    let resp = agent
        .get(&url)
        .set("x-requested-with", "XMLHttpRequest")
        .set(
            "referer",
            &format!("https://easyeda.com/editor?uuid={component_uuid}"),
        )
        .call()
        .map_err(|e| Error::Msg(format!("easyeda component {component_uuid}: {e}")))?;
    let v: Value = resp
        .into_json()
        .map_err(|e| Error::Msg(format!("easyeda component json: {e}")))?;
    let shapes = v
        .pointer("/result/packageDetail/dataStr/shape")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    for shape in shapes {
        let Some(s) = shape.as_str() else { continue };
        if let Some(json_part) = s.strip_prefix("SVGNODE~") {
            if let Ok(node) = serde_json::from_str::<Value>(json_part) {
                if let Some(mu) = node.pointer("/attrs/uuid").and_then(|x| x.as_str()) {
                    return Ok(Some(mu.to_string()));
                }
            }
        }
    }
    Ok(None)
}

/// Guess jscad footprinter name from a `tscircuit:…` footprint lib id.
pub fn footprinter_from_lib_id(lib_id: &str) -> Vec<String> {
    let name = lib_id.rsplit(':').next().unwrap_or(lib_id);
    let mut out = Vec::new();
    let push = |v: &mut Vec<String>, s: &str| {
        if !s.is_empty() && !v.iter().any(|x| x == s) {
            v.push(s.to_string());
        }
    };
    push(&mut out, name);
    if let Some(rest) = name.strip_prefix("resistor_res") {
        push(&mut out, &format!("res{rest}"));
        push(&mut out, rest);
    }
    if let Some(rest) = name.strip_prefix("capacitor_") {
        push(&mut out, rest);
    }
    if let Some(rest) = name.strip_prefix("led_") {
        push(&mut out, rest);
    }
    if name.contains("74HC") || name.contains("HC595") || name.contains("SN74") {
        push(&mut out, "soic16");
    }
    out
}

fn fetch_lcsc_step(lcsc: &str) -> Result<Option<Vec<u8>>> {
    let direct = format!("{EASYEDA_CDN}/{lcsc}.step");
    if let Some(bytes) = http_get_bytes(&direct)? {
        return Ok(Some(bytes));
    }
    if let Some(comp_uuid) = easyeda_search_uuid(lcsc)? {
        if let Some(model_uuid) = easyeda_model_uuid(&comp_uuid)? {
            let with_uuid = format!("{EASYEDA_CDN}/{lcsc}.step?uuid={model_uuid}");
            if let Some(bytes) = http_get_bytes(&with_uuid)? {
                return Ok(Some(bytes));
            }
        }
    }
    Ok(None)
}

fn fetch_footprinter_step(fp: &str) -> Result<Option<Vec<u8>>> {
    let encoded = fp.replace(' ', "%20");
    let url = format!("{JSCAD_CDN}/{encoded}.step");
    http_get_bytes(&url)
}

fn ensure_cached_step(cache_dir: &Path, filename: &str, bytes: &[u8]) -> Result<PathBuf> {
    fs::create_dir_all(cache_dir)?;
    let path = cache_dir.join(filename);
    if !(path.exists() && fs::metadata(&path).map(|m| m.len() as usize).unwrap_or(0) == bytes.len())
    {
        fs::write(&path, bytes)?;
    }
    Ok(path)
}

fn project_model_file(models_dir: &Path, lcsc: &str) -> Option<PathBuf> {
    let candidates = [
        models_dir.join(format!("{lcsc}.step")),
        models_dir.join(format!("{lcsc}.STEP")),
        models_dir.join(format!("{lcsc}.stp")),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

/// Resolve LCSC (+ optional footprint lib id) → ModelSpec.
pub fn resolve_model(
    lcsc: Option<&str>,
    lib_id: Option<&str>,
    cache_dir: &Path,
    models_dir: Option<&Path>,
    downloaded: &mut usize,
    from_project: &mut usize,
) -> Result<Option<ModelSpec>> {
    if let Some(lcsc) = lcsc {
        let filename = format!("{lcsc}.step");

        // 1. Project override (circuit/3dmodels/C….step)
        if let Some(dir) = models_dir {
            if let Some(src) = project_model_file(dir, lcsc) {
                let bytes = fs::read(&src)?;
                if looks_like_step(&bytes) {
                    ensure_cached_step(cache_dir, &filename, &bytes)?;
                    *from_project += 1;
                    return Ok(Some(ModelSpec {
                        path: format!("${{KIPRJMOD}}/3dmodels/{filename}"),
                        offset: (0.0, 0.0, 0.0),
                        scale: (1.0, 1.0, 1.0),
                        rotate: (0.0, 0.0, 0.0),
                    }));
                }
            }
        }

        let cached = cache_dir.join(&filename);
        if cached.exists() && fs::metadata(&cached).map(|m| m.len() > 100).unwrap_or(false) {
            return Ok(Some(ModelSpec {
                path: format!("${{KIPRJMOD}}/3dmodels/{filename}"),
                offset: (0.0, 0.0, 0.0),
                scale: (1.0, 1.0, 1.0),
                rotate: (0.0, 0.0, 0.0),
            }));
        }
        if let Some(bytes) = fetch_lcsc_step(lcsc)? {
            ensure_cached_step(cache_dir, &filename, &bytes)?;
            *downloaded += 1;
            return Ok(Some(ModelSpec {
                path: format!("${{KIPRJMOD}}/3dmodels/{filename}"),
                offset: (0.0, 0.0, 0.0),
                scale: (1.0, 1.0, 1.0),
                rotate: (0.0, 0.0, 0.0),
            }));
        }
    }

    if let Some(lib_id) = lib_id {
        for fp in footprinter_from_lib_id(lib_id) {
            let safe = fp.replace(['/', '\\', ':'], "_");
            let filename = format!("fp_{safe}.step");
            let cached = cache_dir.join(&filename);
            if cached.exists() && fs::metadata(&cached).map(|m| m.len() > 100).unwrap_or(false) {
                return Ok(Some(ModelSpec {
                    path: format!("${{KIPRJMOD}}/3dmodels/{filename}"),
                    offset: (0.0, 0.0, 0.0),
                    scale: (1.0, 1.0, 1.0),
                    rotate: (0.0, 0.0, 0.0),
                }));
            }
            if let Some(bytes) = fetch_footprinter_step(&fp)? {
                ensure_cached_step(cache_dir, &filename, &bytes)?;
                *downloaded += 1;
                return Ok(Some(ModelSpec {
                    path: format!("${{KIPRJMOD}}/3dmodels/{filename}"),
                    offset: (0.0, 0.0, 0.0),
                    scale: (1.0, 1.0, 1.0),
                    rotate: (0.0, 0.0, 0.0),
                }));
            }
        }
    }
    Ok(None)
}

/// Optional per-LCSC offset/rotate from `circuit/3dmodels/transforms.toml`.
pub fn load_transforms(path: &Path) -> Result<HashMap<String, ModelSpec>> {
    #[derive(serde::Deserialize)]
    struct Xform {
        #[serde(default)]
        offset: Option<[f64; 3]>,
        #[serde(default)]
        rotate: Option<[f64; 3]>,
        #[serde(default)]
        scale: Option<[f64; 3]>,
        /// Unused here — path comes from cache/CDN; keep for forward compat.
        #[serde(default)]
        path: Option<String>,
    }
    if !path.is_file() {
        return Ok(HashMap::new());
    }
    let text = fs::read_to_string(path)?;
    let raw: HashMap<String, Xform> = toml::from_str(&text)?;
    let mut out = HashMap::new();
    for (lcsc, x) in raw {
        let o = x.offset.unwrap_or([0.0, 0.0, 0.0]);
        let r = x.rotate.unwrap_or([0.0, 0.0, 0.0]);
        let s = x.scale.unwrap_or([1.0, 1.0, 1.0]);
        out.insert(
            lcsc.clone(),
            ModelSpec {
                path: x
                    .path
                    .unwrap_or_else(|| format!("${{KIPRJMOD}}/3dmodels/{lcsc}.step")),
                offset: (o[0], o[1], o[2]),
                scale: (s[0], s[1], s[2]),
                rotate: (r[0], r[1], r[2]),
            },
        );
    }
    Ok(out)
}

fn apply_transform(base: &ModelSpec, xform: &ModelSpec) -> ModelSpec {
    ModelSpec {
        path: base.path.clone(),
        offset: xform.offset,
        scale: xform.scale,
        rotate: xform.rotate,
    }
}

/// Optional path-only overrides: `C12345 = "${KIPRJMOD}/3dmodels/custom.step"`
pub fn load_model_map(path: &Path) -> Result<HashMap<String, ModelSpec>> {
    let text = fs::read_to_string(path)?;
    let raw: HashMap<String, String> = toml::from_str(&text)?;
    let mut out = HashMap::new();
    for (lcsc, model_path) in raw {
        out.insert(
            lcsc,
            ModelSpec {
                path: model_path,
                offset: (0.0, 0.0, 0.0),
                scale: (1.0, 1.0, 1.0),
                rotate: (0.0, 0.0, 0.0),
            },
        );
    }
    Ok(out)
}

fn fmt_xyz(v: (f64, f64, f64)) -> String {
    format!("{} {} {}", fmt_num(v.0), fmt_num(v.1), fmt_num(v.2))
}

fn fmt_num(v: f64) -> String {
    let s = format!("{v:.6}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn model_sexp(spec: &ModelSpec) -> String {
    format!(
        "\t\t(model \"{}\"\n\t\t\t(offset (xyz {}))\n\t\t\t(scale (xyz {}))\n\t\t\t(rotate (xyz {}))\n\t\t)\n",
        spec.path.replace('"', ""),
        fmt_xyz(spec.offset),
        fmt_xyz(spec.scale),
        fmt_xyz(spec.rotate),
    )
}

fn property_value(block: &str, name: &str) -> Option<String> {
    let re = Regex::new(&format!(
        r#"(?s)\(property\s+"{}"\s+"([^"]*)""#,
        regex::escape(name)
    ))
    .unwrap();
    re.captures(block).map(|c| c[1].to_string())
}

fn footprint_lib_id(block: &str) -> Option<String> {
    let re = Regex::new(r#"^\(footprint\s+"([^"]+)""#).unwrap();
    re.captures(block.trim_start()).map(|c| c[1].to_string())
}

fn footprint_has_model(block: &str) -> bool {
    block.contains("\n\t\t(model ") || block.contains("\n\t(model ")
}

fn strip_models_in_footprint(block: &str) -> String {
    let bytes = block.as_bytes();
    let mut out = String::with_capacity(block.len());
    let mut i = 0;
    while i < bytes.len() {
        let is_model = i + 6 <= bytes.len()
            && &bytes[i..i + 6] == b"(model"
            && i >= 1
            && bytes[i - 1] == b'\t';
        if is_model {
            if let Some(end) = skip_sexp(bytes, i) {
                while out.ends_with('\t') {
                    out.pop();
                }
                let mut j = end;
                if j < bytes.len() && bytes[j] == b'\n' {
                    j += 1;
                }
                i = j;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

pub fn attach_3d_to_pcb_text(
    pcb_text: &str,
    cache_dir: &Path,
    models_dir: Option<&Path>,
    overrides: &HashMap<String, ModelSpec>,
    transforms: &HashMap<String, ModelSpec>,
) -> Result<(String, Attach3dReport)> {
    let bytes = pcb_text.as_bytes();
    let mut out = String::with_capacity(pcb_text.len() + 8192);
    let mut report = Attach3dReport::default();
    let mut resolved: HashMap<String, Option<ModelSpec>> = HashMap::new();
    let mut i = 0;

    while i < bytes.len() {
        if looks_like_top_level(bytes, i, b"(footprint") {
            let Some(end) = skip_sexp(bytes, i) else {
                out.push(bytes[i] as char);
                i += 1;
                continue;
            };
            let block = std::str::from_utf8(&bytes[i..end])
                .map_err(|e| Error::Msg(format!("utf8 footprint: {e}")))?;

            report.footprints += 1;
            let reference = property_value(block, "Reference").unwrap_or_else(|| "?".into());
            let lcsc = property_value(block, "Supplier Part Number");
            let lib_id = footprint_lib_id(block);

            let cache_key = format!(
                "{}|{}",
                lcsc.as_deref().unwrap_or(""),
                lib_id.as_deref().unwrap_or("")
            );

            if !resolved.contains_key(&cache_key) {
                let mut spec = if let Some(lcsc) = lcsc.as_deref() {
                    if let Some(ov) = overrides.get(lcsc) {
                        Some(ov.clone())
                    } else {
                        resolve_model(
                            Some(lcsc),
                            lib_id.as_deref(),
                            cache_dir,
                            models_dir,
                            &mut report.downloaded,
                            &mut report.from_project,
                        )?
                    }
                } else {
                    resolve_model(
                        None,
                        lib_id.as_deref(),
                        cache_dir,
                        models_dir,
                        &mut report.downloaded,
                        &mut report.from_project,
                    )?
                };
                if let (Some(lcsc), Some(base)) = (lcsc.as_deref(), spec.as_ref()) {
                    if let Some(xf) = transforms.get(lcsc) {
                        spec = Some(apply_transform(base, xf));
                    }
                }
                resolved.insert(cache_key.clone(), spec);
            }

            let mut new_block = block.to_string();
            match resolved.get(&cache_key).and_then(|s| s.as_ref()) {
                Some(spec) => {
                    let had = footprint_has_model(&new_block);
                    if had {
                        new_block = strip_models_in_footprint(&new_block);
                        report.already_had += 1;
                    }
                    let trimmed = new_block.trim_end();
                    let Some(stripped) = trimmed.strip_suffix(')') else {
                        return Err(Error::Msg("footprint missing closing )".into()));
                    };
                    let mut body = stripped.to_string();
                    if !body.ends_with('\n') {
                        body.push('\n');
                    }
                    body.push_str(&model_sexp(spec));
                    body.push('\t');
                    body.push(')');
                    new_block = body;
                    report.attached += 1;
                }
                None => {
                    if lcsc.is_none() {
                        report.skipped_no_lcsc += 1;
                    } else {
                        report.missing.push(format!(
                            "{reference} ({})",
                            lcsc.as_deref().unwrap_or("?")
                        ));
                    }
                }
            }

            out.push_str(&new_block);
            if end < bytes.len() && bytes[end] == b'\n' {
                out.push('\n');
                i = end + 1;
            } else {
                i = end;
            }
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }

    report.missing.sort();
    report.missing.dedup();
    Ok((out, report))
}

/// Read PCB, resolve STEPs (project dir + CDN), write `out`.
pub fn attach_3d_to_pcb_files(
    pcb: &Path,
    out: &Path,
    map: Option<&Path>,
    models_dir: Option<&Path>,
) -> Result<Attach3dReport> {
    let cache_dir = out
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("3dmodels");
    let mut overrides = HashMap::new();
    if let Some(map) = map {
        overrides = load_model_map(map)?;
    }
    let models_owned = models_dir
        .map(Path::to_path_buf)
        .or_else(|| {
            let p = PathBuf::from(DEFAULT_MODELS_DIR);
            if p.is_dir() {
                Some(p)
            } else {
                None
            }
        });
    let transforms_path = models_owned
        .as_ref()
        .map(|d| d.join("transforms.toml"))
        .unwrap_or_else(|| PathBuf::from(DEFAULT_MODELS_DIR).join("transforms.toml"));
    let transforms = load_transforms(&transforms_path)?;

    let text = fs::read_to_string(pcb)?;
    let (new_text, report) = attach_3d_to_pcb_text(
        &text,
        &cache_dir,
        models_owned.as_deref(),
        &overrides,
        &transforms,
    )?;
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(out, new_text)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn footprinter_guesses() {
        let g = footprinter_from_lib_id("tscircuit:resistor_res0402");
        assert!(g.iter().any(|s| s == "res0402"));
        let g = footprinter_from_lib_id("tscircuit:capacitor_0805");
        assert!(g.iter().any(|s| s == "0805"));
    }

    #[test]
    fn project_override_wins() {
        let models = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        fs::write(models.path().join("C9.step"), b"ISO-10303-21;\nHEADER;\n").unwrap();
        let mut dl = 0;
        let mut proj = 0;
        let spec = resolve_model(
            Some("C9"),
            None,
            cache.path(),
            Some(models.path()),
            &mut dl,
            &mut proj,
        )
        .unwrap()
        .unwrap();
        assert_eq!(proj, 1);
        assert_eq!(dl, 0);
        assert!(spec.path.contains("C9.step"));
        assert!(cache.path().join("C9.step").exists());
    }

    #[test]
    fn injects_model_sexp() {
        let dir = tempfile::tempdir().unwrap();
        let overrides = HashMap::from([(
            "C1".to_string(),
            ModelSpec {
                path: "${KIPRJMOD}/3dmodels/C1.step".into(),
                offset: (0.0, 0.0, 0.0),
                scale: (1.0, 1.0, 1.0),
                rotate: (0.0, 0.0, 0.0),
            },
        )]);
        let pcb = r#"(kicad_pcb
	(footprint "tscircuit:x"
		(layer "F.Cu")
		(property "Reference" "U1"
			(at 0 0)
			(layer "F.SilkS")
			(uuid "00000000-0000-4000-a000-000000000001")
		)
		(property "Supplier Part Number" "C1"
			(at 0 0)
			(layer "F.Fab")
			(uuid "00000000-0000-4000-a000-000000000002")
		)
		(embedded_fonts no)
	)
)
"#;
        let (out, report) =
            attach_3d_to_pcb_text(pcb, dir.path(), None, &overrides, &HashMap::new()).unwrap();
        assert_eq!(report.attached, 1);
        assert!(out.contains("${KIPRJMOD}/3dmodels/C1.step"));
    }
}
