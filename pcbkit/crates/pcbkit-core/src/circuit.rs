use crate::{Error, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

pub const LAYER_TOP: &str = "top";
pub const LAYER_BOTTOM: &str = "bottom";

#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub struct Pad {
    pub id: String,
    pub component: String,
    pub pin: String,
    pub net: String,
    pub x: f64,
    pub y: f64,
    pub layer: String,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone)]
pub struct Via {
    pub x: f64,
    pub y: f64,
    pub outer_diameter: f64,
    pub hole_diameter: f64,
    pub net: String,
}

#[derive(Debug, Clone)]
pub enum RouteSeg {
    Wire {
        x: f64,
        y: f64,
        width: f64,
        layer: String,
        net: String,
    },
    Via {
        x: f64,
        y: f64,
        net: String,
    },
}

#[derive(Debug, Clone)]
pub struct Board {
    pub width: f64,
    pub height: f64,
    pub center: Point,
    pub min_trace_width: f64,
    pub pads: Vec<Pad>,
    pub vias: Vec<Via>,
    /// Each inner vec is one continuous pcb_trace path (never merge across traces).
    pub traces: Vec<Vec<RouteSeg>>,
}

#[derive(Debug, Clone)]
pub struct CircuitDocument {
    pub elements: Vec<Value>,
}

pub fn load_circuit(path: &Path) -> Result<CircuitDocument> {
    let text = std::fs::read_to_string(path)?;
    let elements: Vec<Value> = serde_json::from_str(&text)?;
    Ok(CircuitDocument { elements })
}

pub fn save_circuit(doc: &CircuitDocument, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(&doc.elements)?;
    std::fs::write(path, text)?;
    Ok(())
}

impl CircuitDocument {
    pub fn board(&self) -> Result<Board> {
        let pcb_board = self
            .elements
            .iter()
            .find(|e| e.get("type").and_then(|t| t.as_str()) == Some("pcb_board"))
            .ok_or_else(|| Error::Msg("pcb_board missing".into()))?;

        let width = pcb_board
            .get("width")
            .and_then(|v| v.as_f64())
            .unwrap_or(100.0);
        let height = pcb_board
            .get("height")
            .and_then(|v| v.as_f64())
            .unwrap_or(50.0);
        let center = Point {
            x: pcb_board
                .pointer("/center/x")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
            y: pcb_board
                .pointer("/center/y")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
        };
        let min_trace_width = pcb_board
            .get("min_trace_width")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.15);

        let mut source_nets: HashMap<String, String> = HashMap::new();
        let mut source_comp_name: HashMap<String, String> = HashMap::new();
        let mut source_port_net: HashMap<String, String> = HashMap::new();
        let mut source_port_meta: HashMap<String, (String, String)> = HashMap::new();
        let mut pcb_port_source: HashMap<String, String> = HashMap::new();
        let mut connectivity_to_net: HashMap<String, String> = HashMap::new();

