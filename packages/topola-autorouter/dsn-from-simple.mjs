/**
 * Build a minimal Specctra DSN from tscircuit SimpleRouteJson for Topola.
 * Coordinates: mm → µm; Y flipped to match KiCad Specctra export convention.
 */

function mmToUm(v) {
  return Math.round(Number(v) * 1000)
}

function layerName(layer) {
  const l = String(layer || "top").toLowerCase()
  if (l === "top" || l === "f.cu" || l === "front") return "F.Cu"
  if (l === "bottom" || l === "b.cu" || l === "back") return "B.Cu"
  return String(layer)
}

/**
 * @param {object} srj
 * @returns {string}
 */
export function dsnFromSimpleRouteJson(srj) {
  const bounds = srj.bounds || { minX: 0, maxX: 100, minY: 0, maxY: 50 }
  const widthUm = mmToUm(srj.minTraceWidth || 0.2)
  const clearanceUm = widthUm
  const viaDiam = mmToUm(0.6)
  const viaDrill = mmToUm(0.3)
  const padD = Math.max(widthUm * 3, 600)

  const minX = mmToUm(bounds.minX)
  const maxX = mmToUm(bounds.maxX)
  const minY = mmToUm(bounds.minY)
  const maxY = mmToUm(bounds.maxY)
  const boundary = `${maxX} ${-minY}  ${minX} ${-minY}  ${minX} ${-maxY}  ${maxX} ${-maxY}  ${maxX} ${-minY}`

  const layerCount = Math.max(1, Number(srj.layerCount || 2))
  const layers = [
    `    (layer F.Cu\n      (type signal)\n      (property\n        (index 0)\n      )\n    )`,
  ]
  if (layerCount > 1) {
    layers.push(
      `    (layer B.Cu\n      (type signal)\n      (property\n        (index 1)\n      )\n    )`,
    )
  }

  const keepouts = []
  for (const obs of srj.obstacles || []) {
    const cx = mmToUm(obs.center?.x ?? 0)
    const cy = -mmToUm(obs.center?.y ?? 0)
    const w = mmToUm(obs.width ?? 1)
    const h = mmToUm(obs.height ?? 1)
    for (const ly of obs.layers || ["top"]) {
      keepouts.push(
        `    (keepout "" (rect ${layerName(ly)} ${cx - w / 2} ${cy - h / 2} ${cx + w / 2} ${cy + h / 2}))`,
      )
    }
  }

  const images = []
  const places = []
  const nets = []
  let pinIdx = 0

  for (const conn of srj.connections || []) {
    const netName = String(conn.name || `net_${pinIdx}`).replace(/"/g, "")
    const pinsForNet = []
    for (const pt of conn.pointsToConnect || []) {
      pinIdx += 1
      const ref = `T${pinIdx}`
      const x = mmToUm(pt.x)
      const y = -mmToUm(pt.y)
      const ly = layerName(pt.layer)
      images.push(`    (image ${ref}
      (outline (path ${ly} 0  ${-padD / 2} ${-padD / 2}  ${padD / 2} ${-padD / 2}  ${padD / 2} ${padD / 2}  ${-padD / 2} ${padD / 2}  ${-padD / 2} ${-padD / 2}))
      (pin Round 1 0 0)
    )`)
      places.push(`    (component ${ref}
      (place ${ref} ${x} ${y} front 0)
    )`)
      pinsForNet.push(`${ref}-1`)
    }
    if (pinsForNet.length >= 2) {
      nets.push(
        `    (net "${netName}"\n      (pins ${pinsForNet.join(" ")})\n    )`,
      )
    }
  }

  // Library order must be images then padstacks (Topola Library::read_dsn).
  return `(pcb "topola-simple-route"
  (parser
    (string_quote ")
    (space_in_quoted_tokens on)
    (host_cad "lightbar-dock/topola-autorouter")
    (host_version "0.1.0")
  )
  (resolution um 10)
  (unit um)
  (structure
${layers.join("\n")}
    (boundary
      (path pcb 0  ${boundary})
    )
${keepouts.join("\n")}
    (via "Via[0-1]_${viaDiam}:${viaDrill}_um")
    (rule
      (width ${widthUm})
      (clearance ${clearanceUm})
    )
  )
  (placement
${places.join("\n")}
  )
  (library
${images.join("\n")}
    (padstack "Via[0-1]_${viaDiam}:${viaDrill}_um"
      (shape (circle F.Cu ${viaDiam}))
      (shape (circle B.Cu ${viaDiam}))
    )
    (padstack Round
      (shape (circle F.Cu ${padD}))
      (shape (circle B.Cu ${padD}))
    )
  )
  (network
${nets.join("\n")}
  )
  (wiring
  )
)
`
}