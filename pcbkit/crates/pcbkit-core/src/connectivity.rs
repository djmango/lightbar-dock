use crate::circuit::{Board, RouteSeg, LAYER_BOTTOM, LAYER_TOP};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
pub struct ConnectivityReport {
    pub unconnected: usize,
    pub shorts: usize,
    pub details: Vec<String>,
}

struct Uf {
    parent: Vec<usize>,
}

impl Uf {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
        }
    }
    fn find(&mut self, x: usize) -> usize {
        let mut x = x;
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]];
            x = self.parent[x];
        }
        x
    }
    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb {
            self.parent[rb] = ra;
        }
    }
}

#[derive(Clone)]
struct Seg {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    width: f64,
    layer: String,
    #[allow(dead_code)]
    net: String,
}

#[derive(Clone)]
struct ViaPt {
    x: f64,
    y: f64,
    outer: f64,
    #[allow(dead_code)]
    net: String,
}

fn hypot(dx: f64, dy: f64) -> f64 {
    (dx * dx + dy * dy).sqrt()
}

fn dist_point_seg(px: f64, py: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    if len2 < 1e-18 {
        return hypot(px - x1, py - y1);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    let t = t.clamp(0.0, 1.0);
    hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

fn flatten(board: &Board) -> (Vec<Seg>, Vec<ViaPt>) {
    let mut segs = Vec::new();
    let mut vias = Vec::new();

    for v in &board.vias {
        vias.push(ViaPt {
            x: v.x,
            y: v.y,
            outer: v.outer_diameter,
            net: v.net.clone(),
        });
    }

    // Each board.traces entry is one continuous polyline — never join across traces.
    for path in &board.traces {
        let mut prev: Option<(f64, f64, f64, String, String)> = None;
        for rp in path {
            match rp {
                RouteSeg::Wire {
                    x,
                    y,
                    width,
                    layer,
                    net,
                } => {
                    if let Some((px, py, pw, player, pnet)) = &prev {
                        if player == layer && pnet == net {
                            segs.push(Seg {
                                x1: *px,
                                y1: *py,
                                x2: *x,
                                y2: *y,
                                width: width.max(*pw),
                                layer: layer.clone(),
                                net: net.clone(),
                            });
                        }
                    }
                    prev = Some((*x, *y, *width, layer.clone(), net.clone()));
                }
                RouteSeg::Via { x, y, net } => {
                    vias.push(ViaPt {
                        x: *x,
                        y: *y,
                        outer: 0.6,
                        net: net.clone(),
                    });
                    prev = None;
                }
            }
        }
    }

    (segs, vias)
}

/// Connectivity report for pads + routed copper on the board.
pub fn connectivity_report(board: &Board, pad_clearance: f64) -> ConnectivityReport {
    let pads = &board.pads;
    let n = pads.len();
    if n == 0 {
        return ConnectivityReport {
            unconnected: 0,
            shorts: 0,
            details: vec![],
        };
    }

    let (segs, vias) = flatten(board);
    let mut uf = Uf::new(n);

    let mut seg_pads: Vec<Vec<usize>> = vec![Vec::new(); segs.len()];
    for (si, s) in segs.iter().enumerate() {
        for (pi, p) in pads.iter().enumerate() {
            // SMT pads hit their copper layer only; unknown/empty layer treated as top.
            let pad_layer = if p.layer.is_empty() {
                LAYER_TOP
            } else {
                p.layer.as_str()
            };
            let multilayer = pad_layer != LAYER_TOP && pad_layer != LAYER_BOTTOM;
            if !multilayer && pad_layer != s.layer {
                continue;
            }
            let r = p.width.max(p.height) / 2.0 + s.width / 2.0 + pad_clearance;
            if dist_point_seg(p.x, p.y, s.x1, s.y1, s.x2, s.y2) <= r {
                seg_pads[si].push(pi);
            }
        }
        for i in 1..seg_pads[si].len() {
            uf.union(seg_pads[si][0], seg_pads[si][i]);
        }
    }

    let mut via_pads: Vec<Vec<usize>> = vec![Vec::new(); vias.len()];
    for (vi, v) in vias.iter().enumerate() {
        for (pi, p) in pads.iter().enumerate() {
            let r = p.width.max(p.height) / 2.0 + v.outer / 2.0 + pad_clearance;
            if hypot(p.x - v.x, p.y - v.y) <= r {
                via_pads[vi].push(pi);
            }
        }
        for i in 1..via_pads[vi].len() {
            uf.union(via_pads[vi][0], via_pads[vi][i]);
        }
    }

    // Wire UF: join segments that share endpoints or meet at vias.
    let mut wuf = Uf::new(segs.len().max(1));
    let mut endpoint: HashMap<(i64, i64, u8), Vec<usize>> = HashMap::new();
    for (si, s) in segs.iter().enumerate() {
        let lid = if s.layer == LAYER_BOTTOM { 1u8 } else { 0u8 };
        for (x, y) in [(s.x1, s.y1), (s.x2, s.y2)] {
            let key = ((x * 1000.0).round() as i64, (y * 1000.0).round() as i64, lid);
            endpoint.entry(key).or_default().push(si);
        }
    }
    for list in endpoint.values() {
        for i in 1..list.len() {
            wuf.union(list[0], list[i]);
        }
    }
    for (vi, v) in vias.iter().enumerate() {
        let mut hit = Vec::new();
        for (si, s) in segs.iter().enumerate() {
            let r = s.width / 2.0 + v.outer / 2.0 + pad_clearance;
            if dist_point_seg(v.x, v.y, s.x1, s.y1, s.x2, s.y2) <= r {
                hit.push(si);
            }
        }
        for i in 1..hit.len() {
            wuf.union(hit[0], hit[i]);
        }
        // Link pads on via to pads on connected wires
        if let Some(&vp) = via_pads[vi].first() {
            for &si in &hit {
                for &pi in &seg_pads[si] {
                    uf.union(vp, pi);
                }
            }
        } else if let Some(&si0) = hit.first() {
            // via with no pad contact: still merge wire pads through via
            for &si in &hit {
                if let (Some(&a), Some(&b)) = (seg_pads[si0].first(), seg_pads[si].first()) {
                    uf.union(a, b);
                }
            }
        }
    }

    let mut wcomp_pads: HashMap<usize, Vec<usize>> = HashMap::new();
    for (si, ps) in seg_pads.iter().enumerate() {
        if segs.is_empty() {
            break;
        }
        let root = wuf.find(si);
        wcomp_pads.entry(root).or_default().extend(ps.iter().copied());
    }
    for ps in wcomp_pads.values() {
        for i in 1..ps.len() {
            uf.union(ps[0], ps[i]);
        }
    }

    let mut by_net: HashMap<String, Vec<usize>> = HashMap::new();
    for (pi, p) in pads.iter().enumerate() {
        by_net.entry(p.net.clone()).or_default().push(pi);
    }

    let mut details = Vec::new();
    let mut unconnected = 0usize;
    for (net, idxs) in &by_net {
        if idxs.len() < 2 {
            continue;
        }
        let roots: HashSet<usize> = idxs.iter().map(|&i| uf.find(i)).collect();
        if roots.len() > 1 {
            unconnected += roots.len() - 1;
            details.push(format!(
                "net {net}: {} pads in {} islands",
                idxs.len(),
                roots.len()
            ));
        }
    }

    let mut shorts = 0usize;
    let mut root_nets: HashMap<usize, HashSet<String>> = HashMap::new();
    for (pi, p) in pads.iter().enumerate() {
        root_nets
            .entry(uf.find(pi))
            .or_default()
            .insert(p.net.clone());
    }
    for (root, nets) in root_nets {
        if nets.len() > 1 {
            shorts += nets.len() - 1;
            let mut list: Vec<_> = nets.into_iter().collect();
            list.sort();
            details.push(format!("short at component {root}: {}", list.join(" + ")));
        }
    }

    ConnectivityReport {
        unconnected,
        shorts,
        details,
    }
}
