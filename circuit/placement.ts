export type PcbPlacement = {
  pcbX: number
  pcbY: number
  pcbRotation?: number
}

const BOARD_CENTER_X = 170
const BOARD_CENTER_Y = 73.5

export function fromKiCad(
  x: number,
  y: number,
  rotation = 0,
): PcbPlacement {
  return {
    pcbX: x - BOARD_CENTER_X,
    pcbY: BOARD_CENTER_Y - y,
    ...(rotation === 0 ? {} : { pcbRotation: -rotation }),
  }
}

export const INPUT_PLACEMENT = {
  /*
   * USB1 PD receptacle — opening MUST face the left board edge.
   * Native footprint opens toward +Y; KiCad −90° / tscircuit pcbRotation −90
   * maps that to −X (outboard). Pass KiCad angle +90 into fromKiCad so the
   * negation yields pcbRotation −90. Passing −90 here flips it inboard (twice
   * bitten). Matches place_board.py pd_input.connector @ 270° and Rev‑1.
   */
  USB1: fromKiCad(55, 62, 90),
  U5: fromKiCad(64, 62),
  R19: fromKiCad(64, 56),
  R72: fromKiCad(67, 56),
  C23: fromKiCad(69.5, 56),
  R17: fromKiCad(64, 67.5),
  LED1: fromKiCad(64, 70.5),
  R18: fromKiCad(67, 70.5),
  DC1: fromKiCad(61, 84),
  D4: fromKiCad(71.5, 74, 90),
  D3: fromKiCad(78, 74, 90),
  /*
   * Front-left pocket (left of L2 / buck B). Do not pack into the buck
   * passive field — that shorted vin_pd / ldo_vin / rail_5v_* in KiCad DRC.
   */
  LED10: fromKiCad(58, 89.5),
  R52: fromKiCad(62.5, 89.5),
  D5: fromKiCad(64, 92.5),
  D6: fromKiCad(78, 92.5),
  U12: fromKiCad(70, 87),
  C41: fromKiCad(74.5, 87),
  C40: fromKiCad(79, 87),
} as const

export const BUCK_PLACEMENT = {
  A: {
    U: fromKiCad(88, 57),
    L: fromKiCad(93, 67, 180),
    D: fromKiCad(94, 57, 90),
    boot: fromKiCad(85.5, 62, 90),
    inputCaps: [
      fromKiCad(82.5, 63, 90),
      fromKiCad(82.5, 58.5, 90),
      fromKiCad(82.5, 54, 90),
    ],
    outputCaps: [
      fromKiCad(101.5, 63, 90),
      fromKiCad(101.5, 67.5, 90),
      fromKiCad(104.5, 63, 90),
      fromKiCad(104.5, 67.5, 90),
    ],
    compensationResistor: fromKiCad(98.5, 53.5, 90),
    compensationCapacitors: [
      fromKiCad(98.5, 57, 90),
      fromKiCad(100.5, 57, 90),
    ],
    frequencyResistor: fromKiCad(100.5, 53.5, 90),
    feedbackResistors: [
      fromKiCad(103, 53.5, 90),
      fromKiCad(103, 57, 90),
    ],
    enableResistors: [
      fromKiCad(107.5, 53.5, 90),
      fromKiCad(107.5, 57, 90),
    ],
  },
  B: {
    U: fromKiCad(88, 78),
    L: fromKiCad(93, 87.5, 180),
    D: fromKiCad(94, 78, 90),
    boot: fromKiCad(85.5, 83, 90),
    inputCaps: [
      fromKiCad(82.5, 84, 90),
      fromKiCad(82.5, 79.5, 90),
      fromKiCad(82.5, 75, 90),
    ],
    outputCaps: [
      fromKiCad(101.5, 83.5, 90),
      fromKiCad(101.5, 88, 90),
      fromKiCad(104.5, 83.5, 90),
      fromKiCad(104.5, 88, 90),
    ],
    compensationResistor: fromKiCad(98.5, 74.5, 90),
    compensationCapacitors: [
      fromKiCad(98.5, 78, 90),
      fromKiCad(100.5, 78, 90),
    ],
    frequencyResistor: fromKiCad(100.5, 74.5, 90),
    feedbackResistors: [
      fromKiCad(103, 74.5, 90),
      fromKiCad(103, 78, 90),
    ],
    enableResistors: [
      fromKiCad(107.5, 74.5, 90),
      fromKiCad(107.5, 78, 90),
    ],
  },
} as const

export function chargePortPlacement(index: number) {
  const x = 121.25 + index * 22.5
  return {
    fuse: fromKiCad(x - 4, 55),
    senseResistor: fromKiCad(x + 4.5, 55),
    cc1Pullup: fromKiCad(x - 7.5, 63, 90),
    cc2Pullup: fromKiCad(x - 7.5, 69, 90),
    connector: fromKiCad(x, 66, 90),
    capacitor: fromKiCad(x + 7.5, 66, 90),
    /* Common-anode RGB status LED centered on the same X as the USB-C. */
    statusLed: fromKiCad(x, 91),
    statusLedRedResistor: fromKiCad(x - 2, 86.5, 90),
    statusLedGreenResistor: fromKiCad(x + 2, 86.5, 90),
  }
}

export const MOUNTING_HOLES = [
  fromKiCad(53, 53),
  fromKiCad(53, 72),
  fromKiCad(177, 59),
  fromKiCad(172.4, 94),
  fromKiCad(287, 59),
  fromKiCad(287, 94),
  fromKiCad(53, 94),
] as const
