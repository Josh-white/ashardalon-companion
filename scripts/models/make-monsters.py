"""Builds the monsters' 3D figures for the 3D board as .glb files: Orc Smasher (a big
spiked mace), Orc Archer (a bow and a quiver), Kobold Dragonshield (a dragon shield
and a spear) Human Cultist (hooded robes, a sun sceptre and a dagger)
Duergar Guard (a helmet, a beard, a round shield and a warhammer)
Snake (coiled, with its own legless skeleton and moves) , Cave Bear
(on all fours; rears up to maul) and Legion Devil (horns, black armour, a tail and a longsword).

Run it in Blender (tested headless on 5.2; written for 3.6 and newer):
  * Scripting workspace: open this file (or paste it), press Run Script (Alt+P).
  * Or headless:  blender --background --python make-monsters.py -- /path/to/folder [name ...]
One run saves every monster in MONSTERS (or just the names given) in OUTPUT_FOLDER.

It is made like the hero figures on the 3D board (KayKit Adventurers in src/models):
  * a big head on a short body, rounded (bevelled) shapes, a face and gear,
  * one mesh with ONE material whose colours come from a tiny packed palette texture,
  * a skeleton with moves named like the heroes' clips (Idle, Walking_A,
    1H_Melee_Attack_Chop, 1H_Ranged_Shoot (archer), Hit_A, Dodge_Right, Death_A,
    Death_A_Pose, Cheer), so
    src/components/figureModels.js could play them the same way,
  * sized against the heroes (about 2.5 units tall; the board's figure SCALE of 0.44 makes
    that one square tall): the orcs 2.4, the kobold 1.9,
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
# Which monsters to make (see MONSTERS at the bottom). Empty = all of them.
ONLY = []
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
    "scale": "a8462a",       # kobold red-orange
    "scale_dark": "6e2a1a",
    "belly": "d6a25e",
    "crest": "e07a2a",
    "robe": "5a1e24",        # cultist crimson
    "robe_dark": "2a1418",
    "gold": "c9a23a",
    "skin_pale": "c7a68c",
    "glow": "ff3b2e",
    "skin_grey": "7e8087",   # duergar
    "beard": "35363b",
    "snake": "557d3b",
    "snake_dark": "2e4a22",
    "snake_belly": "cdbf78",
    "fur": "6e4b2e",
    "fur_dark": "48311f",
    "fur_light": "a8865e",
    "devil": "a3262a",
    "devil_dark": "6a1519",
    "armour": "2c2a30",
}

argv = sys.argv
if "--" in argv and len(argv) > argv.index("--") + 1:
    OUTPUT_FOLDER = os.path.abspath(os.path.expanduser(argv[argv.index("--") + 1]))
    ONLY = argv[argv.index("--") + 2:]

COLOURS = list(PALETTE)
SWATCH = 4  # pixels per colour in the palette texture
DEG = math.radians


# ---- 1. Clear the scene --------------------------------------------------------------------

def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    # The moves are kept with a fake user, so they'd outlive the last figure: clear them too.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
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


def build_kobold():
    """A small red dragon-kin: snout, horns and crest, scale armour, a tail, a big shield with
    a dragon's face on the left arm and a spear in the right hand."""
    for side, tag in ((1, "L"), (-1, "R")):
        x = 0.2 * side
        leg = f"leg.{tag}"
        box(f"Foot.{tag}", "scale_dark", leg, (x, -0.06, 0.06), (0.22, 0.34, 0.12), bevel=0.05)
        for i, dx in enumerate((-0.07, 0, 0.07)):
            cone(f"Claw.{tag}{i}", "bone", leg, (x + dx, -0.25, 0.05), 0.03, 0.09, rot=(90, 0, 0), sides=4)
        box(f"Shin.{tag}", "scale", leg, (x, 0.03, 0.25), (0.17, 0.19, 0.30), bevel=0.06)
        sphere(f"Thigh.{tag}", "scale", leg, (x, 0, 0.48), 0.15, scale=(1, 1.05, 1.25))

    # Hips: a leather kilt and belt; the tail comes out the back.
    box("Kilt", "leather", "hips", (0, 0, 0.62), (0.54, 0.40, 0.24), bevel=0.08)
    box("Belt", "iron_dark", "hips", (0, 0, 0.72), (0.58, 0.44, 0.07), bevel=0.02)
    for i, (y, z, r, depth, tilt) in enumerate(((0.30, 0.56, 0.11, 0.30, -110), (0.52, 0.42, 0.075, 0.28, -120),
                                                (0.70, 0.30, 0.045, 0.26, -125))):
        cone(f"Tail{i}", "scale", "tail", (0, y, z), r, depth, rot=(tilt, 0, 0), sides=8, tip=r * 0.6)
    cone("TailTip", "scale_dark", "tail", (0, 0.84, 0.21), 0.03, 0.12, rot=(-125, 0, 0), sides=6)

    # Body: a pale belly under an iron breastplate with shoulder straps.
    box("Torso", "scale", "body", (0, 0, 0.95), (0.58, 0.42, 0.50), bevel=0.16, segments=3)
    box("Belly", "belly", "body", (0, -0.17, 0.85), (0.32, 0.10, 0.20), bevel=0.05)
    box("Breastplate", "iron", "body", (0, -0.16, 1.04), (0.44, 0.12, 0.24), bevel=0.05)
    box("PlateRivets", "iron_dark", "body", (0, -0.225, 1.04), (0.30, 0.02, 0.04), bevel=0.008)
    for side in (1, -1):
        box(f"Strap{side}", "leather", "body", (0.16 * side, 0, 1.08), (0.08, 0.46, 0.26), bevel=0.02)
    box("Collar", "iron", "body", (0, 0, 1.18), (0.50, 0.40, 0.08), bevel=0.03)
    sphere("Neck", "scale", "body", (0, -0.03, 1.24), 0.12, scale=(1, 1, 1.1))

    # Arms.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"Shoulder.{tag}", "iron", arm, (0.36 * side, 0, 1.08), 0.11, scale=(1.1, 1, 0.9))
        box(f"Forearm.{tag}", "scale", arm, (0.41 * side, -0.02, 0.84), (0.14, 0.15, 0.26), bevel=0.05)
        sphere(f"Hand.{tag}", "scale_dark", arm, (0.43 * side, -0.04, 0.66), 0.085)

    # A spear in the right hand, its point forward and a little up, a red tassel under the head.
    hand = Vector((-0.43, -0.04, 0.66))
    d = Vector((0, -0.97, 0.26))  # 15 degrees above forward
    tilt = (75, 0, 0)  # turns a +Z part to point along d
    cone("SpearShaft", "wood", "arm.R", hand + d * 0.26, 0.04, 1.14, rot=tilt, sides=6, tip=0.03)
    cone("SpearButt", "iron_dark", "arm.R", hand - d * 0.32, 0.05, 0.06, rot=tilt, sides=6, tip=0.03)
    cone("SpearCollar", "iron_dark", "arm.R", hand + d * 0.82, 0.055, 0.06, rot=tilt, sides=6, tip=0.04)
    cone("SpearHead", "iron", "arm.R", hand + d * 0.99, 0.11, 0.30, rot=tilt, sides=4, scale=(1, 0.35, 1))
    sphere("Tassel", "red", "arm.R", hand + d * 0.78 + Vector((0, 0, -0.07)), 0.055, scale=(0.8, 0.8, 1.4),
           segments=8, rings=6)

    # The dragon shield on the left arm, facing forward.
    sc = Vector((0.47, -0.17, 0.80))
    box("Shield", "scale_dark", "arm.L", sc, (0.50, 0.07, 0.66), bevel=0.06, segments=3)
    box("ShieldRim", "iron", "arm.L", sc + Vector((0, 0.01, 0)), (0.56, 0.05, 0.72), bevel=0.06, segments=3)
    sphere("ShieldFace", "crest", "arm.L", sc + Vector((0, -0.05, 0.04)), 0.15, scale=(1, 0.5, 1.1))
    box("ShieldSnout", "crest", "arm.L", sc + Vector((0, -0.10, -0.08)), (0.14, 0.10, 0.14), bevel=0.04)
    for side in (1, -1):
        cone(f"ShieldHorn{side}", "bone", "arm.L", sc + Vector((0.11 * side, -0.06, 0.20)), 0.035, 0.16,
             rot=(0, 30 * side, 0), sides=5)
        sphere(f"ShieldEye{side}", "eye", "arm.L", sc + Vector((0.06 * side, -0.11, 0.08)), 0.025)

    # Head: a big round skull with a long snout, horns, a crest, yellow slit eyes.
    sphere("Skull", "scale", "head", (0, 0.02, 1.46), 0.27, scale=(0.95, 1.05, 0.9), segments=16, rings=10)
    box("Snout", "scale", "head", (0, -0.30, 1.40), (0.22, 0.40, 0.17), bevel=0.07, segments=3)
    box("Jaw", "scale_dark", "head", (0, -0.27, 1.29), (0.19, 0.34, 0.07), bevel=0.03)
    box("Chin", "belly", "head", (0, -0.20, 1.26), (0.18, 0.22, 0.03), bevel=0.01)
    for side, tag in ((1, "L"), (-1, "R")):
        x = side
        box(f"Nostril.{tag}", "black", "head", (0.045 * x, -0.47, 1.47), (0.03, 0.03, 0.02), bevel=0.008)
        for i, y in enumerate((-0.42, -0.33, -0.24)):
            cone(f"Tooth.{tag}{i}", "bone", "head", (0.09 * x, y, 1.315), 0.016, 0.05, rot=(180, 0, 0), sides=4)
        sphere(f"Eye.{tag}", "eye", "head", (0.13 * x, -0.17, 1.53), 0.06, scale=(0.9, 0.7, 0.8))
        box(f"Pupil.{tag}", "black", "head", (0.13 * x, -0.215, 1.53), (0.014, 0.02, 0.07), bevel=0.006)
        box(f"Brow.{tag}", "scale_dark", "head", (0.13 * x, -0.19, 1.60), (0.14, 0.09, 0.05), bevel=0.02,
            rot=(0, -14 * x, 0))
        cone(f"Horn.{tag}", "bone", "head", (0.12 * x, 0.18, 1.62), 0.05, 0.30, rot=(-50, 0, -12 * x), sides=6)
        cone(f"Frill.{tag}", "crest", "head", (0.22 * x, 0.10, 1.48), 0.08, 0.22, rot=(0, 70 * x, 25 * x),
             scale=(1, 0.3, 1), sides=5)
    for i, (y, z, h) in enumerate(((-0.05, 1.70, 0.12), (0.08, 1.70, 0.15), (0.20, 1.64, 0.12))):
        cone(f"Crest{i}", "crest", "head", (0, y, z), 0.06, h, rot=(-15, 0, 0), scale=(0.3, 1, 1), sides=4)


