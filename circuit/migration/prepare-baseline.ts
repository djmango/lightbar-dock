type CircuitElement = Record<string, any> & { type: string }

const removedStatusReferences = new Set([
  "U1",
  "U2",
  "C1",
  "C2",
  "R1",
  "R2",
  "R3",
  "R4",
  "LED2",
  "LED3",
  "LED4",
  "LED5",
  "LED6",
  "LED7",
  "LED8",
  "LED9",
  "R22",
  "R26",
  "R30",
  "R34",
  "R38",
  "R42",
  "R46",
  "R50",
])

function hasForeignKey(element: CircuitElement, ids: Set<string>) {
  return Object.entries(element).some(([key, value]) => {
    if (!key.endsWith("_id")) return false
    return typeof value === "string" && ids.has(value)
  })
}

export function prepareMigratedPowerBoard(
  input: readonly CircuitElement[],
): CircuitElement[] {
  const sourceComponentIds = new Set(
    input
      .filter(
        (element) =>
          element.type === "source_component" &&
          removedStatusReferences.has(element.name),
      )
      .map((element) => element.source_component_id as string),
  )
  const pcbComponentIds = new Set(
    input
      .filter(
        (element) =>
          element.type === "pcb_component" &&
          sourceComponentIds.has(element.source_component_id),
      )
      .map((element) => element.pcb_component_id as string),
  )
  const sourcePortIds = new Set(
    input
      .filter(
        (element) =>
          element.type === "source_port" &&
          sourceComponentIds.has(element.source_component_id),
      )
      .map((element) => element.source_port_id as string),
  )
  const pcbPortIds = new Set(
    input
      .filter(
        (element) =>
          element.type === "pcb_port" &&
          pcbComponentIds.has(element.pcb_component_id),
      )
      .map((element) => element.pcb_port_id as string),
  )

  const removedTraceIds = new Set<string>()
  const traces = new Map<string, CircuitElement>()
  for (const element of input) {
    if (element.type !== "source_trace") continue
    const remainingPorts = (element.connected_source_port_ids ?? []).filter(
      (id: string) => !sourcePortIds.has(id),
    )
    if (remainingPorts.length === 0) {
      removedTraceIds.add(element.source_trace_id)
    } else {
      traces.set(element.source_trace_id, {
        ...element,
        connected_source_port_ids: remainingPorts,
      })
    }
  }

  const removedIds = new Set([
    ...sourceComponentIds,
    ...pcbComponentIds,
    ...sourcePortIds,
    ...pcbPortIds,
    ...removedTraceIds,
  ])

  return input.flatMap((element) => {
    if (element.type === "pcb_board") return []
    if (
      element.type === "source_trace" &&
      traces.has(element.source_trace_id)
    ) {
      return [traces.get(element.source_trace_id)!]
    }
    if (hasForeignKey(element, removedIds)) return []
    return [element]
  })
}
