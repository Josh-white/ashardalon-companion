"""Builds a chunky low-poly orc placeholder and exports it as one .glb for the 3D board.

Run it in Blender (3.6, 4.x or 5.x):
  * Scripting workspace: open this file (or paste it), press Run Script (Alt+P).
  * Or headless:  blender --background --python make-test-orc.py -- /path/to/orc.glb

It matches the hero figures on the 3D board (KayKit Adventurers in src/models):
  * about 2.4 Blender units tall, so the board's figure SCALE (0.44) makes it one square tall,
  * faces Blender's -Y (front view, numpad 1), which is glTF/three.js +Z, the way the
    board's face() turns figures,
  * origin on the floor between the feet.

Everything is one mesh object with flat-shaded matte materials and no textures, so the
.glb is a few tens of KB. Nothing in the scene is kept: it clears the file first.
"""

import math
import os
import sys

import bpy

# ---- Settings ----------------------------------------------------------------------------

# Where the .glb goes. A path after "--" on the command line wins.
OUTPUT_PATH = os.path.join(os.path.expanduser("~"), "test-orc.glb")
# Final height in Blender units (KayKit heroes are about 2.5).
TARGET_HEIGHT = 2.4
# Dark grey-green skin, plus bone for tusks/horns and dark iron for the belt and club.
SKIN = (0.06, 0.09, 0.05)
BONE = (0.62, 0.57, 0.45)
IRON = (0.05, 0.05, 0.055)
# False = everything in the skin colour (one material only).
ACCENTS = True
# Fully matte (no shine).
ROUGHNESS = 1.0

argv = sys.argv
if "--" in argv and len(argv) > argv.index("--") + 1:
    OUTPUT_PATH = os.path.abspath(os.path.expanduser(argv[argv.index("--") + 1]))


# ---- 1. Clear the scene --------------------------------------------------------------------

def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    # Orphans left by the default cube, camera and light.
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


# ---- 2. Build the orc from primitives ---------------------------------------------------

def material(name, rgb):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = ROUGHNESS
        bsdf.inputs["Metallic"].default_value = 0.0
    mat.diffuse_color = (*rgb, 1.0)
    mat.roughness = ROUGHNESS
    return mat


parts = []