def build_cultist():
    """A hooded cultist in crimson robes: a pale face in the hood's shadow with glowing red
    eyes, a sun-topped sceptre in the left hand and a curved dagger in the right."""
    for side, tag in ((1, "L"), (-1, "R")):
        box(f"Boot.{tag}", "leather_dark", f"leg.{tag}", (0.16 * side, -0.10, 0.07), (0.20, 0.30, 0.14), bevel=0.05)
        cone(f"Shin.{tag}", "robe_dark", f"leg.{tag}", (0.16 * side, 0, 0.25), 0.09, 0.30, sides=8, tip=0.09)

    # The long robe, flaring at the hem with a gold trim, a sash and a dark front panel.
    cone("Robe", "robe", "hips", (0, 0, 0.55), 0.46, 0.80, sides=12, tip=0.31)
    cone("Hem", "gold", "hips", (0, 0, 0.17), 0.47, 0.05, sides=12, tip=0.465)
    box("Panel", "robe_dark", "hips", (0, -0.30, 0.52), (0.22, 0.06, 0.72), bevel=0.02, rot=(-12, 0, 0))
    box("PanelSigil", "gold", "hips", (0, -0.355, 0.62), (0.10, 0.02, 0.10), bevel=0.01, rot=(-12, 0, 45))
    box("Sash", "gold", "hips", (0, 0, 0.94), (0.66, 0.50, 0.08), bevel=0.03)

    # Upper body under a dark mantle, with an amulet.
    box("Torso", "robe", "body", (0, 0, 1.14), (0.60, 0.44, 0.44), bevel=0.15, segments=3)
    sphere("Mantle", "robe_dark", "body", (0, 0.02, 1.34), 0.36, scale=(1.12, 0.92, 0.42))
    sphere("Amulet", "gold", "body", (0, -0.25, 1.16), 0.06, scale=(1, 0.5, 1))
    sphere("Gem", "glow", "body", (0, -0.28, 1.16), 0.03, scale=(1, 0.5, 1), segments=8, rings=6)

    # Bell sleeves and pale hands.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        cone(f"Sleeve.{tag}", "robe", arm, (0.43 * side, -0.02, 1.03), 0.15, 0.46, rot=(180, 0, 0), sides=10, tip=0.10)
        cone(f"Cuff.{tag}", "gold", arm, (0.45 * side, -0.03, 0.82), 0.155, 0.04, sides=10, tip=0.15)
        sphere(f"Hand.{tag}", "skin_pale", arm, (0.46 * side, -0.05, 0.74), 0.085)

    # Sun sceptre in the left hand, standing upright.
    hand = Vector((0.46, -0.05, 0.74))
    cone("Sceptre", "wood", "arm.L", Vector((hand.x, hand.y, 1.08)), 0.032, 2.0, sides=6, tip=0.032)
    cone("SceptreFoot", "gold", "arm.L", Vector((hand.x, hand.y, 0.10)), 0.045, 0.08, sides=6, tip=0.03)
    top = Vector((hand.x, hand.y, 2.12))
    cone("SceptreNeck", "gold", "arm.L", top - Vector((0, 0, 0.12)), 0.03, 0.10, sides=6, tip=0.07)
    sphere("Sun", "gold", "arm.L", top, 0.09, segments=10, rings=7)
    sphere("SunGem", "glow", "arm.L", top + Vector((0, -0.075, 0)), 0.035, scale=(1, 0.5, 1), segments=8, rings=6)
    for i in range(8):
        a = i * 45
        d = Vector((math.sin(DEG(a)), 0, math.cos(DEG(a))))
        cone(f"Ray{i}", "gold", "arm.L", top + d * 0.13, 0.03, 0.12, rot=(0, a, 0), sides=4, scale=(1, 0.4, 1))

    # Curved dagger in the right hand, pointing forward.
    hand = Vector((-0.46, -0.05, 0.74))
    box("DaggerGrip", "leather_dark", "arm.R", hand + Vector((0, -0.06, 0)), (0.04, 0.12, 0.04), bevel=0.01)
    box("DaggerGuard", "gold", "arm.R", hand + Vector((0, -0.13, 0)), (0.04, 0.03, 0.14), bevel=0.01)
    box("DaggerBlade", "iron", "arm.R", hand + Vector((0, -0.25, 0.015)), (0.025, 0.22, 0.06), bevel=0.008, rot=(-8, 0, 0))
    cone("DaggerTip", "iron", "arm.R", hand + Vector((0, -0.39, 0.04)), 0.03, 0.09, rot=(80, 0, 0), sides=4,
         scale=(0.4, 1, 1))

    # Head: a deep hood with a peak, the face in its shadow.
    sphere("Hood", "robe", "head", (0, 0.10, 1.82), 0.40, scale=(1.0, 1.0, 1.05), segments=16, rings=10)
    cone("HoodPeak", "robe", "head", (0, 0.30, 2.10), 0.17, 0.32, rot=(-55, 0, 0), sides=8)
    sphere("Face", "skin_pale", "head", (0, -0.12, 1.72), 0.25, scale=(0.95, 0.85, 1.0), segments=14, rings=9)
    sphere("Shadow", "black", "head", (0, -0.14, 1.80), 0.22, scale=(0.95, 0.88, 0.62), segments=14, rings=9)
    for side in (1, -1):
        sphere(f"Glow{side}", "glow", "head", (0.085 * side, -0.345, 1.82), 0.03, scale=(1.2, 0.5, 0.8),
               segments=8, rings=6)
    box("Mouth", "black", "head", (0, -0.335, 1.64), (0.10, 0.02, 0.025), bevel=0.006)
    # The hood's rim round the face, over the top and down the sides.
    for i in range(13):
        a = -30 + i * 20
        x, z = math.cos(DEG(a)) * 0.30, math.sin(DEG(a)) * 0.30
        box(f"Brim{i}", "robe_dark", "head", (x, -0.27, 1.74 + z), (0.13, 0.10, 0.07), bevel=0.025,
            rot=(0, -(90 + a), 0))


