use pcbkit_core::{Board, Profile, RouteSeg, LAYER_TOP};
use std::collections::{HashMap, HashSet};

/// Lightweight grid finish: for each net with multiple islands of pads (no copper
/// path yet), try axis-aligned manhattan links on a coarse grid.
///
/// This is intentionally simpler than the KiCad Python grid finisher — enough to
/// close easy gaps after the bulk engine. Hard nets still need repairs / engine.
pub fn grid_finish(board: &Board, existing: &[RouteSeg], profile: &Profile) -> Vec<RouteSeg> {
    if !profile.finish {
        return vec![];
    }

    let skip: HashSet<_> = profile
        .skip_nets
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let mut by_net: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, p) in board.pads.iter().enumerate() {
        if skip.contains(&p.net.to_ascii_lowercase()) {
            continue;
        }
        by_net.entry(p.net.clone()).or_default().push(i);
    }

    // Nets that already have some route copper — still may be incomplete; we only
    // add links between pads that look isolated (no nearby route point).
    let mut routed_near: HashSet<(i64, i64, String)> = HashSet::new();
    for s in existing {
        let (x, y, net) = match s {
            RouteSeg::Wire { x, y, net, .. } | RouteSeg::Via { x, y, net } => (x, y, net),
        };
        routed_near.insert((
            (*x * 10.0).round() as i64,
            (*y * 10.0).round() as i64,
            net.clone(),
        ));
    }

    let width = profile.trace_width_mm;
    let grid = profile.finish_grid_mm.max(0.05);
    let mut extra = Vec::new();

    for (net, idxs) in by_net {
        if idxs.len() < 2 {
            continue;
        }
        // Greedy nearest-neighbor MST-ish on pads that have no nearby copper
        let mut unmet: Vec<usize> = idxs
            .iter()
            .copied()
            .filter(|&i| {
                let p = &board.pads[i];
                let key = (
                    (p.x * 10.0).round() as i64,
                    (p.y * 10.0).round() as i64,
                    net.clone(),
                );
                !routed_near.contains(&key)
            })
            .collect();
        if unmet.len() < 2 {
            // If engine left nothing, try all pads
            if existing.iter().all(|s| match s {
                RouteSeg::Wire { net: n, .. } | RouteSeg::Via { net: n, .. } => n != &net,
            }) {
                unmet = idxs.clone();
            } else {
                continue;
            }
        }
        if unmet.len() < 2 {
            continue;
        }

        unmet.sort_by(|&a, &b| {
            let (pa, pb) = (&board.pads[a], &board.pads[b]);
            pa.x.partial_cmp(&pb.x)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(
                    pa.y.partial_cmp(&pb.y)
                        .unwrap_or(std::cmp::Ordering::Equal),
                )
        });

        for w in unmet.windows(2) {
            let a = &board.pads[w[0]];
            let b = &board.pads[w[1]];
            let dist = ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt();
            if dist > 25.0 {
                continue; // don't invent long hops
            }
            // Manhattan on grid
            let mid_x = snap((a.x + b.x) / 2.0, grid);
            let path = [
                (a.x, a.y),
                (snap(a.x, grid), snap(a.y, grid)),
                (mid_x, snap(a.y, grid)),
                (mid_x, snap(b.y, grid)),
                (snap(b.x, grid), snap(b.y, grid)),
                (b.x, b.y),
            ];
            let layer = if a.layer == b.layer {
                a.layer.clone()
            } else {
                LAYER_TOP.to_string()
            };
            for (x, y) in path {
                extra.push(RouteSeg::Wire {
                    x,
                    y,
                    width,
                    layer: layer.clone(),
                    net: net.clone(),
                });
            }
        }
    }

    extra
}

fn snap(v: f64, grid: f64) -> f64 {
    (v / grid).round() * grid
}
