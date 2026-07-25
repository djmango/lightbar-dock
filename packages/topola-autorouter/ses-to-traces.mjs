/**
 * Parse a Specctra SES (Topola / Freerouting) into tscircuit SimplifiedPcbTraces.
 * Coordinates: µm → mm; Y flipped back from KiCad Specctra convention.
 */

function umToMm(v) {
  return Number(v) / 1000
}

function layerToSimple(layer) {
  if (layer === "F.Cu") return "top"
  if (layer === "B.Cu") return "bottom"
  return String(layer).toLowerCase()
}

/**
 * @param {string} sesText
 * @param {number} [widthMm]
 */
export function sesToSimplifiedTraces(sesText, widthMm = 0.2) {
  /** @type {Map<string, Array<object>>} */
  const byNet = new Map()

  // Topola SES: (net name (wire (path LAYER W x y ...)) (via ...))
  const parts = sesText.split(/\n\s*\(net\s+/)
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i]
    const nameMatch = chunk.match(/^"?([^"\s)]+)"?/)
    if (!nameMatch) continue
    const net = nameMatch[1]
    if (!byNet.has(net)) byNet.set(net, [])
    const route = byNet.get(net)

    const wireRe = /\(wire\s*\(\s*path\s+(\S+)\s+([\d.eE+-]+)\s+([^)]+)\)/g
    let m
    while ((m = wireRe.exec(chunk))) {
      const layer = layerToSimple(m[1])
      const wUm = Number(m[2])
      const coords = m[3].trim().split(/\s+/).map(Number)
      for (let j = 0; j + 1 < coords.length; j += 2) {
        route.push({
          route_type: "wire",
          x: umToMm(coords[j]),
          y: -umToMm(coords[j + 1]),
          width: Number.isFinite(wUm) ? umToMm(wUm) : widthMm,
          layer,
        })
      }
    }

    const viaRe = /\(via\s+"?([^"\s)]+)"?\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g
    while ((m = viaRe.exec(chunk))) {
      route.push({
        route_type: "via",
        x: umToMm(Number(m[2])),
        y: -umToMm(Number(m[3])),
        from_layer: "top",
        to_layer: "bottom",
      })
    }
  }

  // Also accept Freerouting-style flat wires: (wire (path ...)(net ...))
  const flatWireRe =
    /\(wire\s*\(path\s+(\S+)\s+([\d.eE+-]+)\s+([^)]+)\)\s*\(net\s+"?([^")]+)"?\)/g
  let m
  while ((m = flatWireRe.exec(sesText))) {
    const layer = layerToSimple(m[1])
    const wUm = Number(m[2])
    const coords = m[3].trim().split(/\s+/).map(Number)
    const net = m[4].trim()
    if (!byNet.has(net)) byNet.set(net, [])
    const route = byNet.get(net)
    for (let i = 0; i + 1 < coords.length; i += 2) {
      route.push({
        route_type: "wire",
        x: umToMm(coords[i]),
        y: -umToMm(coords[i + 1]),
        width: Number.isFinite(wUm) ? umToMm(wUm) : widthMm,
        layer,
      })
    }
  }

  const traces = []
  let i = 0
  for (const [net, route] of byNet) {
    if (!route.length) continue
    i += 1
    traces.push({
      type: "pcb_trace",
      pcb_trace_id: `topola_${i}_${net}`.replace(/\s+/g, "_"),
      route,
    })
  }
  return traces
}