def build_duergar():
    """A stocky grey dwarf in dark iron: a nose-guard helmet with a spike, glowing red eyes, a
    huge braided beard, a round shield on the left arm and a warhammer in the right fist."""
    for side, tag in ((1, "L"), (-1, "R")):
        leg = f"leg.{tag}"
        box(f"Boot.{tag}", "iron_dark", leg, (0.24 * side, -0.05, 0.10), (0.30, 0.42, 0.20), bevel=0.07)
        box(f"Leg.{tag}", "leather", leg, (0.24 * side, 0, 0.33), (0.26, 0.28, 0.28), bevel=0.08)

    # Hips: a mail skirt and a broad belt.
    cone("MailSkirt", "iron_dark", "hips", (0, 0, 0.56), 0.50, 0.32, sides=12, tip=0.42)
    box("Belt", "leather", "hips", (0, 0, 0.72), (0.90, 0.64, 0.11), bevel=0.04)
    box("Buckle", "gold", "hips", (0, -0.33, 0.72), (0.20, 0.06, 0.15), bevel=0.02)
    box("Tabard", "red", "hips", (0, -0.30, 0.52), (0.30, 0.05, 0.34), bevel=0.02, rot=(-8, 0, 0))

    # A barrel of an iron breastplate with heavy pauldrons.
    box("Torso", "iron", "body", (0, 0, 1.02), (1.00, 0.68, 0.62), bevel=0.24, segments=3)
    box("PlateRidge", "iron_dark", "body", (0, -0.335, 1.02), (0.08, 0.04, 0.50), bevel=0.015)
    for side in (1, -1):
        sphere(f"Pauldron{side}", "iron_dark", "body", (0.52 * side, 0, 1.26), 0.26, scale=(1.1, 1.05, 0.7))
        for i, y in enumerate((-0.12, 0.0, 0.12)):
            sphere(f"Rivet{side}{i}", "gold", "body", (0.62 * side, y, 1.42), 0.03, segments=6, rings=4)

    # Arms: grey skin, iron gauntlets and fists.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"UpperArm.{tag}", "skin_grey", arm, (0.60 * side, 0, 1.05), 0.15, scale=(1, 1, 1.2))
        box(f"Gauntlet.{tag}", "iron_dark", arm, (0.63 * side, -0.02, 0.83), (0.27, 0.27, 0.28), bevel=0.07)
        sphere(f"Fist.{tag}", "iron_dark", arm, (0.64 * side, -0.05, 0.64), 0.15)

    # Warhammer in the right fist, its head resting forward and down.
    fist = Vector((-0.64, -0.05, 0.64))
    d = Vector((0, -0.866, -0.5))
    tilt = (120, 0, 0)
    cone("HammerHaft", "wood", "arm.R", fist + d * 0.22, 0.045, 0.70, rot=tilt, sides=6, tip=0.045)
    cone("HammerPommel", "iron_dark", "arm.R", fist - d * 0.15, 0.06, 0.07, rot=tilt, sides=6, tip=0.04)
    head = fist + d * 0.58
    box("HammerHead", "iron_dark", "arm.R", head, (0.20, 0.20, 0.40), bevel=0.04, rot=(30, 0, 0))
    box("HammerFace", "iron", "arm.R", head + Vector((0, 0.10, 0.17)), (0.22, 0.10, 0.10), bevel=0.02,
        rot=(30, 0, 0))
    cone("HammerSpike", "iron", "arm.R", head + Vector((0, -0.08, -0.26)), 0.07, 0.18, rot=(150, 0, 0), sides=4)

    # A round wooden shield with an iron rim and boss, facing forward on the left arm.
    sc = Vector((0.66, -0.22, 0.86))
    cone("Shield", "wood", "arm.L", sc, 0.40, 0.08, rot=(90, 0, 0), sides=16, tip=0.40)
    cone("ShieldRim", "iron_dark", "arm.L", sc + Vector((0, 0.01, 0)), 0.43, 0.06, rot=(90, 0, 0), sides=16, tip=0.43)
    sphere("ShieldBoss", "iron", "arm.L", sc + Vector((0, -0.05, 0)), 0.12, scale=(1, 0.6, 1))
    for i in range(6):
        a = DEG(i * 60)
        sphere(f"ShieldStud{i}", "iron", "arm.L", sc + Vector((math.cos(a) * 0.30, -0.05, math.sin(a) * 0.30)),
               0.03, segments=6, rings=4)

    # Head: grey face under a spiked nose-guard helm, red eyes, a big braided beard.
    sphere("Face", "skin_grey", "head", (0, -0.04, 1.62), 0.33, scale=(1.05, 0.95, 1.0), segments=16, rings=10)
    sphere("Helm", "iron", "head", (0, 0.0, 1.80), 0.37, scale=(1.05, 1.02, 0.78), segments=16, rings=10)
    cone("HelmBrim", "gold", "head", (0, 0.0, 1.77), 0.385, 0.06, sides=16, tip=0.385)
    box("NoseGuard", "iron_dark", "head", (0, -0.37, 1.69), (0.06, 0.05, 0.16), bevel=0.02)
    cone("HelmSpike", "iron_dark", "head", (0, 0.0, 2.12), 0.07, 0.20, sides=6)
    for side in (1, -1):
        cone(f"HelmWing{side}", "iron_dark", "head", (0.36 * side, 0.02, 1.86), 0.06, 0.22,
             rot=(0, 55 * side, 0), scale=(1, 0.35, 1), sides=4)
        box(f"Brow{side}", "beard", "head", (0.13 * side, -0.32, 1.70), (0.15, 0.06, 0.05), bevel=0.02,
            rot=(0, -12 * side, 0))
        sphere(f"Eye{side}", "glow", "head", (0.12 * side, -0.33, 1.63), 0.035, scale=(1.2, 0.5, 0.8),
               segments=8, rings=6)
        box(f"Moustache{side}", "beard", "head", (0.10 * side, -0.36, 1.45), (0.18, 0.08, 0.07), bevel=0.03,
            rot=(0, 18 * side, 0))
        cone(f"Braid{side}", "beard", "head", (0.10 * side, -0.30, 0.90), 0.055, 0.22, rot=(180, 0, 0), sides=6,
             tip=0.02)
        sphere(f"BraidRing{side}", "gold", "head", (0.10 * side, -0.30, 1.02), 0.05, scale=(1, 1, 0.6),
               segments=8, rings=5)
    box("Nose", "skin_grey", "head", (0, -0.36, 1.55), (0.12, 0.10, 0.12), bevel=0.045)
    sphere("Beard", "beard", "head", (0, -0.18, 1.28), 0.30, scale=(1.05, 0.62, 1.3), segments=12, rings=8)


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return p0 * u ** 3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t ** 3