def keep(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj


def box(name, loc, size, mat, rot=(0, 0, 0)):
    """A cube `size` (x, y, z) across, centred on `loc`."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    return keep(obj, mat)


def ball(name, loc, radius, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    return keep(obj, mat)


def spike(name, loc, radius, depth, mat, rot=(0, 0, 0), sides=5):
    """A cone pointing along its own +Z, turned by `rot`."""
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=0, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return keep(obj, mat)


def rod(name, loc, radius, depth, mat, rot=(0, 0, 0), sides=6, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=radius if top is None else top, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return keep(obj, mat)


def build_orc():
    skin = material("Orc_Skin", SKIN)
    bone = material("Orc_Bone", BONE) if ACCENTS else skin
    iron = material("Orc_Iron", IRON) if ACCENTS else skin
    front = -1  # Blender -Y is the front.

    # Legs and feet: short and wide apart.
    for side in (-1, 1):
        x = 0.28 * side
        box(f"Leg_{side}", (x, 0, 0.42), (0.30, 0.32, 0.55), skin)
        box(f"Foot_{side}", (x, 0.06 * front, 0.08), (0.36, 0.48, 0.16), iron)

    # Hips, belt, and a big barrel chest that leans forward a little.
    box("Hips", (0, 0, 0.78), (0.82, 0.46, 0.26), skin)
    box("Belt", (0, 0, 0.92), (0.88, 0.50, 0.12), iron)
    box("Chest", (0, 0.04 * front, 1.30), (1.02, 0.62, 0.78), skin, rot=(math.radians(-8), 0, 0))
    box("Belly", (0, 0.24 * front, 1.08), (0.70, 0.22, 0.38), skin)

    # Shoulder pads with spikes, hunched forward.
    for side in (-1, 1):
        x = 0.62 * side
        ball(f"Shoulder_{side}", (x, 0.02 * front, 1.62), 0.26, iron, scale=(1.1, 1.0, 0.8))
        spike(f"ShoulderSpike_{side}", (x * 1.08, 0.02 * front, 1.86), 0.08, 0.24, bone)

    # Long arms hanging to the knees, big fists.
    for side in (-1, 1):
        x = 0.72 * side
        box(f"UpperArm_{side}", (x, 0.04 * front, 1.30), (0.24, 0.26, 0.50), skin, rot=(0, math.radians(-8 * side), 0))
        box(f"Forearm_{side}", (x + 0.04 * side, 0.12 * front, 0.92), (0.26, 0.28, 0.44), skin, rot=(math.radians(18), 0, 0))
        box(f"Fist_{side}", (x + 0.05 * side, 0.20 * front, 0.64), (0.30, 0.30, 0.26), skin)

    # Club in the right hand, resting on the floor in front.
    rod("Club", (0.80, 0.42 * front, 0.48), 0.07, 0.86, iron, rot=(math.radians(-30), 0, 0), top=0.13)

    # Head sunk between the shoulders and pushed forward.
    head_y = 0.20 * front
    ball("Head", (0, head_y, 1.88), 0.34, skin, scale=(1.05, 1.0, 0.95))
    box("Brow", (0, head_y + 0.22 * front, 1.95), (0.50, 0.12, 0.10), skin)
    box("Jaw", (0, head_y + 0.14 * front, 1.70), (0.46, 0.34, 0.20), skin)
    for side in (-1, 1):
        # Tusks up from the jaw, horns up and out, pointy ears to the sides.
        spike(f"Tusk_{side}", (0.15 * side, head_y + 0.30 * front, 1.82), 0.045, 0.18, bone, rot=(math.radians(10), 0, 0), sides=4)
        spike(f"Horn_{side}", (0.20 * side, head_y, 2.14), 0.07, 0.30, bone, rot=(0, math.radians(28 * side), 0))
        spike(f"Ear_{side}", (0.34 * side, head_y + 0.04, 1.90), 0.07, 0.26, skin, rot=(0, math.radians(80 * side), 0), sides=4)
        box(f"Eye_{side}", (0.11 * side, head_y + 0.29 * front, 1.88), (0.08, 0.03, 0.05), iron)


# ---- 3. Join, flat shade, size it, origin on the floor -------------------------------------

def join_parts(name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    orc = bpy.context.active_object
    orc.name = name
    orc.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Faceted low-poly look.
    for poly in orc.data.polygons:
        poly.use_smooth = False

    # Scale to TARGET_HEIGHT, then put the origin on the floor, centred between the feet.
    zs = [v.co.z for v in orc.data.vertices]
    k = TARGET_HEIGHT / (max(zs) - min(zs))
    xs = [v.co.x for v in orc.data.vertices]
    ys = [v.co.y for v in orc.data.vertices]
    cx, cy, bottom = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    for v in orc.data.vertices:
        v.co.x = (v.co.x - cx) * k
        v.co.y = (v.co.y - cy) * k
        v.co.z = (v.co.z - bottom) * k
    orc.location = (0, 0, 0)
    orc.data.update()
    return orc


# ---- 4. Export ------------------------------------------------------------------------------

def export_glb(obj, path):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # GLB packs geometry and materials (and any textures) into the one file.
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


clear_scene()
build_orc()
orc = join_parts("Test_Orc")
export_glb(orc, OUTPUT_PATH)

dims = orc.dimensions
size_kb = os.path.getsize(OUTPUT_PATH) / 1024
tris = sum(len(p.vertices) - 2 for p in orc.data.polygons)
print(f"Test orc: {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f} units, {tris} triangles")
print(f"Saved {OUTPUT_PATH} ({size_kb:.1f} KB)")
if size_kb > 5 * 1024:
    print("WARNING: over 5 MB")
