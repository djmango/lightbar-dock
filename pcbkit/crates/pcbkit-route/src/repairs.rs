use pcbkit_core::{Board, RepairSpec, RouteSeg, LAYER_BOTTOM, LAYER_TOP};

/// Apply profile repairs; returns extra route segments to merge.
pub fn apply_repairs(board: &Board, repairs: &[RepairSpec]) -> Vec<RouteSeg> {
    let mut extra = Vec::new();
    for r in repairs {
        match r {
            RepairSpec::UsbCFlipPads {
                component,
                net,
                via_offset_mm,
            } => {
                extra.extend(usb_c_flip_pads(
                    board,
                    component,
                    net,
                    *via_offset_mm,
                ));
            }
        }
    }
    extra
}

/// Bridge USB-C flip pads for a net: place vias offset from the pad column and
/// connect with bottom-layer stubs. Mirrors the dock USB1 DP/DM fix without
/// mutating KiCad.
fn usb_c_flip_pads(
    board: &Board,
    component: &str,
    net: &str,
    via_offset_mm: f64,
) -> Vec<RouteSeg> {
    let pads: Vec<_> = board
        .pads
        .iter()
        .filter(|p| p.component.eq_ignore_ascii_case(component) && p.net == net)
        .collect();
    if pads.len() < 2 {
        return vec![];
    }

    // Pad column is along Y (vertical USB-C). `via_offset_mm` is a signed
    // board-X delta (negative = toward USB1's left-edge opening).
    let mean_x: f64 = pads.iter().map(|p| p.x).sum::<f64>() / pads.len() as f64;
    let via_x = mean_x + via_offset_mm;

    let width = board.min_trace_width.max(0.15);
    let mut segs = Vec::new();

    // Sort by Y so we bridge the pair(s) in order
    let mut sorted = pads;
    sorted.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal));

    for p in &sorted {
        let vx = via_x;
        let vy = p.y;
        // stub on pad layer to via
        segs.push(RouteSeg::Wire {
            x: p.x,
            y: p.y,
            width,
            layer: if p.layer == LAYER_BOTTOM {
                LAYER_BOTTOM.to_string()
            } else {
                LAYER_TOP.to_string()
            },
            net: net.to_string(),
        });
        segs.push(RouteSeg::Wire {
            x: vx,
            y: vy,
            width,
            layer: if p.layer == LAYER_BOTTOM {
                LAYER_BOTTOM.to_string()
            } else {
                LAYER_TOP.to_string()
            },
            net: net.to_string(),
        });
        segs.push(RouteSeg::Via {
            x: vx,
            y: vy,
            net: net.to_string(),
        });
    }

    // Bottom bridge between via positions
    if sorted.len() >= 2 {
        let first = sorted.first().unwrap();
        let last = sorted.last().unwrap();
        segs.push(RouteSeg::Wire {
            x: via_x,
            y: first.y,
            width,
            layer: LAYER_BOTTOM.to_string(),
            net: net.to_string(),
        });
        segs.push(RouteSeg::Wire {
            x: via_x,
            y: last.y,
            width,
            layer: LAYER_BOTTOM.to_string(),
            net: net.to_string(),
        });
    }

    segs
}