def build_snake():
    """A big snake coiled twice round on the floor, its neck rising in an S to a wedge head
    with yellow slit eyes, fangs and a forked tongue."""
    # The coil: a tapering tail on the outside winding in and up to the neck.
    steps = 44
    for i in range(steps):
        t = i / (steps - 1)
        a = DEG(i * 17.7)
        r = 0.62 - 0.30 * t
        radius = 0.06 + 0.11 * min(1, i / 13)
        z = radius * 0.85 + 0.22 * t
        colour = "snake_dark" if i % 6 == 0 else "snake"
        bone = "root" if i < 20 else "hips"
        sphere(f"Coil{i}", colour, bone, (math.sin(a) * r, math.cos(a) * r, z), radius, scale=(1, 1, 0.85),
               segments=10, rings=6)

    # The neck in an S, thick at the coil and thinner at the head, a pale belly in front.
    p0, p1, p2, p3 = Vector((0, 0.06, 0.40)), Vector((0, 0.22, 0.85)), Vector((0, -0.30, 0.95)), Vector((0, -0.24, 1.36))
    n = 20
    for i in range(n):
        t = i / (n - 1)
        at = bezier(p0, p1, p2, p3, t)
        radius = 0.17 - 0.06 * t
        bone = "neck1" if t < 0.5 else "neck2"
        sphere(f"Neck{i}", "snake_dark" if i % 6 == 3 else "snake", bone, at, radius, segments=10, rings=6)
        if 0.15 < t < 0.95:
            ahead = bezier(p0, p1, p2, p3, min(1, t + 0.02)) - at
            side = Vector((1, 0, 0)).cross(ahead).normalized()
            sphere(f"Belly{i}", "snake_belly", bone, at - side * radius * 0.55, radius * 0.6,
                   scale=(1.1, 1, 1), segments=8, rings=5)

    # Head: a wedge with brows, slit eyes, nostrils, fangs, a pink mouth and a forked tongue.
    sphere("Head", "snake", "head", (0, -0.36, 1.45), 0.18, scale=(1.15, 1.45, 0.72), segments=14, rings=8)
    box("Snout", "snake", "head", (0, -0.55, 1.45), (0.22, 0.20, 0.12), bevel=0.05)
    box("Jaw", "snake_belly", "head", (0, -0.45, 1.34), (0.24, 0.32, 0.06), bevel=0.025, rot=(18, 0, 0))
    box("Mouth", "red", "head", (0, -0.46, 1.38), (0.20, 0.28, 0.04), bevel=0.01, rot=(9, 0, 0))
    for side in (1, -1):
        sphere(f"Eye{side}", "eye", "head", (0.13 * side, -0.44, 1.52), 0.05, scale=(0.7, 1, 0.9), segments=8, rings=6)
        box(f"Pupil{side}", "black", "head", (0.165 * side, -0.445, 1.52), (0.012, 0.015, 0.06), bevel=0.005)
        box(f"Brow{side}", "snake_dark", "head", (0.11 * side, -0.44, 1.575), (0.10, 0.14, 0.04), bevel=0.015,
            rot=(0, 18 * side, 0))
        box(f"Nostril{side}", "black", "head", (0.05 * side, -0.64, 1.49), (0.025, 0.02, 0.015), bevel=0.005)
        cone(f"Fang{side}", "bone", "head", (0.07 * side, -0.58, 1.36), 0.022, 0.10, rot=(180, 0, 0), sides=5)
        box(f"Fork{side}", "red", "head", (0.025 * side, -0.80, 1.38), (0.018, 0.08, 0.012), bevel=0.004,
            rot=(0, 0, -20 * side))
    box("Tongue", "red", "head", (0, -0.70, 1.38), (0.025, 0.16, 0.014), bevel=0.005)
    for i, y in enumerate((-0.30, -0.20)):
        box(f"Scale{i}", "snake_dark", "head", (0, y, 1.585), (0.10, 0.08, 0.03), bevel=0.012, rot=(0, 0, 45))


