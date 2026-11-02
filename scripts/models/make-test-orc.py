"""Builds the two orc monsters as .glb files for the 3D board: Orc Smasher (a big spiked mace)
and Orc Archer (a bow and a quiver).

Run it in Blender (tested headless on 5.2; written for 3.6 and newer):
  * Scripting workspace: open this file (or paste it), press Run Script (Alt+P).
  * Or headless:  blender --background --python make-test-orc.py -- /path/to/folder
One run saves orc-smasher.glb and orc-archer.glb in OUTPUT_FOLDER.

It is made like the hero figures on the 3D board (KayKit Adventurers in src/models):
  * a big head on a short body, rounded (bevelled) shapes, a face and gear,
  * one mesh with ONE material whose colours come from a tiny packed palette texture,
  * a skeleton with moves named like the heroes' clips (Idle, Walking_A,
    1H_Melee_Attack_Chop, 1H_Ranged_Shoot (archer), Hit_A, Dodge_Right, Death_A,
    Death_A_Pose, Cheer), so
    src/components/figureModels.js could play them the same way,
  * about 2.4 units tall (the board's figure SCALE of 0.44 makes it one square tall),
  * facing Blender's -Y (front view, numpad 1), which is three.js +Z,
  * origin on the floor between the feet.

It clears the open file first, so run it in a new file.
"""

import math
import os
import sys

import bpy  # first: outside Blender, the bpy module brings bmesh and mathutils with it
import bmesh
from mathutils import Matrix, Vector

# ---- Settings ----------------------------------------------------------------------------

# Where the .glb files go. A folder after "--" on the command line wins.
OUTPUT_FOLDER = os.path.expanduser("~")
# Which orcs to make: file name and weapon. Remove a line to make only the other.
ORCS = [
    ("orc-smasher.glb", "mace"),
    ("orc-archer.glb", "bow"),
]
# Final height in Blender units (KayKit heroes are about 2.5).
TARGET_HEIGHT = 2.4
# False = no skeleton or moves (a still figure).
ANIMATE = True
FPS = 30

# The palette (sRGB hex). Each part of the orc takes one of these colours.
PALETTE = {
    "skin": "52643c",        # dark grey-green
    "skin_dark": "3a472b",
    "cloth": "6b4a2f",
    "leather": "4a3324",
    "leather_dark": "2b1f18",
    "iron": "8a9099",
    "iron_dark": "45484f",
    "bone": "e2d6b4",
    "eye": "f0bd2c",
    "black": "141414",
    "hair": "1d1916",
    "red": "8c2a22",
    "wood": "7a5230",
    "feather": "c9c2b0",
}

argv = sys.argv
if "--" in argv and len(argv) > argv.index("--") + 1:
    OUTPUT_FOLDER = os.path.abspath(os.path.expanduser(argv[argv.index("--") + 1]))

COLOURS = list(PALETTE)
SWATCH = 4  # pixels per colour in the palette texture
DEG = math.radians


# ---- 1. Clear the scene --------------------------------------------------------------------

def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights,
                   bpy.data.armatures, bpy.data.actions, bpy.data.images):
        # Twice: a mesh frees its material, a material frees its image.
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)
    for block in list(bpy.data.materials) + list(bpy.data.images):
        if block.users == 0:
            (bpy.data.materials if isinstance(block, bpy.types.Material) else bpy.data.images).remove(block)


# ---- 2. One material with a tiny palette texture -------------------------------------------

def srgb(hex_):
    return tuple(int(hex_[i:i + 2], 16) / 255 for i in (0, 2, 4))


def palette_material():
    width = SWATCH * len(COLOURS)
    img = bpy.data.images.new("Orc_Palette", width, SWATCH, alpha=False)
    pixels = []
    for _row in range(SWATCH):
        for name in COLOURS:
            pixels.extend([*srgb(PALETTE[name]), 1.0] * SWATCH)
    img.pixels[:] = pixels
    img.file_format = "PNG"
    img.pack()

    mat = bpy.data.materials.new("Orc")
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def swatch_uv(colour):
    i = COLOURS.index(colour)
    return ((i + 0.5) / len(COLOURS), 0.5)


# ---- 3. Parts: rounded boxes, spheres and cones, each one colour and one bone ---------------

parts = []


