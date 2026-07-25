// Generated from parts/BHFUSE_BSMD1812_150_33V/F1812.kicad_mod by scripts/convert-footprints.mjs.
export const Polyfuse1812Footprint = [
  {
    "type": "source_component",
    "source_component_id": "source_component_0",
    "supplier_part_numbers": {}
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_0",
    "source_component_id": "source_component_0",
    "center": {
      "x": 0,
      "y": 0
    },
    "rotation": 0,
    "size": {
      "width": 0,
      "height": 0
    }
  },
  {
    "type": "source_port",
    "source_port_id": "source_port_0",
    "source_component_id": "source_component_0",
    "name": "2",
    "port_hints": [
      "2"
    ],
    "pin_number": 2,
    "pin_label": "pin2"
  },
  {
    "type": "schematic_port",
    "schematic_port_id": "schematic_port_1",
    "source_port_id": "source_port_0",
    "schematic_component_id": "schematic_component_0",
    "center": {
      "x": 0,
      "y": 0
    }
  },
  {
    "type": "source_port",
    "source_port_id": "source_port_2",
    "source_component_id": "source_component_0",
    "name": "1",
    "port_hints": [
      "1"
    ],
    "pin_number": 1,
    "pin_label": "pin1"
  },
  {
    "type": "schematic_port",
    "schematic_port_id": "schematic_port_3",
    "source_port_id": "source_port_2",
    "schematic_component_id": "schematic_component_0",
    "center": {
      "x": 0,
      "y": 0
    }
  },
  {
    "type": "pcb_component",
    "source_component_id": "source_component_0",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "center": {
      "x": 0,
      "y": 0
    },
    "rotation": 0,
    "width": 5.11,
    "height": 3.5
  },
  {
    "type": "pcb_port",
    "pcb_port_id": "pcb_port_0",
    "source_port_id": "source_port_0",
    "pcb_component_id": "pcb_component_0",
    "x": 1.85,
    "y": 0,
    "layers": [
      "top"
    ]
  },
  {
    "type": "pcb_port",
    "pcb_port_id": "pcb_port_1",
    "source_port_id": "source_port_2",
    "pcb_component_id": "pcb_component_0",
    "x": -1.85,
    "y": 0,
    "layers": [
      "top"
    ]
  },
  {
    "type": "pcb_smtpad",
    "pcb_smtpad_id": "pcb_smtpad_0",
    "shape": "rect",
    "x": 1.85,
    "y": 0,
    "width": 1.41,
    "height": 3.5,
    "layer": "top",
    "pcb_component_id": "pcb_component_0",
    "port_hints": [
      "pin2"
    ],
    "pcb_port_id": "pcb_port_0",
    "pin_number": 2,
    "pin_label": "pin2"
  },
  {
    "type": "pcb_smtpad",
    "pcb_smtpad_id": "pcb_smtpad_1",
    "shape": "rect",
    "x": -1.85,
    "y": 0,
    "width": 1.41,
    "height": 3.5,
    "layer": "top",
    "pcb_component_id": "pcb_component_0",
    "port_hints": [
      "pin1"
    ],
    "pcb_port_id": "pcb_port_1",
    "pin_number": 1,
    "pin_label": "pin1"
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_0",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "route": [
      {
        "x": -2.79,
        "y": 1.8
      },
      {
        "x": -2.79,
        "y": -1.76
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_1",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "route": [
      {
        "x": 2.79,
        "y": 1.78
      },
      {
        "x": 2.79,
        "y": -1.78
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_2",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "route": [
      {
        "x": -1.27,
        "y": -2.03
      },
      {
        "x": -2.54,
        "y": -2.03
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_3",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "route": [
      {
        "x": 1.27,
        "y": -2.03
      },
      {
        "x": 2.54,
        "y": -2.03
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_4",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "route": [
      {
        "x": -2.54,
        "y": 2.03
      },
      {
        "x": -1.23,
        "y": 2.03
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_5",
    "pcb_component_id": "pcb_component_0",
    "layer": "top",
    "route": [
      {
        "x": 2.54,
        "y": 2.03
      },
      {
        "x": 1.27,
        "y": 2.03
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_6",
    "layer": "top",
    "pcb_component_id": "pcb_component_0",
    "route": [
      {
        "x": -2.0816681711721685e-17,
        "y": -0.63
      },
      {
        "x": -0.005366000000000072,
        "y": 0.010959700000000072
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_path",
    "pcb_silkscreen_path_id": "pcb_silkscreen_path_7",
    "layer": "top",
    "pcb_component_id": "pcb_component_0",
    "route": [
      {
        "x": -1.3877787807814457e-17,
        "y": 0.63
      },
      {
        "x": 0.0053660000000000305,
        "y": -0.010959700000000072
      }
    ],
    "stroke_width": 0.15
  },
  {
    "type": "pcb_silkscreen_text",
    "layer": "top",
    "font": "tscircuit2024",
    "pcb_component_id": "pcb_component_0",
    "anchor_position": {
      "x": 0,
      "y": 4
    },
    "anchor_alignment": "center",
    "text": "REF**"
  },
  {
    "type": "pcb_fabrication_note_text",
    "layer": "top",
    "font": "tscircuit2024",
    "pcb_component_id": "pcb_component_0",
    "anchor_position": {
      "x": 0,
      "y": -4
    },
    "anchor_alignment": "center",
    "text": "F1812"
  }
] as any