def build_bear():
    """A big brown cave bear on all fours: a shoulder hump, a growling open mouth, little ears,
    heavy paws with bone claws. Its front legs use the arm bones and its back legs the leg
    bones, so it walks with the same swings as the others."""
    # Body: the back end, the chest and the hump over the shoulders, a stub of a tail.
    sphere("Rump", "fur", "hips", (0, 0.28, 0.78), 0.44, scale=(1.0, 1.15, 0.92), segments=14, rings=9)
    sphere("Tail", "fur_dark", "hips", (0, 0.76, 0.86), 0.08, segments=8, rings=6)
    sphere("Chest", "fur", "body", (0, -0.20, 0.86), 0.48, scale=(1.0, 1.05, 0.95), segments=14, rings=9)
    sphere("Hump", "fur_dark", "body", (0, -0.12, 1.20), 0.30, scale=(1.15, 1.2, 0.6), segments=12, rings=8)
    sphere("Belly", "fur_light", "body", (0, -0.05, 0.50), 0.30, scale=(1.1, 1.6, 0.5), segments=12, rings=8)

    # Legs: the front pair on the arm bones, the back pair on the leg bones.
    for side, tag in ((1, "L"), (-1, "R")):
        for bone, y, upper in ((f"arm.{tag}", -0.32, 0.18), (f"leg.{tag}", 0.40, 0.22)):
            x = (0.30 if bone.startswith("arm") else 0.32) * side
            sphere(f"Upper.{bone}", "fur", bone, (x, y, 0.56), upper, scale=(1, 1.1, 1.25))
            box(f"Lower.{bone}", "fur", bone, (x, y, 0.25), (0.26, 0.28, 0.34), bevel=0.09)
            box(f"Paw.{bone}", "fur_dark", bone, (x, y - 0.04, 0.07), (0.30, 0.34, 0.14), bevel=0.06)
            for i, dx in enumerate((-0.08, 0, 0.08)):
                cone(f"Claw.{bone}{i}", "bone", bone, (x + dx, y - 0.24, 0.06), 0.03, 0.10, rot=(100, 0, 0), sides=4)

    # Head: round, with a pale muzzle, an open growling mouth, small round ears, angry brows.
    hy, hz = -0.66, 1.06
    sphere("Head", "fur", "head", (0, hy, hz), 0.28, scale=(1.05, 1.0, 0.92), segments=14, rings=9)
    box("Muzzle", "fur_light", "head", (0, hy - 0.24, hz - 0.06), (0.24, 0.24, 0.16), bevel=0.07, segments=3)
    box("Nose", "black", "head", (0, hy - 0.37, hz - 0.01), (0.10, 0.06, 0.07), bevel=0.025)
    box("LowerJaw", "fur_light", "head", (0, hy - 0.22, hz - 0.20), (0.20, 0.22, 0.06), bevel=0.025, rot=(16, 0, 0))
    box("MouthInside", "red", "head", (0, hy - 0.24, hz - 0.15), (0.17, 0.18, 0.05), bevel=0.01, rot=(8, 0, 0))
    for side in (1, -1):
        sphere(f"Eye{side}", "black", "head", (0.12 * side, hy - 0.22, hz + 0.07), 0.035, scale=(1, 0.6, 1),
               segments=8, rings=6)
        box(f"Brow{side}", "fur_dark", "head", (0.12 * side, hy - 0.22, hz + 0.13), (0.12, 0.06, 0.04), bevel=0.015,
            rot=(0, -16 * side, 0))
        sphere(f"Ear{side}", "fur_dark", "head", (0.19 * side, hy + 0.05, hz + 0.22), 0.08, scale=(1, 0.5, 1),
               segments=8, rings=6)
        sphere(f"EarIn{side}", "fur_light", "head", (0.19 * side, hy + 0.02, hz + 0.22), 0.045, scale=(1, 0.4, 1),
               segments=8, rings=6)
        cone(f"Fang{side}", "bone", "head", (0.07 * side, hy - 0.33, hz - 0.13), 0.022, 0.08, rot=(180, 0, 0), sides=5)
        cone(f"LowFang{side}", "bone", "head", (0.06 * side, hy - 0.31, hz - 0.20), 0.02, 0.07, sides=5)


