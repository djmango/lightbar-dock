export const POWER_NETS = {
  gnd: "gnd",
  vinPd: "vin_pd",
  vinBarrel: "vin_barrel",
  vin12: "vin_12v",
  rail5vA: "rail_5v_a",
  rail5vB: "rail_5v_b",
  rail3v3: "rail_3v3",
  ldoVin: "ldo_vin",
  ch224kVdd: "ch224k_vdd",
} as const

export const PORT_NETS = Array.from({ length: 8 }, (_, index) => ({
  shuntIn: `port_${index}_shunt_in`,
  vbus: `port_${index}_vbus`,
  cc1: `port_${index}_cc1`,
  cc2: `port_${index}_cc2`,
  data: `port_${index}_data`,
})) as readonly {
  shuntIn: string
  vbus: string
  cc1: string
  cc2: string
  data: string
}[]

export function portRail(index: number) {
  return index < 4 ? POWER_NETS.rail5vA : POWER_NETS.rail5vB
}