def finish(bm, name, colour, bone, loc, rot, scale=None):
    """Scale (if given), rotate, move, paint and keep one part."""
    if scale:
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    if any(rot):
        m = (Matrix.Rotation(DEG(rot[2]), 3, "Z") @ Matrix.Rotation(DEG(rot[1]), 3, "Y")
             @ Matrix.Rotation(DEG(rot[0]), 3, "X"))
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=m, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    uv = bm.loops.layers.uv.verify()
    u, v = swatch_uv(colour)
    for face in bm.faces:
        face.smooth = True
        for loop in face.loops:
            loop[uv].uv = (u, v)
    # Hard edges where faces meet at a sharp angle, soft everywhere else.
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > DEG(50):
            edge.smooth = False
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    parts.append(obj)
    return obj


def box(name, colour, bone, loc, size, bevel=0.05, segments=2, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bevel = min(bevel, min(size) * 0.49)
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=bevel, offset_type="OFFSET",
                        segments=segments, profile=0.5, affect="EDGES")
    return finish(bm, name, colour, bone, loc, rot)


def sphere(name, colour, bone, loc, radius, scale=(1, 1, 1), rot=(0, 0, 0), segments=12, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    return finish(bm, name, colour, bone, loc, rot, scale)


def cone(name, colour, bone, loc, radius, depth, rot=(0, 0, 0), scale=None, sides=8, tip=0.0):
    """Points along +Z before `rot`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius,
                          radius2=tip, depth=depth)
    return finish(bm, name, colour, bone, loc, rot, scale)


def build_orc(weapon):
    # Feet and legs.
    for side, tag in ((1, "L"), (-1, "R")):
        x = 0.26 * side
        leg = f"leg.{tag}"
        box(f"Boot.{tag}", "leather_dark", leg, (x, -0.04, 0.13), (0.36, 0.48, 0.26), bevel=0.08)
        box(f"BootToe.{tag}", "leather_dark", leg, (x, -0.22, 0.09), (0.30, 0.20, 0.18), bevel=0.07)
        box(f"Cuff.{tag}", "hair", leg, (x, -0.02, 0.29), (0.40, 0.42, 0.10), bevel=0.04)
        box(f"Leg.{tag}", "skin", leg, (x, 0, 0.45), (0.30, 0.32, 0.30), bevel=0.09)

    # Hips: pants, belt, buckle and a red flap.
    box("Pants", "cloth", "hips", (0, 0, 0.66), (0.80, 0.52, 0.30), bevel=0.12, segments=3)
    box("Belt", "leather", "hips", (0, 0, 0.80), (0.88, 0.58, 0.12), bevel=0.04)
    box("Buckle", "iron", "hips", (0, -0.30, 0.80), (0.18, 0.06, 0.15), bevel=0.02)
    box("Flap", "red", "hips", (0, -0.28, 0.60), (0.30, 0.05, 0.34), bevel=0.02, rot=(-6, 0, 0))

    # Barrel body, belly and a strap across it.
    box("Torso", "skin", "body", (0, 0, 1.12), (0.98, 0.64, 0.66), bevel=0.22, segments=3)
    sphere("Belly", "skin", "body", (0, -0.13, 0.98), 0.30, scale=(1.25, 0.85, 0.9))
    box("Strap", "leather", "body", (0, 0, 1.12), (0.14, 0.70, 0.95), bevel=0.02, rot=(0, 40, 0))
    box("StrapStud", "iron", "body", (0.04, -0.36, 1.16), (0.08, 0.04, 0.08), bevel=0.015)

    # Left shoulder: an iron pauldron with bone spikes. Right shoulder: a leather pad.
    sphere("Pauldron", "iron_dark", "body", (0.54, 0, 1.44), 0.28, scale=(1.15, 1.05, 0.72))
    box("PauldronRim", "iron", "body", (0.56, 0, 1.33), (0.56, 0.56, 0.06), bevel=0.02)
    for i, (dx, dy) in enumerate(((0.0, -0.12), (0.08, 0.05), (-0.06, 0.14))):
        cone(f"Spike{i}", "bone", "body", (0.58 + dx, dy, 1.62), 0.06, 0.22, rot=(0, 15, 0), sides=6)
    box("Pad", "leather", "body", (-0.52, 0, 1.43), (0.36, 0.40, 0.12), bevel=0.04, rot=(0, -12, 0))

    # Arms: shoulder, bracer, fist.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"UpperArm.{tag}", "skin", arm, (0.60 * side, 0, 1.20), 0.17, scale=(1, 1, 1.35))
        box(f"Bracer.{tag}", "leather", arm, (0.64 * side, -0.02, 0.93), (0.29, 0.29, 0.30), bevel=0.07)
        box(f"BracerBand.{tag}", "iron_dark", arm, (0.64 * side, -0.02, 1.01), (0.31, 0.31, 0.05), bevel=0.02)
        sphere(f"Fist.{tag}", "skin", arm, (0.65 * side, -0.05, 0.72), 0.17, scale=(1, 1.1, 0.95))

    if weapon == "mace":
        build_mace()
    else:
        build_bow()

    # Head: big, with a heavy jaw, tusks, nose, angry brows, yellow eyes, ears and a mohawk.
    hy = -0.04
    sphere("Skull", "skin", "head", (0, hy, 1.90), 0.42, scale=(1.08, 0.98, 0.92), segments=16, rings=10)
    box("Jaw", "skin", "head", (0, hy - 0.14, 1.66), (0.70, 0.48, 0.30), bevel=0.12, segments=3)
    box("Mouth", "black", "head", (0, hy - 0.385, 1.71), (0.40, 0.03, 0.04), bevel=0.01)
    box("Nose", "skin_dark", "head", (0, hy - 0.45, 1.86), (0.16, 0.12, 0.12), bevel=0.04)
    for side, tag in ((1, "L"), (-1, "R")):
        x = side
        cone(f"Tusk.{tag}", "bone", "head", (0.17 * x, hy - 0.37, 1.78), 0.05, 0.18,
             rot=(14, -14 * x, 0), sides=6)
        box(f"Brow.{tag}", "skin_dark", "head", (0.15 * x, hy - 0.39, 2.01), (0.26, 0.12, 0.08),
            bevel=0.03, rot=(0, -16 * x, 0))
        sphere(f"Eye.{tag}", "eye", "head", (0.15 * x, hy - 0.375, 1.92), 0.07, scale=(1, 0.55, 0.8))
        sphere(f"Pupil.{tag}", "black", "head", (0.15 * x, hy - 0.41, 1.92), 0.032,
               scale=(1, 0.5, 1.2), segments=8, rings=6)
        cone(f"Ear.{tag}", "skin", "head", (0.47 * x, hy + 0.02, 1.95), 0.10, 0.36,
             rot=(0, 72 * x, 0), scale=(1, 0.45, 1), sides=6)
        cone(f"Ring.{tag}", "iron", "head", (0.50 * x, hy + 0.02, 1.88), 0.035, 0.03,
             rot=(90, 0, 0), sides=8, tip=0.035)
        box(f"Paint.{tag}", "red", "head", (0.22 * x, hy - 0.37, 1.80), (0.12, 0.03, 0.035), bevel=0.01,
            rot=(0, 18 * x, 0))
    box("Mohawk", "hair", "head", (0, hy + 0.04, 2.27), (0.12, 0.66, 0.18), bevel=0.05, rot=(-8, 0, 0))
    cone("Topknot", "hair", "head", (0, hy + 0.34, 2.24), 0.07, 0.30, rot=(-60, 0, 0), sides=6)


FIST_R = Vector((-0.65, -0.05, 0.72))
FIST_L = Vector((0.65, -0.05, 0.72))


def build_mace():
    """A big spiked mace in the right fist, its head resting forward and down."""
    d = Vector((0, -0.866, -0.5))  # 30 degrees below forward
    tilt = (120, 0, 0)  # turns a +Z part to point along d
    cone("MaceHandle", "wood", "arm.R", FIST_R + d * 0.30, 0.05, 0.80, rot=tilt, sides=6, tip=0.06)
    cone("MaceGrip", "leather_dark", "arm.R", FIST_R + d * 0.02, 0.065, 0.30, rot=tilt, sides=6, tip=0.065)
    cone("MaceCap", "iron_dark", "arm.R", FIST_R - d * 0.16, 0.07, 0.06, rot=tilt, sides=6, tip=0.04)
    head = FIST_R + d * 0.78
    cone("MaceCollar", "iron_dark", "arm.R", FIST_R + d * 0.60, 0.10, 0.10, rot=tilt, sides=8, tip=0.13)
    sphere("MaceHead", "iron_dark", "arm.R", head, 0.21, segments=10, rings=7)
    box("MaceBand", "iron", "arm.R", head, (0.46, 0.46, 0.08), bevel=0.03, rot=tilt)
    spikes = [((1, 0, 0), (0, 90, 0)), ((-1, 0, 0), (0, -90, 0)), ((0, 0, 1), (0, 0, 0)),
              ((0, 0, -1), (180, 0, 0)), ((0, 1, 0), (-90, 0, 0)), ((0, -1, 0), (90, 0, 0)),
              ((0, -0.866, -0.5), (120, 0, 0))]
    for i, (direction, rot) in enumerate(spikes):
        cone(f"MaceSpike{i}", "bone", "arm.R", head + Vector(direction) * 0.24, 0.06, 0.16, rot=rot, sides=5)


def build_bow():
    """A bow in the left fist (it stands upright when the arm comes up to shoot) and a quiver."""
    # Hanging down, the bow lies front to back with its belly under the fist and the string
    # on top; raising the arm forward turns it upright with the string toward the orc.
    half, bend, steps = 0.70, 0.18, 8
    points = [FIST_L + Vector((0, half * t, bend * t * t))
              for t in (-1 + 2 * i / steps for i in range(steps + 1))]
    for i in range(steps):
        a, b = points[i], points[i + 1]
        mid, span = (a + b) / 2, b - a
        tilt = math.degrees(math.atan2(span.z, span.y))
        thick = 0.095 if abs(i - steps / 2 + 0.5) < 1.5 else 0.07
        box(f"Bow{i}", "wood", "arm.L", mid, (thick, span.length + 0.03, thick), bevel=0.015, rot=(tilt, 0, 0))
    box("BowGrip", "leather_dark", "arm.L", FIST_L + Vector((0, 0, -0.01)), (0.10, 0.18, 0.10), bevel=0.03)
    for i in (0, steps):
        cone(f"BowTip{i}", "bone", "arm.L", points[i] + Vector((0, 0.04 * (1 if i else -1), 0.02)), 0.035, 0.10,
             rot=(90 if i == 0 else -90, 0, 0), sides=5)
    string_z = points[0].z
    box("BowString", "feather", "arm.L", Vector((FIST_L.x, FIST_L.y, string_z)), (0.015, half * 2, 0.015), bevel=0)

    # Quiver on the back, slanting over the right shoulder, with feathered arrows.
    tilt = (-12, -22, 0)
    base = Vector((0.12, 0.40, 1.10))
    cone("Quiver", "leather", "body", base, 0.12, 0.62, rot=tilt, sides=8, tip=0.13)
    cone("QuiverRim", "leather_dark", "body", base + Vector((-0.11, 0.06, 0.28)), 0.14, 0.06, rot=tilt, sides=8, tip=0.14)
    for i, (dx, dy) in enumerate(((-0.04, -0.03), (0.04, 0.02), (-0.01, 0.05))):
        top = base + Vector((-0.15 + dx, 0.08 + dy, 0.44))
        cone(f"Shaft{i}", "wood", "body", top + Vector((0.02, 0, -0.08)), 0.015, 0.22, rot=tilt, sides=4, tip=0.015)
        box(f"Fletch{i}", "red" if i == 1 else "feather", "body", top, (0.07, 0.015, 0.12), bevel=0.005, rot=tilt)
    box("QuiverStrap", "leather", "body", (0, 0, 1.12), (0.12, 0.70, 0.95), bevel=0.02, rot=(0, -40, 0))


# ---- 4. Join, size it, origin on the floor --------------------------------------------------

def join_parts(name, mat):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    orc = bpy.context.active_object
    orc.name = name
    orc.data.name = name
    orc.data.materials.clear()
    orc.data.materials.append(mat)
    if hasattr(orc.data, "use_auto_smooth"):  # Blender before 4.1 needs this for the hard edges
        orc.data.use_auto_smooth = True
        orc.data.auto_smooth_angle = math.pi

    zs = [v.co.z for v in orc.data.vertices]
    k = TARGET_HEIGHT / (max(zs) - min(zs))
    bottom = min(zs)
    for v in orc.data.vertices:
        v.co = Vector((v.co.x * k, v.co.y * k, (v.co.z - bottom) * k))
    orc.data.update()
    return orc, (lambda p: Vector((p[0] * k, p[1] * k, (p[2] - bottom) * k)))


# ---- 5. Skeleton and moves -------------------------------------------------------------------

BONES = [
    # name, head, tail, parent (design units, before sizing)
    ("root", (0, 0, 0), (0, 0, 0.25), None),
    ("hips", (0, 0, 0.55), (0, 0, 0.85), "root"),
    ("body", (0, 0, 0.85), (0, 0, 1.50), "hips"),
    ("head", (0, 0, 1.50), (0, 0, 2.30), "body"),
    ("arm.L", (0.58, 0, 1.36), (0.65, 0, 0.72), "body"),
    ("arm.R", (-0.58, 0, 1.36), (-0.65, 0, 0.72), "body"),
    ("leg.L", (0.26, 0, 0.62), (0.26, 0, 0.05), "hips"),
    ("leg.R", (-0.26, 0, 0.62), (-0.26, 0, 0.05), "hips"),
]

# Each move: (name, loops, [(frame, {bone: (rx, ry, rz) degrees or {"rot": ..., "loc": ...}})]).
# Bones bend about their own X; + leans the upright bones (hips, body, head) forward and
# swings arms and legs forward. "loc" is (side, up, forward) in the bone's own space.
MOVES = [
    ("Idle", True, [
        (0, {}),
        (30, {"hips": {"loc": (0, -0.025, 0)}, "body": (4, 0, 0), "head": (-4, 3, 0),
              "arm.L": (0, 0, 4), "arm.R": (0, 0, -4)}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, {"leg.L": (28, 0, 0), "leg.R": (-28, 0, 0), "arm.L": (-22, 0, 0), "arm.R": (22, 0, 0),
             "body": (8, -6, 0), "hips": {"rot": (0, 6, 0)}}),
        (6, {"hips": {"loc": (0, 0.05, 0)}, "body": (8, 0, 0)}),
        (12, {"leg.L": (-28, 0, 0), "leg.R": (28, 0, 0), "arm.L": (22, 0, 0), "arm.R": (-22, 0, 0),
              "body": (8, 6, 0), "hips": {"rot": (0, -6, 0)}}),
        (18, {"hips": {"loc": (0, 0.05, 0)}, "body": (8, 0, 0)}),
        (24, {"leg.L": (28, 0, 0), "leg.R": (-28, 0, 0), "arm.L": (-22, 0, 0), "arm.R": (22, 0, 0),
              "body": (8, -6, 0), "hips": {"rot": (0, 6, 0)}}),
    ]),
    ("1H_Melee_Attack_Chop", False, [
        (0, {}),
        (10, {"arm.R": (170, 0, 10), "body": (-12, 20, 0), "head": (-8, -10, 0), "arm.L": (-20, 0, 0)}),
        (15, {"arm.R": (40, 0, 0), "body": (20, -15, 0), "head": (6, 8, 0), "arm.L": (15, 0, 0),
              "hips": {"loc": (0, -0.05, 0)}}),
        (22, {"arm.R": (30, 0, 0), "body": (16, -10, 0), "hips": {"loc": (0, -0.04, 0)}}),
        (34, {}),
    ]),
    ("1H_Ranged_Shoot", False, [
        (0, {}),
        (8, {"arm.L": (88, 0, -6), "arm.R": (80, 0, 32), "body": (0, 25, 0), "head": (0, -22, 0)}),
        (18, {"arm.L": (90, 0, -6), "arm.R": (88, 0, -35), "body": (-4, 28, 0), "head": (0, -25, 0)}),
        (22, {"arm.L": (92, 0, -6), "arm.R": (95, 0, -60), "body": (-6, 25, 0), "head": (0, -22, 0)}),
        (36, {}),
    ]),
    ("Hit_A", False, [
        (0, {}),
        (5, {"body": (-18, 0, 6), "head": (-20, 0, 0), "arm.L": (-25, 0, 15), "arm.R": (-25, 0, -15),
             "root": {"loc": (0, 0, -0.12)}}),
        (20, {}),
    ]),
    ("Dodge_Right", False, [
        (0, {}),
        (7, {"root": {"loc": (-0.35, 0, 0), "rot": (0, 0, 12)}, "body": (0, 0, 10), "head": (0, 0, -6)}),
        (22, {}),
    ]),
    ("Cheer", False, [
        (0, {}),
        (10, {"arm.L": (160, 0, -30), "arm.R": (160, 0, 30), "head": (-15, 0, 0), "hips": {"loc": (0, 0.1, 0)}}),
        (16, {"arm.L": (150, 0, -25), "arm.R": (150, 0, 25), "head": (-10, 0, 0)}),
        (22, {"arm.L": (160, 0, -30), "arm.R": (160, 0, 30), "head": (-15, 0, 0), "hips": {"loc": (0, 0.1, 0)}}),
        (34, {}),
    ]),
]
FALLEN = {"root": {"rot": (-88, 0, 0), "loc": (0, 0.1, 0)}, "head": (20, 25, 0),
          "arm.L": (-60, 0, 40), "arm.R": (-50, 0, -50), "leg.L": (15, 0, 0), "leg.R": (-5, 0, 0)}
MOVES += [
    ("Death_A", False, [
        (0, {}),
        (8, {"body": (25, 0, 0), "head": (20, 0, 0), "arm.L": (30, 0, 0), "arm.R": (30, 0, 0),
             "hips": {"loc": (0, -0.08, 0)}}),
        (22, {"root": {"rot": (-70, 0, 0), "loc": (0, 0.2, 0)}, "head": (10, 15, 0),
              "arm.L": (-40, 0, 30), "arm.R": (-40, 0, -40)}),
        (30, FALLEN),
    ]),
    ("Death_A_Pose", False, [(0, FALLEN), (1, FALLEN)]),
]


def build_rig(orc, size):
    arm_data = bpy.data.armatures.new("Orc_Rig")
    rig = bpy.data.objects.new("Orc_Rig", arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        eb = arm_data.edit_bones.new(name)
        eb.head = size(head)
        eb.tail = size(tail)
        # Every bone's Z axis points forward, so a +X turn swings it forward.
        eb.align_roll(Vector((0, -1, 0)))
        if parent:
            eb.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    orc.parent = rig
    mod = orc.modifiers.new("Rig", "ARMATURE")
    mod.object = rig
    return rig


def pose(rig, spec):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for bone, value in spec.items():
        pb = rig.pose.bones[bone]
        if isinstance(value, dict):
            rot, loc = value.get("rot", (0, 0, 0)), value.get("loc", (0, 0, 0))
        else:
            rot, loc = value, (0, 0, 0)
        pb.rotation_euler = tuple(DEG(a) for a in rot)
        pb.location = loc


def add_moves(rig, moves):
    rig.animation_data_create()
    for name, _loops, keys in moves:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame, spec in keys:
            pose(rig, spec)
            for pb in rig.pose.bones:
                pb.keyframe_insert("rotation_euler", frame=frame, group=pb.name)
                pb.keyframe_insert("location", frame=frame, group=pb.name)
        # Each move goes on its own NLA track so the exporter writes it as its own clip.
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, int(keys[0][0]), action)
        rig.animation_data.action = None
    pose(rig, {})


# ---- 6. Export ------------------------------------------------------------------------------

def export_glb(objs, path):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # GLB packs the mesh, skeleton, moves and the palette texture into the one file.
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=ANIMATE,
    )


def make(file_name, weapon):
    clear_scene()
    parts.clear()
    bpy.context.scene.render.fps = FPS
    material = palette_material()
    build_orc(weapon)
    name = os.path.splitext(file_name)[0].replace("-", "_").title()
    orc, size = join_parts(name, material)
    objs = [orc]
    moves = [m for m in MOVES if weapon == "bow" or m[0] != "1H_Ranged_Shoot"]
    if ANIMATE:
        rig = build_rig(orc, size)
        add_moves(rig, moves)
        objs = [rig, orc]
    path = os.path.join(OUTPUT_FOLDER, file_name)
    export_glb(objs, path)

    xs, ys, zs = ([v.co[i] for v in orc.data.vertices] for i in range(3))
    size_kb = os.path.getsize(path) / 1024
    tris = sum(len(p.vertices) - 2 for p in orc.data.polygons)
    print(f"{name}: {max(xs) - min(xs):.2f} wide, {max(ys) - min(ys):.2f} deep, {max(zs) - min(zs):.2f} tall, "
          f"{tris} triangles")
    print(f"  Moves: {', '.join(m[0] for m in moves) if ANIMATE else 'none'}")
    print(f"  Saved {path} ({size_kb:.1f} KB)")
    if size_kb > 5 * 1024:
        print("  WARNING: over 5 MB")


for file_name, weapon in ORCS:
    make(file_name, weapon)