def build_devil():
    """A legion devil: red skin, curling horns, black spiked plate armour, a pointed tail, a
    longsword in the right hand and a small spiked buckler on the left arm."""
    for side, tag in ((1, "L"), (-1, "R")):
        x = 0.24 * side
        leg = f"leg.{tag}"
        box(f"Hoof.{tag}", "armour", leg, (x, -0.05, 0.10), (0.28, 0.40, 0.20), bevel=0.07)
        box(f"Greave.{tag}", "armour", leg, (x, -0.02, 0.32), (0.28, 0.30, 0.26), bevel=0.08)
        cone(f"KneeSpike.{tag}", "armour", leg, (x, -0.18, 0.42), 0.05, 0.12, rot=(90, 0, 0), sides=5)
        box(f"Thigh.{tag}", "devil", leg, (x, 0, 0.52), (0.26, 0.28, 0.16), bevel=0.06)

    # Hips: an armoured skirt of plates, a belt with a skull-ish clasp; the tail behind.
    box("Faulds", "armour", "hips", (0, 0, 0.68), (0.80, 0.52, 0.24), bevel=0.10, segments=3)
    box("Belt", "devil_dark", "hips", (0, 0, 0.80), (0.86, 0.56, 0.08), bevel=0.03)
    box("Clasp", "gold", "hips", (0, -0.29, 0.80), (0.16, 0.05, 0.14), bevel=0.02)
    for i, (y, z, r, depth, tilt) in enumerate(((0.32, 0.66, 0.08, 0.34, -115), (0.58, 0.48, 0.055, 0.32, -130),
                                                (0.80, 0.30, 0.035, 0.28, -140))):
        cone(f"Tail{i}", "devil", "tail", (0, y, z), r, depth, rot=(tilt, 0, 0), sides=8, tip=r * 0.6)
    cone("TailBarb", "devil_dark", "tail", (0, 0.94, 0.16), 0.08, 0.16, rot=(-140, 0, 0), sides=4, scale=(1, 0.3, 1))

    # Body: a black breastplate on a red chest, spiked pauldrons.
    box("Chest", "devil", "body", (0, 0, 1.15), (0.86, 0.56, 0.66), bevel=0.20, segments=3)
    box("Breastplate", "armour", "body", (0, -0.14, 1.12), (0.74, 0.34, 0.56), bevel=0.14, segments=3)
    box("PlateTrim", "gold", "body", (0, -0.315, 1.14), (0.06, 0.03, 0.40), bevel=0.01)
    for side in (1, -1):
        sphere(f"Pauldron{side}", "armour", "body", (0.50 * side, 0, 1.44), 0.25, scale=(1.15, 1.05, 0.72))
        for i, dz in enumerate((0.0, 0.10)):
            cone(f"PSpike{side}{i}", "devil_dark", "body", (0.62 * side, -0.04 + 0.10 * i, 1.52 + dz * 0.3), 0.05,
                 0.20, rot=(0, 60 * side, 0), sides=5)

    # Arms: red upper arms, black vambraces with fins, clawed red hands.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"UpperArm.{tag}", "devil", arm, (0.60 * side, 0, 1.20), 0.15, scale=(1, 1, 1.35))
        box(f"Vambrace.{tag}", "armour", arm, (0.64 * side, -0.02, 0.93), (0.27, 0.27, 0.30), bevel=0.07)
        cone(f"Fin.{tag}", "devil_dark", arm, (0.78 * side, 0.02, 0.98), 0.07, 0.20, rot=(0, 90 * side, 0),
             scale=(1, 0.3, 1), sides=4)
        sphere(f"Hand.{tag}", "devil", arm, (0.65 * side, -0.05, 0.72), 0.15, scale=(1, 1.1, 0.95))

    # Longsword in the right hand, pointing forward.
    hand = Vector((-0.65, -0.05, 0.72))
    box("SwordGrip", "leather_dark", "arm.R", hand + Vector((0, -0.04, 0)), (0.06, 0.24, 0.06), bevel=0.015)
    box("SwordGuard", "gold", "arm.R", hand + Vector((0, -0.18, 0)), (0.06, 0.06, 0.30), bevel=0.015)
    box("SwordBlade", "iron", "arm.R", hand + Vector((0, -0.58, 0)), (0.035, 0.74, 0.13), bevel=0.012)
    cone("SwordPoint", "iron", "arm.R", hand + Vector((0, -1.00, 0)), 0.065, 0.14, rot=(90, 0, 0), sides=4,
         scale=(0.3, 1, 1))
    box("Fuller", "iron_dark", "arm.R", hand + Vector((0, -0.55, 0)), (0.04, 0.60, 0.03), bevel=0.005)

    # Small spiked buckler on the left forearm.
    bc = Vector((0.70, -0.20, 0.90))
    cone("Buckler", "armour", "arm.L", bc, 0.24, 0.07, rot=(90, 0, 0), sides=12, tip=0.24)
    cone("BucklerSpike", "devil_dark", "arm.L", bc + Vector((0, -0.10, 0)), 0.07, 0.18, rot=(90, 0, 0), sides=6)

    # Head: red, with heavy brows, yellow eyes, a fanged grin, curling horns and a black crest.
    hy = -0.06
    sphere("Skull", "devil", "head", (0, hy, 1.88), 0.38, scale=(1.0, 0.95, 0.95), segments=16, rings=10)
    box("Jaw", "devil", "head", (0, hy - 0.14, 1.66), (0.50, 0.40, 0.22), bevel=0.10, segments=3)
    box("Mouth", "black", "head", (0, hy - 0.335, 1.68), (0.34, 0.03, 0.05), bevel=0.01)
    box("Nose", "devil_dark", "head", (0, hy - 0.37, 1.84), (0.10, 0.08, 0.12), bevel=0.03)
    box("Goatee", "black", "head", (0, hy - 0.30, 1.54), (0.12, 0.10, 0.14), bevel=0.04)
    for side in (1, -1):
        x = side
        cone(f"Fang{x}", "bone", "head", (0.10 * x, hy - 0.345, 1.66), 0.025, 0.07, sides=4)
        box(f"Brow{x}", "devil_dark", "head", (0.14 * x, hy - 0.33, 1.98), (0.22, 0.10, 0.07), bevel=0.03,
            rot=(0, -20 * x, 0))
        sphere(f"Eye{x}", "eye", "head", (0.14 * x, hy - 0.33, 1.91), 0.055, scale=(1, 0.5, 0.75))
        box(f"Pupil{x}", "black", "head", (0.14 * x, hy - 0.36, 1.91), (0.014, 0.012, 0.06), bevel=0.004)
        cone(f"Ear{x}", "devil", "head", (0.38 * x, hy + 0.02, 1.90), 0.07, 0.24, rot=(0, 75 * x, 0),
             scale=(1, 0.4, 1), sides=5)
        # Horns: up and out, then curling back.
        cone(f"HornA{x}", "bone", "head", (0.22 * x, hy - 0.02, 2.18), 0.085, 0.24, rot=(0, 25 * x, 0), sides=8,
             tip=0.06)
        cone(f"HornB{x}", "bone", "head", (0.30 * x, hy + 0.04, 2.36), 0.06, 0.22, rot=(-35, 15 * x, 0), sides=8,
             tip=0.035)
        cone(f"HornC{x}", "devil_dark", "head", (0.33 * x, hy + 0.17, 2.48), 0.035, 0.18, rot=(-75, 0, 0), sides=6)
    box("Crest", "black", "head", (0, hy + 0.06, 2.24), (0.08, 0.50, 0.12), bevel=0.03, rot=(-10, 0, 0))


# ---- 4. Join, size it, origin on the floor --------------------------------------------------

def join_parts(name, mat, height):
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
    k = height / (max(zs) - min(zs))
    bottom = min(zs)
    for v in orc.data.vertices:
        v.co = Vector((v.co.x * k, v.co.y * k, (v.co.z - bottom) * k))
    orc.data.update()
    return orc, (lambda p: Vector((p[0] * k, p[1] * k, (p[2] - bottom) * k)))


# ---- 5. Skeleton and moves -------------------------------------------------------------------

