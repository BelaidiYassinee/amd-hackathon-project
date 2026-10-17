"""Split each machine model into fault zones, so the UI can paint the failing part red.

Every part of a zone gets its own copy of its material, named "<material>__<zone>" (e.g. "M_PumpBlue__bearing").
The frontend finds a zone's materials by that suffix and tints them at runtime (model-viewer materials API).
The script also writes each zone's top-centre in glTF coordinates, for the hotspot label in the pop-up.

Run from frontend/ (idempotent: re-running on already split models gives the same result):
    blender -b --python scripts/blender/fault_zones.py
"""
import json
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "public", "models")
ZONES_OUT = os.path.join(ROOT, "src", "components", "factory", "modelZones.json")

# model -> zone -> object names. Objects in no zone (base, skid, frame) never turn red.
ZONES = {
    "pump": {
        "motor": ["P_MotorBody", "P_MotorDE", "P_MotorFins", "P_MotorFoot0", "P_MotorFoot1", "P_TerminalBox", "P_FanCover", "P_Nameplate"],
        "coupling": ["P_CouplingHubA", "P_CouplingHubB", "P_CouplingSpider", "P_Shaft"],
        "bearing": ["P_BearingFrame", "P_BearingCapDE", "P_BearingCapNDE", "P_BearingPedestal", "P_OilSight"],
        "casing": ["P_Volute", "P_BackPlate", "P_Suction", "P_SuctionFlange", "P_Discharge", "P_DischargeFlange", "P_CasingFoot"],
    },
    "compressor": {
        "motor": ["C_MotorBody", "C_MotorDE", "C_MotorFins", "C_MotorFoot0", "C_MotorFoot1", "C_TerminalBox", "C_FanCover", "C_Nameplate"],
        "coupling": ["C_Shaft"],
        "airend": ["C_AirendBlock", "C_AirendFoot", "C_LobeA", "C_LobeB", "C_InletValve", "C_AirFilter"],
        "separator": ["C_Separator", "C_SeparatorDome", "C_DischargePipe", "C_OutletPipe", "C_GaugeBody", "C_GaugeFace"],
    },
    "conveyor": {
        "motor": ["M_MotorBody", "M_MotorDE", "M_MotorFins", "M_MotorStand", "M_TerminalBox", "M_FanCover"],
        "gearbox": ["M_Gearbox", "M_GearboxCover", "M_DrumShaft"],
        "belt": ["M_BeltTop", "M_BeltReturn", "M_HeadDrum", "M_HeadWrap", "M_TailDrum", "M_TailWrap"],
    },
}


def base_name(material_name: str) -> str:
    return material_name.split("__")[0]


def split(model: str, zones: dict[str, list[str]]) -> dict:
    path = os.path.join(MODELS, f"{model}.glb")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    objects = {o.name: o for o in bpy.data.objects if o.type == "MESH"}

    copies: dict[tuple[str, str], bpy.types.Material] = {}
    centres = {}
    for zone, names in zones.items():
        missing = [n for n in names if n not in objects]
        if missing:
            raise SystemExit(f"{model}: zone {zone} has unknown objects {missing}")
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for name in names:
            obj = objects[name]
            for slot in obj.material_slots:
                if slot.material is None:
                    continue
                key = (base_name(slot.material.name), zone)
                if key not in copies:
                    if slot.material.name == f"{key[0]}__{zone}":  # already split by an earlier run
                        copies[key] = slot.material
                    else:
                        copies[key] = slot.material.copy()
                        copies[key].name = f"{key[0]}__{zone}"
                slot.material = copies[key]
            for corner in obj.bound_box:
                p = obj.matrix_world @ Vector(corner)
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))
        # Blender is Z-up, glTF is Y-up: (x, y, z) -> (x, z, -y). The label sits on top of the zone.
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        centres[zone] = [round(cx, 3), round(hi.z, 3), round(-cy, 3)]

    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False)
    print(f"{model}: {len(copies)} zone materials, zones {list(zones)}")
    return centres


out = {model: split(model, zones) for model, zones in ZONES.items()}
with open(ZONES_OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)
    f.write("\n")
print("wrote", ZONES_OUT)