        for e in &self.elements {
            let ty = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match ty {
                "source_net" => {
                    if let (Some(id), Some(name)) = (
                        e.get("source_net_id").and_then(|v| v.as_str()),
                        e.get("name").and_then(|v| v.as_str()),
                    ) {
                        source_nets.insert(id.to_string(), name.to_string());
                        if let Some(key) = e
                            .get("subcircuit_connectivity_map_key")
                            .and_then(|v| v.as_str())
                        {
                            connectivity_to_net.insert(key.to_string(), name.to_string());
                        }
                    }
                }
                "source_component" => {
                    if let (Some(id), Some(name)) = (
                        e.get("source_component_id").and_then(|v| v.as_str()),
                        e.get("name").and_then(|v| v.as_str()),
                    ) {
                        source_comp_name.insert(id.to_string(), name.to_string());
                    }
                }
                "source_port" => {
                    let id = e
                        .get("source_port_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let pin = e
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| e.get("pin_number").map(|v| v.to_string()))
                        .unwrap_or_default();
                    let comp_id = e
                        .get("source_component_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let comp = source_comp_name
                        .get(comp_id)
                        .cloned()
                        .unwrap_or_else(|| comp_id.to_string());
                    source_port_meta.insert(id.to_string(), (comp, pin));
                    if let Some(key) = e
                        .get("subcircuit_connectivity_map_key")
                        .and_then(|v| v.as_str())
                    {
                        if let Some(net) = connectivity_to_net.get(key) {
                            source_port_net.insert(id.to_string(), net.clone());
                        }
                    }
                }
                "source_trace" => {
                    let net_ids = e
                        .get("connected_source_net_ids")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let port_ids = e
                        .get("connected_source_port_ids")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    if let Some(nid) = net_ids.first().and_then(|v| v.as_str()) {
                        if let Some(net) = source_nets.get(nid) {
                            for pid in port_ids {
                                if let Some(p) = pid.as_str() {
                                    source_port_net
                                        .entry(p.to_string())
                                        .or_insert_with(|| net.clone());
                                }
                            }
                        }
                    }
                }
                "pcb_port" => {
                    if let (Some(id), Some(sid)) = (
                        e.get("pcb_port_id").and_then(|v| v.as_str()),
                        e.get("source_port_id").and_then(|v| v.as_str()),
                    ) {
                        pcb_port_source.insert(id.to_string(), sid.to_string());
                    }
                }
                _ => {}
            }
        }

        let mut pads = Vec::new();
        for e in &self.elements {
            let ty = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty != "pcb_smtpad" && ty != "pcb_plated_hole" {
                continue;
            }
            let x = e.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = e.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let layer = e
                .get("layer")
                .and_then(|v| v.as_str())
                .unwrap_or(LAYER_TOP)
                .to_string();
            let (width, height) = if ty == "pcb_smtpad" {
                (
                    e.get("width").and_then(|v| v.as_f64()).unwrap_or(0.5),
                    e.get("height").and_then(|v| v.as_f64()).unwrap_or(0.5),
                )
            } else {
                let ow = e
                    .get("outer_diameter")
                    .or_else(|| e.get("outer_width"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.8);
                (ow, ow)
            };
            let pcb_port_id = e.get("pcb_port_id").and_then(|v| v.as_str());
            let mut net = String::new();
            let mut component = String::new();
            let mut pin = String::new();
            if let Some(pp) = pcb_port_id {
                if let Some(sp) = pcb_port_source.get(pp) {
                    if let Some(n) = source_port_net.get(sp) {
                        net = n.clone();
                    }
                    if let Some((c, p)) = source_port_meta.get(sp) {
                        component = c.clone();
                        pin = p.clone();
                    }
                }
            }
            if net.is_empty() {
                continue; // unconnected / mechanical
            }
            let id = e
                .get("pcb_smtpad_id")
                .or_else(|| e.get("pcb_plated_hole_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("pad")
                .to_string();
            pads.push(Pad {
                id,
                component,
                pin,
                net,
                x,
                y,
                layer,
                width,
                height,
            });
        }

        let mut vias = Vec::new();
        let mut traces = Vec::new();
        for e in &self.elements {
            let ty = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "pcb_via" {
                vias.push(Via {
                    x: e.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    y: e.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    outer_diameter: e
                        .get("outer_diameter")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.6),
                    hole_diameter: e
                        .get("hole_diameter")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.3),
                    net: e
                        .get("net")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                });
            } else if ty == "pcb_trace" {
                let net = e
                    .get("net")
                    .or_else(|| e.get("source_net_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if let Some(route) = e.get("route").and_then(|v| v.as_array()) {
                    let mut path = Vec::new();
                    for r in route {
                        let rt = r.get("route_type").and_then(|v| v.as_str()).unwrap_or("");
                        let x = r.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        let y = r.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        if rt == "via" {
                            path.push(RouteSeg::Via {
                                x,
                                y,
                                net: net.clone(),
                            });
                        } else {
                            path.push(RouteSeg::Wire {
                                x,
                                y,
                                width: r
                                    .get("width")
                                    .and_then(|v| v.as_f64())
                                    .unwrap_or(min_trace_width),
                                layer: r
                                    .get("layer")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(LAYER_TOP)
                                    .to_string(),
                                net: net.clone(),
                            });
                        }
                    }
                    if !path.is_empty() {
                        traces.push(path);
                    }
                }
            }
        }

        Ok(Board {
            width,
            height,
            center,
            min_trace_width,
            pads,
            vias,
            traces,
        })
    }

    /// Drop existing routed copper (pcb_trace + auto vias tagged by pcbkit), keep manual vias.
    pub fn clear_routes(&mut self) {
        self.elements.retain(|e| {
            let ty = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "pcb_trace" {
                return false;
            }
            if ty == "pcb_via" {
                // Keep source_manually_placed / non-pcbkit vias (no pcbkit tag).
                if e.get("pcbkit").and_then(|v| v.as_bool()).unwrap_or(false) {
                    return false;
                }
            }
            true
        });
    }
}

/// Merge routed paths into the circuit document — one pcb_trace per path.
pub fn apply_routes(
    doc: &mut CircuitDocument,
    paths: &[Vec<RouteSeg>],
    via_outer: f64,
    via_drill: f64,
) -> Result<()> {
    let mut idx = 0usize;
    let mut vidx = 0usize;

    for path in paths {
        if path.is_empty() {
            continue;
        }
        let net = match &path[0] {
            RouteSeg::Wire { net, .. } | RouteSeg::Via { net, .. } => net.clone(),
        };
        let mut route = Vec::new();
        for seg in path {
            match seg {
                RouteSeg::Wire {
                    x,
                    y,
                    width,
                    layer,
                    ..
                } => {
                    route.push(json!({
                        "route_type": "wire",
                        "x": x,
                        "y": y,
                        "width": width,
                        "layer": layer,
                    }));
                }
                RouteSeg::Via { x, y, net } => {
                    vidx += 1;
                    doc.elements.push(json!({
                        "type": "pcb_via",
                        "pcb_via_id": format!("pcbkit_via_{vidx}"),
                        "x": x,
                        "y": y,
                        "hole_diameter": via_drill,
                        "outer_diameter": via_outer,
                        "layers": [LAYER_TOP, LAYER_BOTTOM],
                        "from_layer": LAYER_TOP,
                        "to_layer": LAYER_BOTTOM,
                        "net": net,
                        "pcbkit": true,
                    }));
                    route.push(json!({
                        "route_type": "via",
                        "x": x,
                        "y": y,
                        "from_layer": LAYER_TOP,
                        "to_layer": LAYER_BOTTOM,
                    }));
                }
            }
        }
        if route.is_empty() {
            continue;
        }
        idx += 1;
        doc.elements.push(json!({
            "type": "pcb_trace",
            "pcb_trace_id": format!("pcbkit_trace_{idx}_{net}"),
            "net": net,
            "route": route,
            "pcbkit": true,
        }));
    }
    Ok(())
}