# Every figure's bones: name, head, tail, parent (design units, before sizing).
ORC_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.25), None),
    ("hips", (0, 0, 0.55), (0, 0, 0.85), "root"),
    ("body", (0, 0, 0.85), (0, 0, 1.50), "hips"),
    ("head", (0, 0, 1.50), (0, 0, 2.30), "body"),
    ("arm.L", (0.58, 0, 1.36), (0.65, 0, 0.72), "body"),
    ("arm.R", (-0.58, 0, 1.36), (-0.65, 0, 0.72), "body"),
    ("leg.L", (0.26, 0, 0.62), (0.26, 0, 0.05), "hips"),
    ("leg.R", (-0.26, 0, 0.62), (-0.26, 0, 0.05), "hips"),
]
CULTIST_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("hips", (0, 0, 0.45), (0, 0, 0.92), "root"),
    ("body", (0, 0, 0.92), (0, 0, 1.45), "hips"),
    ("head", (0, 0, 1.45), (0, 0, 2.20), "body"),
    ("arm.L", (0.38, 0, 1.30), (0.46, 0, 0.74), "body"),
    ("arm.R", (-0.38, 0, 1.30), (-0.46, 0, 0.74), "body"),
    ("leg.L", (0.16, 0, 0.45), (0.16, 0, 0.05), "hips"),
    ("leg.R", (-0.16, 0, 0.45), (-0.16, 0, 0.05), "hips"),
]
DUERGAR_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("hips", (0, 0, 0.45), (0, 0, 0.74), "root"),
    ("body", (0, 0, 0.74), (0, 0, 1.40), "hips"),
    ("head", (0, 0, 1.40), (0, 0, 2.10), "body"),
    ("arm.L", (0.56, 0, 1.22), (0.64, 0, 0.64), "body"),
    ("arm.R", (-0.56, 0, 1.22), (-0.64, 0, 0.64), "body"),
    ("leg.L", (0.24, 0, 0.48), (0.24, 0, 0.05), "hips"),
    ("leg.R", (-0.24, 0, 0.48), (-0.24, 0, 0.05), "hips"),
]
SNAKE_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("hips", (0, 0, 0.2), (0, 0, 0.42), "root"),
    ("neck1", (0, 0.06, 0.42), (0, 0.10, 0.90), "hips"),
    ("neck2", (0, 0.10, 0.90), (0, -0.22, 1.30), "neck1"),
    ("head", (0, -0.22, 1.30), (0, -0.30, 1.70), "neck2"),
]
BEAR_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("hips", (0, 0.28, 0.55), (0, 0.28, 0.95), "root"),
    ("body", (0, -0.12, 0.65), (0, -0.12, 1.05), "hips"),
    ("head", (0, -0.52, 0.92), (0, -0.52, 1.32), "body"),
    ("arm.L", (0.30, -0.32, 0.72), (0.30, -0.32, 0.05), "body"),
    ("arm.R", (-0.30, -0.32, 0.72), (-0.30, -0.32, 0.05), "body"),
    ("leg.L", (0.32, 0.40, 0.72), (0.32, 0.40, 0.05), "hips"),
    ("leg.R", (-0.32, 0.40, 0.72), (-0.32, 0.40, 0.05), "hips"),
]
DEVIL_BONES = ORC_BONES + [("tail", (0, 0.22, 0.70), (0, 0.95, 0.15), "hips")]
KOBOLD_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("hips", (0, 0, 0.50), (0, 0, 0.72), "root"),
    ("body", (0, 0, 0.72), (0, 0, 1.22), "hips"),
    ("head", (0, 0, 1.22), (0, 0, 1.80), "body"),
    ("arm.L", (0.36, 0, 1.10), (0.43, 0, 0.66), "body"),
    ("arm.R", (-0.36, 0, 1.10), (-0.43, 0, 0.66), "body"),
    ("leg.L", (0.2, 0, 0.55), (0.2, 0, 0.05), "hips"),
    ("leg.R", (-0.2, 0, 0.55), (-0.2, 0, 0.05), "hips"),
    ("tail", (0, 0.2, 0.60), (0, 0.85, 0.22), "hips"),
]

# Each move: (name, loops, [(frame, {bone: (rx, ry, rz) degrees or {"rot": ..., "loc": ...}})]).
# Bones bend about their own X; + leans the upright bones (hips, body, head) forward and
# swings arms and legs forward. "loc" is (side, up, forward) in the bone's own space.
MOVES = [
    ("Idle", True, [
        (0, {}),
        (30, {"hips": {"loc": (0, -0.025, 0)}, "body": (4, 0, 0), "head": (-4, 3, 0),
              "arm.L": (0, 0, 4), "arm.R": (0, 0, -4), "tail": (0, 0, 12)}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, {"leg.L": (28, 0, 0), "leg.R": (-28, 0, 0), "arm.L": (-22, 0, 0), "arm.R": (22, 0, 0),
             "body": (8, -6, 0), "hips": {"rot": (0, 6, 0)}, "tail": (0, 0, 15)}),
        (6, {"hips": {"loc": (0, 0.05, 0)}, "body": (8, 0, 0)}),
        (12, {"leg.L": (-28, 0, 0), "leg.R": (28, 0, 0), "arm.L": (22, 0, 0), "arm.R": (-22, 0, 0),
              "body": (8, 6, 0), "hips": {"rot": (0, -6, 0)}, "tail": (0, 0, -15)}),
        (18, {"hips": {"loc": (0, 0.05, 0)}, "body": (8, 0, 0)}),
        (24, {"leg.L": (28, 0, 0), "leg.R": (-28, 0, 0), "arm.L": (-22, 0, 0), "arm.R": (22, 0, 0),
              "body": (8, -6, 0), "hips": {"rot": (0, 6, 0)}, "tail": (0, 0, 15)}),
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


def build_rig(orc, size, bones):
    arm_data = bpy.data.armatures.new("Orc_Rig")
    rig = bpy.data.objects.new("Orc_Rig", arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in bones:
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
        pb = rig.pose.bones.get(bone)
        if pb is None:  # a bone this figure doesn't have (a tail)
            continue
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


# The snake's own moves (same names, so the board plays them the same way).
SNAKE_FALLEN = {"neck1": (70, 0, 25), "neck2": (55, 0, 10), "head": (25, 0, -20)}
SNAKE_MOVES = [
    ("Idle", True, [
        (0, {}),
        (30, {"neck1": (0, 0, 6), "neck2": (4, 0, -9), "head": (-4, 0, 6)}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, {"hips": {"rot": (0, 8, 0)}, "neck1": (0, 0, 10), "neck2": (0, 0, -12), "head": (0, 0, 8)}),
        (12, {"hips": {"rot": (0, -8, 0)}, "neck1": (0, 0, -10), "neck2": (0, 0, 12), "head": (0, 0, -8)}),
        (24, {"hips": {"rot": (0, 8, 0)}, "neck1": (0, 0, 10), "neck2": (0, 0, -12), "head": (0, 0, 8)}),
    ]),
    ("1H_Melee_Attack_Chop", False, [
        (0, {}),
        (10, {"neck1": (-18, 0, 0), "neck2": (-28, 0, 0), "head": (12, 0, 0)}),
        (15, {"neck1": (28, 0, 0), "neck2": (34, 0, 0), "head": (-12, 0, 0), "hips": {"loc": (0, 0, 0.10)}}),
        (22, {"neck1": (22, 0, 0), "neck2": (28, 0, 0), "head": (-8, 0, 0), "hips": {"loc": (0, 0, 0.06)}}),
        (34, {}),
    ]),
    ("Hit_A", False, [
        (0, {}),
        (5, {"neck1": (-20, 0, 8), "neck2": (-18, 0, 0), "head": (-18, 0, 0), "root": {"loc": (0, 0, -0.12)}}),
        (20, {}),
    ]),
    ("Dodge_Right", False, [
        (0, {}),
        (7, {"root": {"loc": (-0.3, 0, 0)}, "neck1": (0, 0, 18), "neck2": (0, 0, -10)}),
        (22, {}),
    ]),
    ("Cheer", False, [
        (0, {}),
        (10, {"neck1": (-14, 0, 0), "neck2": (-22, 0, 0), "head": (-12, 0, 0), "hips": {"loc": (0, 0.08, 0)}}),
        (17, {"neck1": (-10, 0, 8), "neck2": (-18, 0, -8), "head": (-8, 0, 0)}),
        (24, {"neck1": (-14, 0, 0), "neck2": (-22, 0, 0), "head": (-12, 0, 0), "hips": {"loc": (0, 0.08, 0)}}),
        (34, {}),
    ]),
    ("Death_A", False, [
        (0, {}),
        (10, {"neck1": (-12, 0, 0), "neck2": (-20, 0, 0), "head": (-15, 0, 0)}),
        (30, SNAKE_FALLEN),
    ]),
    ("Death_A_Pose", False, [(0, SNAKE_FALLEN), (1, SNAKE_FALLEN)]),
]

# The bear's own moves: it walks on all fours, rears up to maul and roar, falls on its side.
BEAR_GAIT = {"arm.L": (24, 0, 0), "arm.R": (-24, 0, 0), "leg.L": (-24, 0, 0), "leg.R": (24, 0, 0), "head": (0, 0, 5)}
BEAR_GAIT2 = {"arm.L": (-24, 0, 0), "arm.R": (24, 0, 0), "leg.L": (24, 0, 0), "leg.R": (-24, 0, 0), "head": (0, 0, -5)}
BEAR_FALLEN = {"root": {"rot": (0, 0, 82), "loc": (0, 0.42, 0)}, "head": (20, 0, 10),
               "arm.L": (30, 0, 0), "arm.R": (-20, 0, 0), "leg.L": (20, 0, 0), "leg.R": (-30, 0, 0)}
BEAR_REAR = {"body": (-38, 0, 0), "arm.L": (55, 0, 12), "arm.R": (65, 0, -12), "head": (-18, 0, 0),
             "hips": {"loc": (0, 0.05, 0)}}
BEAR_MOVES = [
    ("Idle", True, [
        (0, {}),
        (30, {"body": (3, 0, 0), "head": (-6, 6, 0), "hips": {"loc": (0, -0.02, 0)}}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, BEAR_GAIT),
        (6, {"hips": {"loc": (0, 0.03, 0)}}),
        (12, BEAR_GAIT2),
        (18, {"hips": {"loc": (0, 0.03, 0)}}),
        (24, BEAR_GAIT),
    ]),
    ("1H_Melee_Attack_Chop", False, [
        (0, {}),
        (10, BEAR_REAR),
        (16, {"body": (10, 0, 0), "arm.L": (25, 0, 0), "arm.R": (45, 0, 0), "head": (12, 0, 0),
              "hips": {"loc": (0, -0.03, 0)}}),
        (22, {"body": (8, 0, 0), "arm.R": (30, 0, 0), "head": (8, 0, 0)}),
        (34, {}),
    ]),
    ("Hit_A", False, [
        (0, {}),
        (5, {"body": (-14, 0, 5), "head": (-22, 0, 0), "root": {"loc": (0, 0, -0.12)}}),
        (20, {}),
    ]),
    ("Dodge_Right", False, [
        (0, {}),
        (7, {"root": {"loc": (-0.3, 0, 0), "rot": (0, 0, 8)}, "head": (0, 0, -8)}),
        (22, {}),
    ]),
    ("Cheer", False, [
        (0, {}),
        (10, BEAR_REAR),
        (16, {**BEAR_REAR, "head": (-28, 8, 0)}),
        (22, {**BEAR_REAR, "head": (-28, -8, 0)}),
        (34, {}),
    ]),
    ("Death_A", False, [
        (0, {}),
        (10, {"head": (15, 0, 0), "body": (8, 0, 0)}),
        (30, BEAR_FALLEN),
    ]),
    ("Death_A_Pose", False, [(0, BEAR_FALLEN), (1, BEAR_FALLEN)]),
]

# name, file, build, height, bones, extra moves (, own moves)
MONSTERS = [
    ("orc-smasher", "orc-smasher.glb", lambda: build_orc("mace"), 2.4, ORC_BONES, []),
    ("orc-archer", "orc-archer.glb", lambda: build_orc("bow"), 2.4, ORC_BONES, ["1H_Ranged_Shoot"]),
    ("kobold-dragonshield", "kobold-dragonshield.glb", build_kobold, 1.9, KOBOLD_BONES, []),
    ("human-cultist", "human-cultist.glb", build_cultist, 2.5, CULTIST_BONES, []),
    ("duergar-guard", "duergar-guard.glb", build_duergar, 2.15, DUERGAR_BONES, []),
    ("snake", "snake.glb", build_snake, 1.75, SNAKE_BONES, [], SNAKE_MOVES),
    ("cave-bear", "cave-bear.glb", build_bear, 1.65, BEAR_BONES, [], BEAR_MOVES),
    ("legion-devil", "legion-devil.glb", build_devil, 2.5, DEVIL_BONES, []),
]
# Moves only some figures have.
EXTRA_MOVES = {"1H_Ranged_Shoot"}


def make(label, file_name, build, height, bones, extra, own_moves=None):
    clear_scene()
    parts.clear()
    bpy.context.scene.render.fps = FPS
    material = palette_material()
    build()
    name = label.replace("-", "_").title()
    figure, size = join_parts(name, material, height)
    objs = [figure]
    moves = own_moves or [m for m in MOVES if m[0] not in EXTRA_MOVES or m[0] in extra]
    if ANIMATE:
        rig = build_rig(figure, size, bones)
        add_moves(rig, moves)
        objs = [rig, figure]
    path = os.path.join(OUTPUT_FOLDER, file_name)
    export_glb(objs, path)

    xs, ys, zs = ([v.co[i] for v in figure.data.vertices] for i in range(3))
    size_kb = os.path.getsize(path) / 1024
    tris = sum(len(p.vertices) - 2 for p in figure.data.polygons)
    print(f"{name}: {max(xs) - min(xs):.2f} wide, {max(ys) - min(ys):.2f} deep, {max(zs) - min(zs):.2f} tall, "
          f"{tris} triangles")
    print(f"  Moves: {', '.join(m[0] for m in moves) if ANIMATE else 'none'}")
    print(f"  Saved {path} ({size_kb:.1f} KB)")
    if size_kb > 5 * 1024:
        print("  WARNING: over 5 MB")


for monster in MONSTERS:
    if not ONLY or monster[0] in ONLY:
        make(*monster)
