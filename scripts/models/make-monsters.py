"""Builds the monsters' 3D figures for the 3D board as .glb files: Orc Smasher (a big
spiked mace), Orc Archer (a bow and a quiver), Kobold Dragonshield (a dragon shield
and a spear) Human Cultist (hooded robes, a sun sceptre and a dagger)
Duergar Guard (a helmet, a beard, a round shield and a warhammer)
Snake (coiled, with its own legless skeleton and moves) , Cave Bear
(on all fours; rears up to maul) , Legion Devil (horns, black armour, a tail and a longsword)
and Grell (a floating brain with a beak and tentacles).

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
    "brain": "b88c8e",
    "brain_dark": "7e5458",
    "brain_light": "d8b3ae",
    "beak": "3a3336",
    "flesh": "b98274",       # gibbering mouther
    "flesh_dark": "7f4c4a",
    "flesh_light": "d9aa96",
    "eye_white": "f2eee2",
    "eye_green": "7fbf3a",
    "storm": "5cc8ff",       # orc storm shaman's lightning
    "storm_dark": "2b5f8f",
    "gauth": "7a5c86",       # gauth
    "gauth_dark": "4c3858",
    "gauth_light": "b597b8",
    "otyugh": "7b7648",      # otyugh
    "otyugh_dark": "4f4b2c",
    "otyugh_light": "aaa36c",
    "drake": "c4471d",       # rage drake
    "drake_dark": "7a2412",
    "drake_belly": "e0a24a",
    "ash": "a3221a",         # ashardalon
    "ash_dark": "4e0f0b",
    "ash_belly": "d9a441",
    "ash_wing": "6e1813",
    "skin_light": "f1c9a2",  # villagers
    "shirt": "e6dcc4",
    "trousers": "4b4a58",
    "tunic_green": "4f7a3a",
    "tunic_blue": "3f5f8f",
    "dress_teal": "2f8a85",
    "shawl": "6b4a8a",
    "hair_brown": "5a3a22",
    "hair_red": "b0522a",
    "hair_blonde": "e3c46e",
    "cheek": "e59a8a",
    "doom_green": "2f7d32",  # Model Workshop: Easton's Doom Knight
    "doom_green_dark": "1b4a1e",
    "fel": "4dff3a",         # green flames and eyes
    "fel_light": "d4ff9e",
    "lizard": "4f8a3c",      # Colton's Lizard Mage
    "lizard_dark": "2f5a26",
    "lizard_belly": "c9c27a",
    "mage_robe": "5b2a86",
    "mage_robe_dark": "33184d",
    "silver": "d2d5dc",
    "arcane": "c77dff",
    "arcane_light": "f0dcff",
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

    shaman = weapon == "staff"
    if shaman:
        build_shaman_mantle()
    if not shaman:
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
    elif shaman:
        build_storm_staff()
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
        box(f"Paint.{tag}", "storm" if shaman else "red", "head", (0.22 * x, hy - 0.37, 1.80), (0.12, 0.03, 0.035), bevel=0.01,
            rot=(0, 18 * x, 0))
    box("Mohawk", "hair", "head", (0, hy + 0.04, 2.27), (0.12, 0.66, 0.18), bevel=0.05, rot=(-8, 0, 0))
    cone("Topknot", "hair", "head", (0, hy + 0.34, 2.24), 0.07, 0.30, rot=(-60, 0, 0), sides=6)
    if shaman:
        build_shaman_headdress(hy)


def build_shaman_mantle():
    """A shaggy fur mantle over both shoulders and a necklace of bones and a blue stone."""
    for i in range(9):
        a = DEG(-120 + i * 30)
        sphere(f"Mantle{i}", "fur_dark" if i % 2 else "fur", "body", (0.50 * math.sin(a), 0.30 * -math.cos(a) + 0.04,
               1.40 + 0.04 * math.cos(a)), 0.20, scale=(1.1, 1.0, 0.75), segments=10, rings=7)
    for side in (1, -1):
        sphere(f"MantleShoulder{side}", "fur", "body", (0.55 * side, 0.02, 1.40), 0.24, scale=(1.05, 1.1, 0.8),
               segments=10, rings=7)
    for i in range(7):
        a = DEG(-45 + i * 15)
        at = Vector((0.30 * math.sin(a), -0.33 - 0.04 * math.cos(a), 1.32 - 0.12 * math.cos(a)))
        cone(f"NeckBone{i}", "bone", "body", at, 0.035, 0.12, rot=(180, 0, 0), sides=5)
    sphere("NeckStone", "storm", "body", (0, -0.39, 1.16), 0.06, scale=(1, 0.6, 1.2), segments=8, rings=6)


def build_storm_staff():
    """A tall gnarled staff held upright in the right fist, a crackling blue orb caught in a
    forked top, feathers and a lightning bolt charm hanging from it."""
    up = Vector((0, -0.15, 1)).normalized()
    tilt = (-math.degrees(math.atan2(0.15, 1)), 0, 0)  # turns +Z to point along `up`
    for i, (length, r) in enumerate(((0.62, 0.055), (0.60, 0.05), (0.52, 0.045))):
        at = FIST_R + up * (-0.20 + sum(x for x, _ in ((0.62, 0), (0.60, 0), (0.52, 0))[:i]) + length / 2)
        side = 0.03 * (1 if i % 2 else -1)
        cone(f"StaffPart{i}", "wood", "arm.R", at + Vector((side, 0, 0)), r, length + 0.04,
             rot=(tilt[0], 6 * (1 if i % 2 else -1), 0), sides=6, tip=r * 0.9)
    box("StaffWrap", "leather_dark", "arm.R", FIST_R, (0.13, 0.13, 0.22), bevel=0.04, rot=tilt)
    top = FIST_R + up * 1.56
    orb = top + up * 0.20
    for side in (1, -1):
        cone(f"StaffFork{side}", "wood", "arm.R", top + Vector((0.10 * side, 0, 0.12)), 0.04, 0.32,
             rot=(tilt[0], -22 * side, 0), sides=5)
    sphere("StormOrb", "storm", "arm.R", orb, 0.15, segments=12, rings=8)
    sphere("StormCore", "eye_white", "arm.R", orb + Vector((0, -0.08, 0.02)), 0.06, scale=(1, 0.6, 1), segments=8,
           rings=6)
    # A zigzag lightning charm and two feathers under the fork.
    for i, (dx, dz, a) in enumerate(((0.0, -0.10, 30), (0.04, -0.20, -30), (0.0, -0.30, 30))):
        box(f"Bolt{i}", "storm", "arm.R", top + Vector((0.14 + dx, -0.04, dz)), (0.03, 0.03, 0.13), bevel=0.008,
            rot=(0, a, 0))
    for side in (1, -1):
        cone(f"StaffFeather{side}", "feather", "arm.R", top + Vector((-0.12 * side - 0.02, 0.02, -0.18)), 0.05,
             0.26, rot=(180, 15 * side, 0), scale=(1, 0.3, 1), sides=5)


def build_shaman_headdress(hy):
    """A beast skull worn over the brow, with curling horns, and a fan of feathers behind."""
    sphere("SkullCap", "bone", "head", (0, hy - 0.10, 2.22), 0.24, scale=(1.1, 1.1, 0.55), segments=12, rings=8)
    box("SkullSnout", "bone", "head", (0, hy - 0.40, 2.14), (0.18, 0.22, 0.12), bevel=0.05)
    for side in (1, -1):
        sphere(f"SkullSocket{side}", "black", "head", (0.09 * side, hy - 0.30, 2.22), 0.045, scale=(1, 0.6, 1),
               segments=8, rings=6)
        cone(f"HornA{side}", "bone", "head", (0.28 * side, hy - 0.05, 2.30), 0.07, 0.22, rot=(0, 60 * side, 0),
             sides=7, tip=0.055)
        cone(f"HornB{side}", "bone", "head", (0.40 * side, hy + 0.02, 2.42), 0.055, 0.20, rot=(-30, 20 * side, 0),
             sides=7, tip=0.035)
        cone(f"HornC{side}", "bone", "head", (0.42 * side, hy + 0.10, 2.56), 0.035, 0.14, rot=(-70, -10 * side, 0),
             sides=7)
    for i in range(5):
        a = DEG(-40 + i * 20)
        cone(f"Feather{i}", "storm_dark" if i % 2 else "feather", "head",
             (0.30 * math.sin(a), hy + 0.30, 2.30 + 0.18 * math.cos(a)), 0.06, 0.40,
             rot=(-25, math.degrees(a), 0), scale=(1, 0.3, 1), sides=5)


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


def build_kobold(lord=False):
    """A small red dragon-kin: snout, horns and crest, scale armour, a tail, a big shield with
    a dragon's face on the left arm and a spear in the right hand. The Kobold Dragonlord
    (`lord`) wears gold, a crown and a crimson cape and carries a curved sword instead."""
    metal = "gold" if lord else "iron"
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
    box("Breastplate", metal, "body", (0, -0.16, 1.04), (0.44, 0.12, 0.24), bevel=0.05)
    box("PlateRivets", "iron_dark", "body", (0, -0.225, 1.04), (0.30, 0.02, 0.04), bevel=0.008)
    for side in (1, -1):
        box(f"Strap{side}", "leather", "body", (0.16 * side, 0, 1.08), (0.08, 0.46, 0.26), bevel=0.02)
    box("Collar", metal, "body", (0, 0, 1.18), (0.50, 0.40, 0.08), bevel=0.03)
    sphere("Neck", "scale", "body", (0, -0.03, 1.24), 0.12, scale=(1, 1, 1.1))

    # Arms.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"Shoulder.{tag}", metal, arm, (0.36 * side, 0, 1.08), 0.11, scale=(1.1, 1, 0.9))
        box(f"Forearm.{tag}", "scale", arm, (0.41 * side, -0.02, 0.84), (0.14, 0.15, 0.26), bevel=0.05)
        sphere(f"Hand.{tag}", "scale_dark", arm, (0.43 * side, -0.04, 0.66), 0.085)

    hand = Vector((-0.43, -0.04, 0.66))
    d = Vector((0, -0.97, 0.26))  # 15 degrees above forward
    tilt = (75, 0, 0)  # turns a +Z part to point along d
    if lord:
        build_lord_extras(hand, d, tilt)
    else:
        build_kobold_spear(hand, d, tilt)
    build_kobold_shield_and_head(lord)


def build_kobold_spear(hand, d, tilt):
    """A spear in the right hand, its point forward and a little up, a red tassel under the head."""
    cone("SpearShaft", "wood", "arm.R", hand + d * 0.26, 0.04, 1.14, rot=tilt, sides=6, tip=0.03)
    cone("SpearButt", "iron_dark", "arm.R", hand - d * 0.32, 0.05, 0.06, rot=tilt, sides=6, tip=0.03)
    cone("SpearCollar", "iron_dark", "arm.R", hand + d * 0.82, 0.055, 0.06, rot=tilt, sides=6, tip=0.04)
    cone("SpearHead", "iron", "arm.R", hand + d * 0.99, 0.11, 0.30, rot=tilt, sides=4, scale=(1, 0.35, 1))
    sphere("Tassel", "red", "arm.R", hand + d * 0.78 + Vector((0, 0, -0.07)), 0.055, scale=(0.8, 0.8, 1.4),
           segments=8, rings=6)


def build_kobold_shield_and_head(lord):
    # The dragon shield on the left arm, facing forward.
    metal = "gold" if lord else "iron"
    sc = Vector((0.47, -0.17, 0.80))
    box("Shield", "scale_dark", "arm.L", sc, (0.50, 0.07, 0.66), bevel=0.06, segments=3)
    box("ShieldRim", metal, "arm.L", sc + Vector((0, 0.01, 0)), (0.56, 0.05, 0.72), bevel=0.06, segments=3)
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
    if lord:
        # A gold crown with five points and a red gem at the front.
        cone("CrownBand", "gold", "head", (0, 0.02, 1.66), 0.22, 0.08, sides=12, tip=0.23)
        for i in range(5):
            a = DEG(-90 + i * 72)
            cone(f"CrownPoint{i}", "gold", "head", (0.21 * math.cos(a), 0.02 + 0.21 * math.sin(a), 1.75), 0.045,
                 0.13, rot=(0, 0, 0), sides=4)
        sphere("CrownGem", "glow", "head", (0, -0.20, 1.67), 0.035, scale=(1, 0.6, 1.2), segments=8, rings=6)
        return
    for i, (y, z, h) in enumerate(((-0.05, 1.70, 0.12), (0.08, 1.70, 0.15), (0.20, 1.64, 0.12))):
        cone(f"Crest{i}", "crest", "head", (0, y, z), 0.06, h, rot=(-15, 0, 0), scale=(0.3, 1, 1), sides=4)


def build_lord_extras(hand, d, tilt):
    """The Dragonlord's curved sword (raised in the right hand) and crimson cape."""
    cone("SwordGrip", "leather_dark", "arm.R", hand, 0.035, 0.18, rot=tilt, sides=6, tip=0.035)
    sphere("SwordPommel", "gold", "arm.R", hand - d * 0.11, 0.04, segments=8, rings=6)
    box("SwordGuard", "gold", "arm.R", hand + d * 0.10, (0.24, 0.05, 0.05), bevel=0.015, rot=tilt)
    # The blade bends upward as it goes: three straight pieces.
    at, angle = hand + d * 0.12, 75
    for i, length in enumerate((0.34, 0.30, 0.26)):
        way = Vector((0, -math.sin(DEG(angle)), math.cos(DEG(angle))))
        width = 0.14 - 0.02 * i
        box(f"Blade{i}", "iron", "arm.R", at + way * length / 2, (0.025, width, length + 0.02), bevel=0.008,
            rot=(angle, 0, 0))
        at, angle = at + way * length, angle - 14
    cone("BladeTip", "iron", "arm.R", at, 0.075, 0.13, rot=(angle, 0, 0), scale=(0.25, 1, 1), sides=4)

    # The cape hangs from gold clasps behind the shoulders, a little flared at the bottom.
    box("Cape", "red", "body", (0, 0.26, 0.86), (0.60, 0.05, 0.62), bevel=0.02, rot=(-10, 0, 0))
    box("CapeHem", "robe", "body", (0, 0.32, 0.56), (0.66, 0.06, 0.06), bevel=0.02, rot=(-10, 0, 0))
    box("CapeCollar", "red", "body", (0, 0.18, 1.20), (0.56, 0.12, 0.10), bevel=0.04)
    for side in (1, -1):
        sphere(f"Clasp{side}", "gold", "body", (0.24 * side, -0.12, 1.16), 0.05, scale=(1, 0.6, 1),
               segments=8, rings=6)


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


# The five villagers: (tunic, legs "trousers" or a dress colour, hair, extras).
VILLAGERS = {
    "alek": ("tunic_green", "trousers", "hair_brown"),
    "brandis": ("tunic_blue", "trousers", "hair_brown"),
    "cassi": ("dress_teal", "dress_teal", "hair_red"),
    "donnel": ("leather", "trousers", "beard"),
    "elizar": ("shawl", "shawl", "hair_blonde"),
}


def build_villager(who):
    """A townsperson from Firestorm Peak's villages, friendly and a bit nervous. Alek is a
    farmhand with wrapped fists, Brandis an explorer with a hat, pack and lantern, Cassi a
    girl with a red braid and satchel, Donnel a big bald brawler with a black beard, and
    Elizar a timid woman in a shawl, hands clasped."""
    tunic, legs, hair = VILLAGERS[who]
    big = 1.18 if who == "donnel" else 1.0
    dress = legs != "trousers"
    for side, tag in ((1, "L"), (-1, "R")):
        leg = f"leg.{tag}"
        box(f"Boot.{tag}", "leather_dark", leg, (0.15 * side, -0.08, 0.07), (0.19, 0.28, 0.14), bevel=0.05)
        if not dress:
            cone(f"Shin.{tag}", legs, leg, (0.15 * side, 0, 0.30), 0.10, 0.40, sides=8, tip=0.11)
    if dress:
        cone("Skirt", legs, "hips", (0, 0, 0.50), 0.40, 0.70, sides=12, tip=0.26)
        cone("SkirtHem", "shirt", "hips", (0, 0, 0.17), 0.405, 0.05, sides=12, tip=0.40)
    else:
        box("Seat", legs, "hips", (0, 0, 0.58), (0.46, 0.34, 0.24), bevel=0.08)
    box("Belt", "leather_dark", "hips", (0, 0, 0.78), (0.52 * big, 0.38 * big, 0.07), bevel=0.02)
    box("Buckle", "gold", "hips", (0, -0.20 * big, 0.78), (0.09, 0.03, 0.07), bevel=0.01)

    # Body: a tunic over a pale shirt collar.
    box("Torso", tunic, "body", (0, 0, 1.05), (0.54 * big, 0.38 * big, 0.52), bevel=0.15, segments=3)
    box("Collar", "shirt", "body", (0, -0.12, 1.30), (0.26, 0.14, 0.06), bevel=0.02)
    if who == "donnel":
        # A leather vest open over a bare chest.
        box("Chest", "skin_light", "body", (0, -0.20, 1.06), (0.22, 0.05, 0.42), bevel=0.02)
    if who == "elizar":
        sphere("Shawl", "shawl", "body", (0, 0.02, 1.30), 0.36, scale=(1.05, 0.9, 0.45), segments=12, rings=8)
        cone("ShawlTail", "shawl", "body", (0, 0.22, 1.05), 0.16, 0.40, rot=(180, 0, 0), sides=6, tip=0.04)
    if who == "brandis":
        box("Pack", "leather", "body", (0, 0.30, 1.05), (0.42, 0.20, 0.46), bevel=0.06)
        box("PackFlap", "leather_dark", "body", (0, 0.32, 1.24), (0.44, 0.22, 0.10), bevel=0.03)
        sphere("Bedroll", "red", "body", (0, 0.30, 1.34), 0.09, scale=(2.6, 1, 1), segments=10, rings=6)
        box("Scarf", "red", "body", (0, -0.06, 1.32), (0.40, 0.30, 0.08), bevel=0.03)
    if who == "cassi":
        box("SatchelStrap", "leather", "body", (0, 0, 1.05), (0.06, 0.42, 0.62), bevel=0.01, rot=(0, -38, 0))
        box("Satchel", "leather", "body", (-0.30, -0.06, 0.78), (0.10, 0.26, 0.22), bevel=0.04)

    # Arms: sleeves (rolled up for Alek and Donnel) and hands.
    bare = who in ("alek", "donnel")
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        x = 0.36 * big * side
        sphere(f"Shoulder.{tag}", tunic, arm, (x, 0, 1.22), 0.12 * big)
        cone(f"Sleeve.{tag}", "skin_light" if bare else tunic, arm, (x * 1.06, -0.01, 1.00), 0.10 * big, 0.36,
             rot=(180, 0, 0), sides=8, tip=0.08 * big)
        if bare:
            cone(f"Roll.{tag}", "shirt" if who == "alek" else tunic, arm, (x * 1.04, -0.01, 1.14), 0.11 * big,
                 0.06, sides=8, tip=0.11 * big)
        if who == "alek":
            cone(f"Wrap.{tag}", "shirt", arm, (x * 1.1, -0.03, 0.80), 0.085, 0.08, sides=8, tip=0.085)
        sphere(f"Hand.{tag}", "skin_light", arm, (x * 1.12, -0.04, 0.74), 0.085 * big)
    if who == "brandis":
        # A lantern hanging from the left hand.
        hand = Vector((0.40, -0.04, 0.74))
        box("LanternTop", "iron_dark", "arm.L", hand + Vector((0, 0, -0.12)), (0.12, 0.12, 0.04), bevel=0.01)
        box("LanternGlass", "eye", "arm.L", hand + Vector((0, 0, -0.22)), (0.10, 0.10, 0.14), bevel=0.02)
        box("LanternBase", "iron_dark", "arm.L", hand + Vector((0, 0, -0.31)), (0.13, 0.13, 0.04), bevel=0.01)

    # Head: a big friendly face, round eyes, rosy cheeks, ears and the hair for each one.
    hz = 1.72
    sphere("Face", "skin_light", "head", (0, -0.02, hz), 0.32, scale=(1.0, 0.95, 1.0), segments=16, rings=10)
    for side in (1, -1):
        sphere(f"Ear{side}", "skin_light", "head", (0.31 * side, 0.0, hz), 0.07, scale=(0.5, 1, 1.1), segments=8,
               rings=6)
        sphere(f"EyeWhite{side}", "eye_white", "head", (0.11 * side, -0.27, hz + 0.02), 0.06, scale=(1, 0.5, 1.15),
               segments=10, rings=7)
        sphere(f"Pupil{side}", "black", "head", (0.11 * side, -0.30, hz + 0.01), 0.035, scale=(1, 0.5, 1.2),
               segments=8, rings=6)
        sphere(f"Cheek{side}", "cheek", "head", (0.19 * side, -0.24, hz - 0.08), 0.045, scale=(1.2, 0.4, 0.8),
               segments=8, rings=5)
        worry = 14 if who in ("elizar", "cassi") else (-12 if who == "donnel" else 0)
        box(f"Brow{side}", "beard" if who == "donnel" else hair, "head", (0.11 * side, -0.28, hz + 0.12),
            (0.10, 0.03, 0.025), bevel=0.008, rot=(0, worry * side, 0))
    sphere("Nose", "skin_light", "head", (0, -0.31, hz - 0.04), 0.045, scale=(1, 0.8, 1), segments=8, rings=6)
    if who in ("elizar", "cassi"):
        sphere("Mouth", "black", "head", (0, -0.29, hz - 0.15), 0.025, scale=(1, 0.5, 1.2), segments=8, rings=5)
    else:
        box("Mouth", "black", "head", (0, -0.295, hz - 0.15), (0.09, 0.02, 0.02), bevel=0.006)

    if who == "donnel":
        sphere("BeardBig", "beard", "head", (0, -0.17, hz - 0.22), 0.24, scale=(1.1, 0.7, 1.0), segments=12, rings=8)
        box("Moustache", "beard", "head", (0, -0.31, hz - 0.10), (0.20, 0.06, 0.05), bevel=0.02)
        return
    sphere("HairCap", hair, "head", (0, 0.04, hz + 0.08), 0.335, scale=(1.04, 1.0, 0.88), segments=16, rings=10)
    box("Fringe", hair, "head", (0, -0.22, hz + 0.22), (0.44, 0.14, 0.10), bevel=0.04, rot=(-20, 0, 0))
    if who == "alek":
        box("Stubble", "hair_brown", "head", (0, -0.24, hz - 0.20), (0.24, 0.10, 0.08), bevel=0.03)
    if who == "brandis":
        cone("HatBrim", "leather", "head", (0, 0.02, hz + 0.24), 0.52, 0.04, sides=16, tip=0.52)
        cone("HatCrown", "leather", "head", (0, 0.03, hz + 0.36), 0.28, 0.24, sides=12, tip=0.22)
        cone("HatBand", "red", "head", (0, 0.03, hz + 0.29), 0.285, 0.06, sides=12, tip=0.27)
    if who == "cassi":
        for i in range(5):
            sphere(f"Braid{i}", hair, "head", (0, 0.32 + 0.02 * i, hz - 0.05 - 0.12 * i), 0.09 - 0.008 * i,
                   segments=8, rings=6)
        sphere("BraidTie", "dress_teal", "head", (0, 0.40, hz - 0.62), 0.05, segments=8, rings=6)
    if who == "elizar":
        for side in (1, -1):
            sphere(f"LongHair{side}", hair, "head", (0.26 * side, 0.06, hz - 0.30), 0.13, scale=(0.8, 1, 2.2),
                   segments=10, rings=7)
        sphere("HairBack", hair, "head", (0, 0.20, hz - 0.25), 0.25, scale=(1.1, 0.7, 1.6), segments=10, rings=7)


def build_duergar(captain=False):
    """A stocky grey dwarf in dark iron: a nose-guard helmet with a spike, glowing red eyes, a
    huge braided beard, a round shield on the left arm and a warhammer in the right fist. The
    Duergar Captain (`captain`) has a horned helm, gold trim, spiked pauldrons, a black cape
    and a big double-bladed axe instead of the hammer and shield."""
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
    box("PlateRidge", "gold" if captain else "iron_dark", "body", (0, -0.335, 1.02), (0.08, 0.04, 0.50), bevel=0.015)
    for side in (1, -1):
        sphere(f"Pauldron{side}", "iron_dark", "body", (0.52 * side, 0, 1.26), 0.26, scale=(1.1, 1.05, 0.7))
        for i, y in enumerate((-0.12, 0.0, 0.12)):
            sphere(f"Rivet{side}{i}", "gold", "body", (0.62 * side, y, 1.42), 0.03, segments=6, rings=4)
        if captain:
            for i, y in enumerate((-0.10, 0.10)):
                cone(f"PauldronSpike{side}{i}", "bone", "body", (0.60 * side, y, 1.40), 0.06, 0.24,
                     rot=(0, 30 * side, 0), sides=5)
    if captain:
        # A black cape with a gold clasp at each shoulder.
        box("Cape", "armour", "body", (0, 0.40, 0.80), (0.92, 0.06, 0.88), bevel=0.03, rot=(-6, 0, 0))
        box("CapeLining", "red", "body", (0, 0.36, 0.84), (0.86, 0.03, 0.78), bevel=0.01, rot=(-6, 0, 0))
        for side in (1, -1):
            sphere(f"CapeClasp{side}", "gold", "body", (0.36 * side, 0.32, 1.30), 0.06, segments=8, rings=6)
        box("PlateTrim", "gold", "body", (0, -0.30, 1.30), (0.80, 0.06, 0.06), bevel=0.02)

    # Arms: grey skin, iron gauntlets and fists.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"UpperArm.{tag}", "skin_grey", arm, (0.60 * side, 0, 1.05), 0.15, scale=(1, 1, 1.2))
        box(f"Gauntlet.{tag}", "iron_dark", arm, (0.63 * side, -0.02, 0.83), (0.27, 0.27, 0.28), bevel=0.07)
        sphere(f"Fist.{tag}", "iron_dark", arm, (0.64 * side, -0.05, 0.64), 0.15)

    fist = Vector((-0.64, -0.05, 0.64))
    d = Vector((0, -0.866, -0.5))
    tilt = (120, 0, 0)
    if captain:
        build_great_axe(fist)
    else:
        build_duergar_hammer_and_shield(fist, d, tilt)
    build_duergar_head(captain)


def build_duergar_hammer_and_shield(fist, d, tilt):
    # Warhammer in the right fist, its head resting forward and down.
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


def build_great_axe(fist, gem="glow", flames=False):
    """A long-hafted double axe held upright in the right fist, the blades above the head."""
    up = Vector((0, -0.2, 1)).normalized()
    tilt = (-math.degrees(math.atan2(0.2, 1)), 0, 0)  # turns +Z to point along `up`
    cone("AxeHaft", "wood", "arm.R", fist + up * 0.45, 0.05, 1.50, rot=tilt, sides=6, tip=0.045)
    cone("AxeButt", "iron_dark", "arm.R", fist - up * 0.32, 0.07, 0.10, rot=tilt, sides=6, tip=0.03)
    box("AxeGrip", "leather_dark", "arm.R", fist, (0.12, 0.12, 0.24), bevel=0.04, rot=tilt)
    head = fist + up * 1.05
    box("AxeSocket", "iron_dark", "arm.R", head, (0.14, 0.16, 0.30), bevel=0.04, rot=tilt)
    cone("AxeTop", "iron", "arm.R", head + up * 0.24, 0.05, 0.18, rot=tilt, sides=4)
    for side in (1, -1):
        # A half-moon blade on each side: a flat oval, a bright cutting edge and hooked tips.
        sphere(f"AxeBlade{side}", "iron_dark", "arm.R", head + Vector((0.24 * side, 0, 0)), 0.30,
               scale=(0.75, 0.12, 1.15), rot=tilt, segments=16, rings=10)
        sphere(f"AxeEdge{side}", "iron", "arm.R", head + Vector((0.36 * side, 0, 0)), 0.30,
               scale=(0.42, 0.09, 1.08), rot=tilt, segments=16, rings=10)
    sphere("AxeGem", gem, "arm.R", head + Vector((0, -0.09, 0)), 0.045, scale=(1, 0.5, 1), segments=8, rings=6)
    if flames:
        # Green fire licking up off both blades.
        for side in (1, -1):
            for i, (dz, h, r) in enumerate(((-0.20, 0.26, 0.07), (0.0, 0.34, 0.08), (0.20, 0.30, 0.07))):
                at = head + Vector((0.46 * side, 0, dz + h / 2))
                cone(f"AxeFlame{side}{i}", "fel", "arm.R", at, r, h, rot=(tilt[0], -20 * side, 0), sides=6)
                cone(f"AxeFlameCore{side}{i}", "fel_light", "arm.R", at + Vector((-0.02 * side, -0.02, -h * 0.15)),
                     r * 0.5, h * 0.6, rot=(tilt[0], -20 * side, 0), sides=5)
        for i, (dx, h) in enumerate(((-0.08, 0.22), (0.08, 0.26))):
            cone(f"AxeTopFlame{i}", "fel", "arm.R", head + up * 0.36 + Vector((dx, 0, h / 2)), 0.06, h, rot=tilt, sides=6)


def build_doom_axe(fist, gem="fel", flames=True):
    """Easton's axe: a long-hafted double axe held upright in the right fist, its blades front and back."""
    up = Vector((0, -0.2, 1)).normalized()
    tilt = (math.degrees(math.atan2(0.2, 1)), 0, 0)  # turns +Z to point along `up`
    # The blades stick out front and back (Easton: sideways they swung through his head).
    out = Vector((0, 1, 0.2)).normalized()
    # One haft from the butt cap right up through the socket, so every piece touches the next.
    cone("AxeHaft", "wood", "arm.R", fist + up * 0.45, 0.05, 1.50, rot=tilt, sides=6, tip=0.045)
    cone("AxeButt", "iron_dark", "arm.R", fist - up * 0.31, 0.07, 0.10, rot=tilt, sides=6, tip=0.045)
    box("AxeGrip", "leather_dark", "arm.R", fist, (0.12, 0.12, 0.24), bevel=0.04, rot=tilt)
    for i, along in enumerate((0.40, 0.70)):
        cone(f"AxeBand{i}", "iron_dark", "arm.R", fist + up * along, 0.065, 0.05, rot=tilt, sides=6, tip=0.065)
    head = fist + up * 1.05
    box("AxeSocket", "iron_dark", "arm.R", head, (0.16, 0.20, 0.34), bevel=0.04, rot=tilt)
    cone("AxeTop", "iron", "arm.R", head + up * 0.25, 0.06, 0.20, rot=tilt, sides=4)
    for side in (1, -1):
        # A half-moon blade front and back, joined to the socket by a thick neck: a flat oval,
        # a bright cutting edge.
        box(f"AxeNeck{side}", "iron_dark", "arm.R", head + out * 0.13 * side, (0.10, 0.14, 0.22), bevel=0.03, rot=tilt)
        sphere(f"AxeBlade{side}", "iron_dark", "arm.R", head + out * 0.26 * side, 0.30,
               scale=(0.12, 0.70, 1.12), rot=tilt, segments=16, rings=10)
        sphere(f"AxeEdge{side}", "iron", "arm.R", head + out * 0.37 * side, 0.30,
               scale=(0.09, 0.40, 1.06), rot=tilt, segments=16, rings=10)
    for side in (1, -1):
        sphere(f"AxeGem{side}", gem, "arm.R", head + Vector((0.09 * side, 0, 0)), 0.045, scale=(0.5, 1, 1), segments=8, rings=6)
    if flames:
        # Green fire licking up off both blades.
        for side in (1, -1):
            lean = (tilt[0] - 20 * side, 0, 0)
            for i, (dz, h, r) in enumerate(((-0.20, 0.26, 0.07), (0.0, 0.34, 0.08), (0.20, 0.30, 0.07))):
                at = head + out * 0.46 * side + Vector((0, 0, dz + h / 2))
                cone(f"AxeFlame{side}{i}", "fel", "arm.R", at, r, h, rot=lean, sides=6)
                cone(f"AxeFlameCore{side}{i}", "fel_light", "arm.R", at + out * -0.02 * side + Vector((0, 0, -h * 0.15)),
                     r * 0.5, h * 0.6, rot=lean, sides=5)
        for i, (dy, h) in enumerate(((-0.08, 0.22), (0.08, 0.26))):
            cone(f"AxeTopFlame{i}", "fel", "arm.R", head + up * 0.38 + Vector((0, dy, h / 2)), 0.06, h, rot=tilt, sides=6)


def build_duergar_head(captain):
    # Head: grey face under a spiked nose-guard helm, red eyes, a big braided beard.
    sphere("Face", "skin_grey", "head", (0, -0.04, 1.62), 0.33, scale=(1.05, 0.95, 1.0), segments=16, rings=10)
    sphere("Helm", "iron", "head", (0, 0.0, 1.80), 0.37, scale=(1.05, 1.02, 0.78), segments=16, rings=10)
    cone("HelmBrim", "gold", "head", (0, 0.0, 1.77), 0.385, 0.06, sides=16, tip=0.385)
    box("NoseGuard", "iron_dark", "head", (0, -0.37, 1.69), (0.06, 0.05, 0.16), bevel=0.02)
    cone("HelmSpike", "gold" if captain else "iron_dark", "head", (0, 0.0, 2.12), 0.07, 0.20, sides=6)
    for side in (1, -1):
        if captain:
            # Big curved horns: out from the helm, then up.
            cone(f"HornBase{side}", "bone", "head", (0.42 * side, 0.02, 1.88), 0.09, 0.24, rot=(0, 80 * side, 0),
                 sides=8, tip=0.065)
            cone(f"HornMid{side}", "bone", "head", (0.58 * side, 0.02, 1.98), 0.065, 0.20, rot=(0, 40 * side, 0),
                 sides=8, tip=0.045)
            cone(f"HornTip{side}", "bone", "head", (0.65 * side, 0.02, 2.14), 0.045, 0.18, rot=(0, 8 * side, 0),
                 sides=8)
            continue
        cone(f"HelmWing{side}", "iron_dark", "head", (0.36 * side, 0.02, 1.86), 0.06, 0.22,
             rot=(0, 55 * side, 0), scale=(1, 0.35, 1), sides=4)
    for side in (1, -1):
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


# ---- Model Workshop figures (the boys' own designs, scripts/models/WORKSHOP.md) -------------

def build_doom_knight():
    """Easton's hero: a big (not too bulky) iron warlord in black and silver armour with a green hood and cape,
    black horns, glowing green eyes behind a silver mask, green flames rising from his head, and
    a huge double axe with a green gem."""
    for side, tag in ((1, "L"), (-1, "R")):
        x = 0.22 * side
        leg = f"leg.{tag}"
        box(f"Boot.{tag}", "armour", leg, (x, -0.05, 0.13), (0.34, 0.48, 0.26), bevel=0.08)
        box(f"BootToe.{tag}", "iron", leg, (x, -0.26, 0.10), (0.30, 0.14, 0.16), bevel=0.06)
        box(f"Greave.{tag}", "iron", leg, (x, -0.02, 0.43), (0.28, 0.30, 0.34), bevel=0.09)
        box(f"Knee.{tag}", "iron_dark", leg, (x, -0.17, 0.55), (0.20, 0.08, 0.14), bevel=0.04)

    # Hips: a black plated skirt, a green belt and a green front flap.
    cone("Skirt", "armour", "hips", (0, 0, 0.70), 0.42, 0.34, sides=12, tip=0.36)
    box("Belt", "doom_green_dark", "hips", (0, 0, 0.86), (0.76, 0.52, 0.12), bevel=0.04)
    box("Buckle", "iron", "hips", (0, -0.27, 0.86), (0.22, 0.06, 0.16), bevel=0.02)
    box("Flap", "doom_green", "hips", (0, -0.25, 0.62), (0.34, 0.05, 0.40), bevel=0.02, rot=(-6, 0, 0))

    # A broad silver breastplate with a green tunic under it and a long green cape.
    box("Tunic", "doom_green", "body", (0, 0.04, 1.06), (0.70, 0.46, 0.52), bevel=0.20, segments=3)
    box("Breastplate", "iron", "body", (0, -0.03, 1.10), (0.76, 0.50, 0.62), bevel=0.18, segments=3)
    box("PlateRidge", "iron_dark", "body", (0, -0.27, 1.18), (0.08, 0.04, 0.42), bevel=0.015)
    sphere("ChestGem", "fel", "body", (0, -0.28, 1.30), 0.06, scale=(1, 0.5, 1), segments=8, rings=6)
    # The cape: a mantle over the shoulders, then heavy cloth falling in folds that flare out
    # toward a pointed hem, with a dark lining showing between them.
    sphere("CapeMantle", "doom_green", "body", (0, 0.12, 1.38), 0.44, scale=(1.08, 0.78, 0.36), segments=16, rings=8)
    box("CapeLining", "doom_green_dark", "body", (0, 0.29, 0.92), (0.78, 0.03, 0.98), bevel=0.01, rot=(5, 0, 0))
    for i in range(6):
        x = -0.375 + i * 0.15
        back = 0.33 + (0.035 if i % 2 else 0)
        flare = (6, -x * 28, 0)
        cone(f"CapeFold{i}", "doom_green", "body", (x * 1.05, back, 0.88), 0.10, 1.10, rot=flare,
             scale=(1, 0.45, 1), sides=8, tip=0.075)
        cone(f"CapeHem{i}", "doom_green_dark", "body", (x * 1.18, back + 0.06, 0.30), 0.075, 0.16,
             rot=(186, x * 28, 0), scale=(1, 0.4, 1), sides=6)
    for side in (1, -1):
        sphere(f"Pauldron{side}", "armour", "body", (0.46 * side, 0, 1.40), 0.23, scale=(1.15, 1.05, 0.72))
        sphere(f"PauldronRim{side}", "iron", "body", (0.48 * side, 0, 1.34), 0.21, scale=(1.2, 1.1, 0.35))
        cone(f"PauldronSpike{side}", "iron", "body", (0.56 * side, 0, 1.56), 0.07, 0.24, rot=(0, 28 * side, 0), sides=5)
        sphere(f"CapeClasp{side}", "fel", "body", (0.28 * side, 0.24, 1.40), 0.06, segments=8, rings=6)

    # Arms: green sleeves, silver gauntlets, black fists.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        sphere(f"UpperArm.{tag}", "doom_green", arm, (0.54 * side, 0, 1.12), 0.13, scale=(1, 1, 1.25))
        box(f"Gauntlet.{tag}", "iron", arm, (0.57 * side, -0.02, 0.90), (0.24, 0.24, 0.30), bevel=0.07)
        cone(f"GauntletFlare.{tag}", "iron_dark", arm, (0.57 * side, -0.02, 1.04), 0.16, 0.06, sides=8, tip=0.16)
        sphere(f"Fist.{tag}", "armour", arm, (0.58 * side, -0.05, 0.70), 0.14)

    build_doom_axe(Vector((-0.72, -0.05, 0.70)))

    # Head: a green hood round a silver mask, green eye slits, black horns, green flames on top.
    sphere("Hood", "doom_green", "head", (0, 0.06, 1.88), 0.44, scale=(1.08, 1.0, 1.02), segments=16, rings=10)
    sphere("HoodShadow", "doom_green_dark", "head", (0, -0.06, 1.84), 0.38, scale=(1.0, 0.9, 1.0), segments=16, rings=10)
    # The hood comes forward over the top of the faceplate and down its sides.
    sphere("HoodCowl", "doom_green", "head", (0, -0.24, 2.03), 0.31, scale=(1.0, 0.78, 0.42), segments=16, rings=10)
    sphere("HoodCowlEdge", "doom_green_dark", "head", (0, -0.30, 1.98), 0.28, scale=(0.98, 0.62, 0.22), segments=16, rings=8)
    for side in (1, -1):
        box(f"HoodSide{side}", "doom_green", "head", (0.28 * side, -0.24, 1.78), (0.07, 0.30, 0.52), bevel=0.03)
    # An iron warlord's faceplate (set back into the hood: Easton said it stuck out): flat and square-jawed, riveted, with narrow glowing eye
    # slits, a straight nose ridge and a thin mouth slot over a grille.
    box("Mask", "iron", "head", (0, -0.25, 1.80), (0.50, 0.30, 0.58), bevel=0.11, segments=3)
    box("MaskFace", "iron", "head", (0, -0.39, 1.80), (0.42, 0.04, 0.50), bevel=0.04)
    box("MaskBrow", "iron_dark", "head", (0, -0.415, 1.92), (0.44, 0.05, 0.05), bevel=0.015)
    box("MaskNose", "iron", "head", (0, -0.425, 1.80), (0.06, 0.05, 0.22), bevel=0.015)
    box("MaskMouth", "black", "head", (0, -0.415, 1.63), (0.24, 0.03, 0.025), bevel=0.008)
    for i, x in enumerate((-0.09, 0.02, 0.03, 0.09)):
        box(f"MaskGrille{i}", "iron_dark", "head", (x, -0.465, 1.585), (0.018, 0.03, 0.06), bevel=0.004)
    box("MaskChin", "iron_dark", "head", (0, -0.38, 1.53), (0.30, 0.06, 0.05), bevel=0.02)
    for side in (1, -1):
        box(f"EyeSlit{side}", "black", "head", (0.11 * side, -0.415, 1.85), (0.14, 0.03, 0.045), bevel=0.01)
        box(f"Eye{side}", "fel", "head", (0.11 * side, -0.425, 1.85), (0.11, 0.03, 0.025), bevel=0.008)
        box(f"Cheek{side}", "iron_dark", "head", (0.19 * side, -0.405, 1.70), (0.03, 0.04, 0.22), bevel=0.01)
        for j, z in enumerate((1.96, 1.80, 1.64)):
            sphere(f"Rivet{side}{j}", "iron_dark", "head", (0.225 * side, -0.415, z), 0.022, segments=6, rings=4)
        # Big black horns curling out of the hood, then up.
        cone(f"HornBase{side}", "armour", "head", (0.40 * side, -0.02, 2.04), 0.10, 0.26, rot=(0, 70 * side, 0),
             sides=8, tip=0.075)
        cone(f"HornMid{side}", "armour", "head", (0.56 * side, -0.02, 2.17), 0.075, 0.22, rot=(0, 30 * side, 0),
             sides=8, tip=0.05)
        cone(f"HornTip{side}", "iron", "head", (0.61 * side, -0.02, 2.34), 0.05, 0.20, rot=(0, -5 * side, 0), sides=8)
    # Green flames: tall bright tongues in the middle, shorter ones round them, pale cores.
    flames = [(0.0, 0.02, 0.14, 0.62, 0), (0.15, 0.06, 0.10, 0.44, -14), (-0.15, 0.06, 0.10, 0.46, 14),
              (0.07, 0.18, 0.09, 0.40, -8), (-0.08, 0.18, 0.09, 0.36, 10), (0.24, -0.04, 0.07, 0.30, -24),
              (-0.24, -0.04, 0.07, 0.32, 24)]
    for i, (x, y, r, h, lean) in enumerate(flames):
        cone(f"Flame{i}", "fel", "head", (x, y, 2.20 + h / 2), r, h, rot=(0, lean, 0), sides=6)
        cone(f"FlameCore{i}", "fel_light", "head", (x * 0.9, y - 0.03, 2.18 + h * 0.35), r * 0.5, h * 0.6,
             rot=(0, lean, 0), sides=5)


def build_lizard_mage():
    """Colton's hero: a lizard wizard in a purple robe with silver trim, a black mask over his
    mouth (only his mouth), yellow slit eyes, a spiky crest, a tail poking out under the robe,
    and a tall black staff with a glowing purple orb in a silver cage."""
    for side, tag in ((1, "L"), (-1, "R")):
        leg = f"leg.{tag}"
        box(f"Foot.{tag}", "lizard", leg, (0.17 * side, -0.10, 0.07), (0.22, 0.32, 0.13), bevel=0.05)
        for i, dx in enumerate((-0.07, 0.0, 0.07)):
            cone(f"Claw.{tag}{i}", "bone", leg, (0.17 * side + dx, -0.28, 0.05), 0.025, 0.08, rot=(90, 0, 0), sides=4)
        cone(f"Shin.{tag}", "lizard_dark", leg, (0.16 * side, 0, 0.25), 0.09, 0.30, sides=8, tip=0.09)

    # A tail curling out from under the back of the robe.
    tail = [((0, 0.36, 0.40), 0.12), ((0, 0.52, 0.30), 0.10), ((0.04, 0.66, 0.20), 0.08), ((0.10, 0.78, 0.13), 0.06)]
    for i, (at, r) in enumerate(tail):
        sphere(f"Tail{i}", "lizard", "tail", at, r, scale=(1, 1.3, 0.9))
    cone("TailTip", "lizard_dark", "tail", (0.15, 0.88, 0.10), 0.05, 0.14, rot=(-80, 0, -20), sides=6)

    # The long purple robe: silver hem, black sash, a dark front panel with a silver rune.
    cone("Robe", "mage_robe", "hips", (0, 0, 0.55), 0.46, 0.80, sides=12, tip=0.31)
    cone("Hem", "silver", "hips", (0, 0, 0.17), 0.47, 0.05, sides=12, tip=0.465)
    box("Panel", "mage_robe_dark", "hips", (0, -0.30, 0.52), (0.22, 0.06, 0.72), bevel=0.02, rot=(-12, 0, 0))
    box("PanelRune", "silver", "hips", (0, -0.355, 0.62), (0.10, 0.02, 0.10), bevel=0.01, rot=(-12, 0, 45))
    sphere("PanelGem", "arcane", "hips", (0, -0.37, 0.62), 0.03, scale=(1, 0.5, 1), segments=8, rings=6)
    box("Sash", "black", "hips", (0, 0, 0.94), (0.66, 0.50, 0.08), bevel=0.03)
    box("SashKnot", "black", "hips", (0.18, -0.24, 0.86), (0.10, 0.05, 0.16), bevel=0.02, rot=(0, 0, 12))

    # Upper body: robe, a black mantle with silver trim and a silver amulet.
    box("Torso", "mage_robe", "body", (0, 0, 1.14), (0.60, 0.44, 0.44), bevel=0.15, segments=3)
    sphere("Mantle", "black", "body", (0, 0.02, 1.34), 0.36, scale=(1.12, 0.92, 0.42))
    cone("MantleTrim", "silver", "body", (0, 0.02, 1.27), 0.37, 0.03, sides=16, tip=0.37)
    sphere("Amulet", "silver", "body", (0, -0.25, 1.16), 0.06, scale=(1, 0.5, 1))
    sphere("AmuletGem", "arcane", "body", (0, -0.28, 1.16), 0.03, scale=(1, 0.5, 1), segments=8, rings=6)

    # Bell sleeves with silver cuffs, green scaly hands with claws.
    for side, tag in ((1, "L"), (-1, "R")):
        arm = f"arm.{tag}"
        cone(f"Sleeve.{tag}", "mage_robe", arm, (0.43 * side, -0.02, 1.03), 0.15, 0.46, rot=(180, 0, 0), sides=10,
             tip=0.10)
        cone(f"Cuff.{tag}", "silver", arm, (0.45 * side, -0.03, 0.82), 0.155, 0.04, sides=10, tip=0.15)
        sphere(f"Hand.{tag}", "lizard", arm, (0.46 * side, -0.05, 0.74), 0.09)
    for i, dx in enumerate((-0.04, 0.02)):
        cone(f"HandClaw{i}", "bone", "arm.L", (0.46 + dx, -0.13, 0.70), 0.02, 0.07, rot=(110, 0, 0), sides=4)

    # A tall black staff in the right hand, a purple orb in a silver cage on top.
    hand = Vector((-0.46, -0.05, 0.74))
    cone("Staff", "black", "arm.R", Vector((hand.x, hand.y, 1.06)), 0.04, 2.0, sides=6, tip=0.035)
    cone("StaffFoot", "silver", "arm.R", Vector((hand.x, hand.y, 0.08)), 0.05, 0.08, sides=6, tip=0.03)
    box("StaffWrap", "silver", "arm.R", hand, (0.10, 0.10, 0.06), bevel=0.02)
    top = Vector((hand.x, hand.y, 2.18))
    cone("StaffCup", "silver", "arm.R", top - Vector((0, 0, 0.13)), 0.04, 0.10, sides=8, tip=0.10)
    sphere("StaffOrb", "arcane", "arm.R", top, 0.12, segments=12, rings=8)
    sphere("StaffOrbCore", "arcane_light", "arm.R", top + Vector((0, -0.07, 0.02)), 0.05, scale=(1, 0.6, 1),
           segments=8, rings=6)
    for i in range(4):
        a = i * 90 + 45
        d = Vector((math.cos(DEG(a)), math.sin(DEG(a)), 0))
        cone(f"CageBar{i}", "silver", "arm.R", top + d * 0.12 + Vector((0, 0, 0.02)), 0.018, 0.26,
             rot=(0, 0, 0), sides=4)
    cone("CageTip", "silver", "arm.R", top + Vector((0, 0, 0.17)), 0.04, 0.12, sides=6)

    # Head: a round lizard skull on a short neck, a long snout, yellow slit eyes, under a
    # purple hood with silver trim; a few crest spikes poke out at the back.
    dz = -0.08  # sits lower than round 1: Colton wanted a shorter neck (but not too short)
    cone("Neck", "lizard", "head", (0, 0.0, 1.48), 0.17, 0.18, sides=10, tip=0.16)
    box("Throat", "lizard_belly", "head", (0, -0.10, 1.53), (0.22, 0.16, 0.10), bevel=0.04)
    sphere("Skull", "lizard", "head", (0, 0.04, 1.84 + dz), 0.29, scale=(0.95, 1.05, 0.92), segments=16, rings=10)
    box("Snout", "lizard", "head", (0, -0.28, 1.76 + dz), (0.26, 0.42, 0.20), bevel=0.08, segments=3)
    box("SnoutTop", "lizard_dark", "head", (0, -0.26, 1.87 + dz), (0.18, 0.34, 0.03), bevel=0.012)
    for side, tag in ((1, "L"), (-1, "R")):
        x = side
        box(f"Nostril.{tag}", "black", "head", (0.05 * x, -0.49, 1.83 + dz), (0.03, 0.03, 0.02), bevel=0.008)
        sphere(f"Eye.{tag}", "eye", "head", (0.15 * x, -0.13, 1.92 + dz), 0.07, scale=(0.9, 0.7, 0.85))
        box(f"Pupil.{tag}", "black", "head", (0.155 * x, -0.18, 1.92 + dz), (0.016, 0.02, 0.08), bevel=0.006)
        box(f"Brow.{tag}", "lizard_dark", "head", (0.15 * x, -0.15, 2.00 + dz), (0.15, 0.10, 0.05), bevel=0.02,
            rot=(0, -14 * x, 0))

    # The hood: a proper cowl, close round the head, coming to a point at the back and
    # falling over the shoulders as a short cape.
    sphere("Hood", "mage_robe", "head", (0, 0.24, 1.86 + dz), 0.35, scale=(1.05, 1.08, 1.12), segments=16, rings=10)
    cone("HoodTip", "mage_robe", "head", (0, 0.48, 2.10 + dz), 0.15, 0.36, rot=(-115, 0, 0), sides=8)
    # Black inside, the hood's shadow round his face (Colton's idea); set back so his eyes show.
    sphere("HoodShadow", "black", "head", (0, 0.16, 1.84 + dz), 0.33, scale=(1.0, 1.0, 1.08), segments=16, rings=10)
    cone("HoodCape", "mage_robe", "head", (0, 0.06, 1.50), 0.46, 0.26, sides=12, tip=0.30)
    cone("HoodCapeHem", "silver", "head", (0, 0.06, 1.37), 0.465, 0.03, sides=12, tip=0.46)
    for i in range(9):
        a = 10 + i * 20
        x, z = math.cos(DEG(a)) * 0.33, math.sin(DEG(a)) * 0.36
        box(f"HoodRim{i}", "mage_robe_dark", "head", (x, 0.04, 1.80 + dz + z), (0.12, 0.10, 0.07), bevel=0.03,
            rot=(0, -(90 + a), 0))
    for side in (1, -1):
        box(f"HoodSide{side}", "mage_robe_dark", "head", (0.33 * side, 0.04, 1.66 + dz), (0.08, 0.10, 0.28), bevel=0.03)
    for i, (y, z, h) in enumerate(((0.44, 1.98, 0.13), (0.52, 1.84, 0.11))):
        cone(f"Crest{i}", "mage_robe_dark", "head", (0, y, z + dz), 0.06, h, rot=(-40, 0, 0), scale=(0.3, 1, 1), sides=4)

    # The mask: black cloth over his mouth and jaw only, with a silver band along the top,
    # silver rivets, and straps round the back of his head.
    box("Mask", "black", "head", (0, -0.31, 1.69 + dz), (0.34, 0.46, 0.17), bevel=0.05, segments=3)
    box("MaskBand", "silver", "head", (0, -0.31, 1.785 + dz), (0.35, 0.47, 0.03), bevel=0.012)
    box("MaskFront", "black", "head", (0, -0.53, 1.69 + dz), (0.26, 0.04, 0.15), bevel=0.03)
    for i, x in enumerate((-0.07, 0.0, 0.07)):
        sphere(f"MaskRivet{i}", "silver", "head", (x, -0.555, 1.66 + dz), 0.018, segments=6, rings=4)
    for side in (1, -1):
        box(f"MaskStrap{side}", "silver", "head", (0.18 * side, -0.02, 1.74 + dz), (0.03, 0.40, 0.04), bevel=0.01)
        sphere(f"MaskStud{side}", "silver", "head", (0.175 * side, -0.24, 1.70 + dz), 0.03, segments=8, rings=5)


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


def build_drake(dragon=False):
    """A rage drake: a wingless red dragon on all fours, a ridge of spikes down its back and
    long tail, horns swept back and a snarling jaw of teeth. Legs and head use the bear's
    bones and moves; the tail has its own bone. Ashardalon (`dragon`) is the same beast, darker,
    with great wings, more horns and a crown of spikes."""
    main, dark, belly = ("ash", "ash_dark", "ash_belly") if dragon else ("drake", "drake_dark", "drake_belly")
    sphere("Rump", main, "hips", (0, 0.30, 0.72), 0.36, scale=(1.0, 1.2, 0.9), segments=14, rings=9)
    sphere("Chest", main, "body", (0, -0.18, 0.80), 0.40, scale=(0.95, 1.15, 0.95), segments=14, rings=9)
    sphere("Belly", belly, "body", (0, -0.02, 0.50), 0.26, scale=(1.1, 1.9, 0.5), segments=12, rings=8)
    # The neck rises forward to the head.
    for i in range(5):
        t = i / 4
        sphere(f"Neck{i}", main, "head", (0, -0.45 - 0.16 * t, 0.98 + 0.20 * t), 0.20 - 0.04 * t,
               segments=10, rings=7)
        sphere(f"Throat{i}", belly, "head", (0, -0.52 - 0.16 * t, 0.90 + 0.20 * t), 0.13 - 0.03 * t,
               scale=(1, 0.8, 0.8), segments=8, rings=6)
    # Tail: tapering behind, curling a little to one side, a spiked tip.
    p0, p1, p2, p3 = Vector((0, 0.55, 0.75)), Vector((0, 0.95, 0.65)), Vector((0.25, 1.15, 0.35)), Vector((0.45, 1.05, 0.15))
    for j in range(12):
        t = j / 11
        sphere(f"Tail{j}", main, "tail", bezier(p0, p1, p2, p3, t), 0.16 - 0.12 * t, segments=10, rings=7)
    cone("TailSpike", "bone", "tail", p3 + Vector((0.10, -0.06, 0)), 0.06, 0.20, rot=(0, 90, 30), sides=5)
    # Spikes down the back and tail.
    spine = [(0, -0.62, 1.30), (0, -0.40, 1.16), (0, -0.20, 1.15), (0, 0.02, 1.12), (0, 0.24, 1.06), (0, 0.46, 0.98)]
    for i, at in enumerate(spine):
        bone = "head" if i == 0 else ("body" if at[1] < 0.1 else "hips")
        cone(f"Spine{i}", belly, bone, Vector(at) + Vector((0, 0, 0.04)), 0.10, 0.30 - 0.02 * i,
             rot=(-25, 0, 0), scale=(0.35, 1, 1), sides=4)
    for j in (2, 5, 8):
        at = bezier(p0, p1, p2, p3, j / 11)
        cone(f"TailSpine{j}", belly, "tail", at + Vector((0, 0, 0.15 - 0.01 * j)), 0.08, 0.20, rot=(-30, 0, 0),
             scale=(0.35, 1, 1), sides=4)

    # Legs: the front pair on the arm bones, the back pair on the leg bones, with claws.
    for side, tag in ((1, "L"), (-1, "R")):
        for bone, y, upper in ((f"arm.{tag}", -0.30, 0.15), (f"leg.{tag}", 0.36, 0.19)):
            x = 0.28 * side
            sphere(f"Upper.{bone}", main, bone, (x, y, 0.52), upper, scale=(1, 1.1, 1.3))
            box(f"Lower.{bone}", dark, bone, (x, y, 0.24), (0.18, 0.20, 0.32), bevel=0.06)
            box(f"Foot.{bone}", dark, bone, (x, y - 0.05, 0.06), (0.22, 0.30, 0.12), bevel=0.05)
            for i, dx in enumerate((-0.06, 0, 0.06)):
                cone(f"Claw.{bone}{i}", "bone", bone, (x + dx, y - 0.23, 0.05), 0.028, 0.10, rot=(100, 0, 0), sides=4)

    # Head: a long snout with a toothy jaw, horns swept back, glowing angry eyes.
    hy, hz = -0.78, 1.22
    sphere("Skull", main, "head", (0, hy, hz), 0.21, scale=(1.0, 1.1, 0.9), segments=14, rings=9)
    box("Snout", main, "head", (0, hy - 0.28, hz - 0.04), (0.22, 0.36, 0.16), bevel=0.07, segments=3)
    box("Jaw", dark, "head", (0, hy - 0.24, hz - 0.17), (0.19, 0.32, 0.07), bevel=0.03, rot=(10, 0, 0))
    box("MouthInside", "red", "head", (0, hy - 0.24, hz - 0.12), (0.16, 0.30, 0.05), bevel=0.01, rot=(5, 0, 0))
    for side in (1, -1):
        box(f"Nostril{side}", "black", "head", (0.05 * side, hy - 0.46, hz + 0.02), (0.03, 0.03, 0.02), bevel=0.008)
        for i, y in enumerate((-0.42, -0.33, -0.24, -0.15)):
            cone(f"Tooth{side}{i}", "bone", "head", (0.09 * side, hy + y, hz - 0.13), 0.017, 0.06, rot=(180, 0, 0),
                 sides=4)
        sphere(f"Eye{side}", "glow", "head", (0.12 * side, hy - 0.10, hz + 0.08), 0.045, scale=(0.9, 0.7, 0.6),
               segments=8, rings=6)
        box(f"Brow{side}", dark, "head", (0.12 * side, hy - 0.10, hz + 0.14), (0.12, 0.10, 0.05), bevel=0.02,
            rot=(0, -18 * side, 0))
        cone(f"Horn{side}", "bone", "head", (0.12 * side, hy + 0.14, hz + 0.18), 0.05, 0.34, rot=(-60, 0, -14 * side),
             sides=6)
        cone(f"Cheek{side}", dark, "head", (0.19 * side, hy + 0.05, hz - 0.02), 0.06, 0.20,
             rot=(0, 70 * side, 20 * side), scale=(1, 0.3, 1), sides=4)
    if dragon:
        for side in (1, -1):
            cone(f"HornSmall{side}", "bone", "head", (0.17 * side, hy + 0.08, hz + 0.10), 0.035, 0.22,
                 rot=(-75, 0, -35 * side), sides=6)
            for i, (dy, dz) in enumerate(((0.0, 0.05), (0.08, -0.04))):
                cone(f"Frill{side}{i}", "bone", "head", (0.20 * side, hy + dy, hz + dz), 0.03, 0.18,
                     rot=(-60, 0, -70 * side), sides=5)
        build_wings()


def sheet(name, colour, bone, points):
    """A flat, two-sided panel through `points` (a wing's skin)."""
    bm = bmesh.new()
    verts = [bm.verts.new(Vector(p)) for p in points]
    bm.faces.new(verts)
    back = [bm.verts.new(Vector(p)) for p in reversed(points)]
    bm.faces.new(back)
    return finish(bm, name, colour, bone, (0, 0, 0), (0, 0, 0))


def build_wings():
    """Ashardalon's wings: an arm of bone to a clawed wrist, three long fingers, dark skin
    stretched between them and back to the body."""
    for side, tag in ((1, "L"), (-1, "R")):
        bone = f"wing.{tag}"
        x = side
        shoulder = Vector((0.22 * x, -0.05, 1.10))
        elbow = Vector((0.60 * x, 0.10, 1.42))
        wrist = Vector((0.95 * x, 0.30, 1.62))
        tips = [Vector((1.42 * x, 0.55, 1.22)), Vector((1.15 * x, 0.85, 0.98)), Vector((0.75 * x, 0.90, 0.92))]
        root_back = Vector((0.20 * x, 0.55, 0.98))
        for i, (a, b, r) in enumerate(((shoulder, elbow, 0.07), (elbow, wrist, 0.055))):
            d = b - a
            m = facing(d)
            cone(f"WingArm{tag}{i}", "ash_dark", bone, (a + b) / 2, r, d.length + 0.04, rot=turned(m, (-90, 0, 0)),
                 sides=6, tip=r * 0.8)
        sphere(f"WingWrist{tag}", "ash_dark", bone, wrist, 0.07, segments=8, rings=6)
        cone(f"WingClaw{tag}", "bone", bone, wrist + Vector((0.02 * x, -0.06, 0.08)), 0.03, 0.14,
             rot=(-30, 0, 0), sides=4)
        for i, tip in enumerate(tips):
            d = tip - wrist
            cone(f"WingFinger{tag}{i}", "ash_dark", bone, wrist + d / 2, 0.035, d.length, rot=turned(facing(d), (-90, 0, 0)),
                 sides=5, tip=0.015)
        skins = [[shoulder, elbow, wrist, tips[0]], [wrist, tips[0], tips[1]], [wrist, tips[1], tips[2]],
                 [shoulder, wrist, tips[2], root_back]]
        for i, pts in enumerate(skins):
            sheet(f"WingSkin{tag}{i}", "ash_wing", bone, pts)


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


def build_grell():
    """A grell: a floating brain with no eyes, a hooked beak underneath at the front and a
    ring of tentacles hanging to the floor."""
    centre = Vector((0, 0, 1.30))
    # A dark core with wavy ridges running front to back over it: the folds of a brain.
    sphere("Brain", "brain_dark", "body", centre, 0.50, scale=(1.0, 1.12, 0.82), segments=16, rings=10)
    sphere("Underside", "brain_light", "body", centre + Vector((0, 0, -0.18)), 0.50, scale=(0.95, 1.05, 0.45),
           segments=16, rings=8)
    for k in range(-5, 6):
        if k == 0:
            continue  # the deep split down the middle
        theta = DEG(k * 19 + (4 if k > 0 else -4))
        for j in range(19):
            y = -0.52 + j * 0.058
            f = 1 - (y / 0.58) ** 2
            if f <= 0.02:
                continue
            wiggle = 0.06 * math.sin(j * 1.3 + k * 2.1)
            rx, rz = 0.47 * math.sqrt(f), 0.385 * math.sqrt(f)
            at = Vector((rx * math.sin(theta + wiggle), y * 1.0, rz * math.cos(theta + wiggle)))
            sphere(f"Fold{k}_{j}", "brain", "body", centre + at, 0.075, scale=(1, 1.2, 1), segments=7, rings=5)

    # The beak: an upper hook and a lower jaw, a red mouth between.
    sphere("BeakBase", "brain_light", "head", (0, -0.42, 1.02), 0.17, scale=(1.1, 0.8, 0.9), segments=12, rings=8)
    cone("BeakUpper", "beak", "head", (0, -0.60, 0.98), 0.16, 0.36, rot=(110, 0, 0), scale=(1, 0.75, 1), sides=8)
    cone("BeakLower", "beak", "head", (0, -0.54, 0.85), 0.11, 0.24, rot=(65, 0, 0), scale=(1, 0.7, 1), sides=8)
    box("Gullet", "red", "head", (0, -0.52, 0.92), (0.12, 0.10, 0.06), bevel=0.02)

    # Eight tentacles in a ring, curling down to the floor, two to a bone.
    for i in range(8):
        a = DEG(22.5 + i * 45)
        dx, dy = math.sin(a), -math.cos(a)  # i=0 front-right... round the ring
        bone = ("tent.F" if dy < 0 else "tent.B") + ("L" if dx > 0 else "R")
        start = Vector((dx * 0.32, dy * 0.32, 1.02))
        mid1 = Vector((dx * 0.52, dy * 0.52, 0.70))
        mid2 = Vector((dx * 0.30, dy * 0.30, 0.35))
        end = Vector((dx * 0.52, dy * 0.52, 0.06))
        n = 12
        for j in range(n):
            t = j / (n - 1)
            radius = 0.075 - 0.05 * t
            sphere(f"Tent{i}_{j}", "brain_light" if j % 3 else "brain", bone, bezier(start, mid1, mid2, end, t),
                   radius, segments=8, rings=5)
        cone(f"Barb{i}", "beak", bone, end + Vector((dx * 0.05, dy * 0.05, 0)), 0.025, 0.07,
             rot=(0, 0, 0), sides=4)


def facing(direction):
    """The turn that points a part built facing front (-Y) along `direction`."""
    d = Vector(direction).normalized()
    pitch = math.asin(max(-1, min(1, -d.z)))
    yaw = math.atan2(d.x, -d.y)
    return Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(pitch, 3, "X")


def turned(m, local_rot=(0, 0, 0)):
    """Degrees (x, y, z) for finish() of frame m applied after a part's own turn."""
    own = (Matrix.Rotation(DEG(local_rot[2]), 3, "Z") @ Matrix.Rotation(DEG(local_rot[1]), 3, "Y")
           @ Matrix.Rotation(DEG(local_rot[0]), 3, "X"))
    e = (m @ own).to_euler("XYZ")
    return tuple(math.degrees(a) for a in e)


def mouther_eye(name, bone, at, direction, r, iris="eye"):
    m = facing(direction)
    out = m @ Vector((0, -1, 0))
    sphere(f"{name}White", "eye_white", bone, at, r, scale=(1, 0.8, 1), rot=turned(m), segments=10, rings=7)
    sphere(f"{name}Iris", iris, bone, at + out * r * 0.62, r * 0.55, scale=(1, 0.5, 1), rot=turned(m),
           segments=8, rings=6)
    sphere(f"{name}Pupil", "black", bone, at + out * r * 0.86, r * 0.28, scale=(1, 0.5, 1.2), rot=turned(m),
           segments=6, rings=4)
    # A fleshy lid over the top of the eye.
    sphere(f"{name}Lid", "flesh_dark", bone, at + m @ Vector((0, -0.15 * r, 0.42 * r)), r * 1.08,
           scale=(1.05, 0.75, 0.42), rot=turned(m), segments=10, rings=6)


def mouther_mouth(name, bone, at, direction, w, teeth=7):
    m = facing(direction)

    def put(local):
        return at + m @ Vector(local)

    sphere(f"{name}Hole", "black", bone, put((0, 0.04 * w, 0)), w, scale=(1, 0.25, 0.42), rot=turned(m),
           segments=10, rings=6)
    sphere(f"{name}LipUp", "red", bone, put((0, -0.08 * w, 0.32 * w)), w, scale=(1.08, 0.32, 0.2),
           rot=turned(m), segments=10, rings=6)
    sphere(f"{name}LipLow", "red", bone, put((0, -0.08 * w, -0.32 * w)), w, scale=(1.0, 0.32, 0.2),
           rot=turned(m), segments=10, rings=6)
    for i in range(teeth):
        x = (i / (teeth - 1) - 0.5) * 1.4 * w
        bend = 1 - (2 * x / (1.5 * w)) ** 2  # the teeth follow the lips' curve
        cone(f"{name}ToothUp{i}", "bone", bone, put((x, -(0.10 + 0.16 * bend) * w, 0.22 * w)), 0.11 * w,
             0.30 * w, rot=turned(m, (180, 0, 0)), sides=4)
        if i % 2 == 0 or teeth < 6:
            cone(f"{name}ToothLow{i}", "bone", bone, put((x * 0.9, -(0.10 + 0.16 * bend) * w, -0.22 * w)),
                 0.10 * w, 0.30 * w, rot=turned(m), sides=4)


def build_mouther():
    """A gibbering mouther: a heap of pink flesh crawling with eyes and toothy mouths, one big
    mouth on the top lump at the front."""
    lumps = [  # name, bone, centre, radius, scale
        ("Mound", "body", (0, 0.05, 0.42), 0.62, (1.05, 1.0, 0.72)),
        ("Top", "head", (0, -0.18, 0.98), 0.40, (1.0, 0.95, 0.9)),
        ("LumpL", "lobe.L", (0.52, -0.05, 0.32), 0.36, (1, 1, 0.85)),
        ("LumpR", "lobe.R", (-0.50, 0.02, 0.34), 0.38, (1, 1, 0.85)),
        ("LumpB", "lobe.B", (0.05, 0.50, 0.42), 0.40, (1.1, 1, 0.85)),
        ("Shoulder", "body", (0.30, 0.22, 0.78), 0.30, (1, 1, 0.9)),
        ("Hump", "body", (-0.28, 0.12, 0.80), 0.30, (1, 1, 0.9)),
        ("FrontL", "lobe.L", (0.38, -0.42, 0.22), 0.24, (1, 1, 0.85)),
        ("FrontR", "lobe.R", (-0.36, -0.44, 0.22), 0.25, (1, 1, 0.85)),
    ]
    for name, bone, c, r, sc in lumps:
        sphere(name, "flesh", bone, c, r, scale=sc, segments=14, rings=9)
    # Darker blotches and pale bulges so it reads as wet, lumpy flesh.
    for i, (bone, c, r, colour) in enumerate((
            ("body", (0.15, -0.38, 0.62), 0.16, "flesh_light"), ("lobe.B", (-0.30, 0.55, 0.30), 0.18, "flesh_dark"),
            ("body", (-0.55, -0.20, 0.55), 0.14, "flesh_light"), ("lobe.L", (0.75, 0.15, 0.25), 0.15, "flesh_dark"),
            ("lobe.B", (0.40, 0.55, 0.55), 0.15, "flesh_light"), ("head", (0.22, 0.05, 1.18), 0.13, "flesh_dark"),
            ("lobe.R", (-0.72, 0.25, 0.25), 0.15, "flesh_light"), ("body", (0.0, 0.40, 0.88), 0.14, "flesh_dark"))):
        sphere(f"Blob{i}", colour, bone, c, r, scale=(1, 1, 0.8), segments=10, rings=7)

    def on(c, r, sc, direction):
        """A point on a lump's skin in a direction from its centre."""
        d = Vector(direction).normalized()
        return Vector(c) + Vector((d.x * r * sc[0], d.y * r * sc[1], d.z * r * sc[2])) * 0.92

    # The big mouth on the top lump, and smaller ones all over.
    top = lumps[1]
    mouther_mouth("MouthBig", "head", on(top[2], top[3], top[4], (0, -1, -0.15)), (0, -1, -0.1), 0.24, teeth=9)
    for i, (bone, c, r, sc, d, w) in enumerate((
            ("lobe.L", lumps[2][2], 0.36, (1, 1, 0.85), (0.6, -0.8, 0.1), 0.14),
            ("lobe.R", lumps[3][2], 0.38, (1, 1, 0.85), (-0.7, -0.6, 0.2), 0.15),
            ("lobe.B", lumps[4][2], 0.40, (1.1, 1, 0.85), (-0.3, 0.8, 0.4), 0.16),
            ("body", lumps[5][2], 0.30, (1, 1, 0.9), (0.6, -0.3, 0.7), 0.11),
            ("lobe.R", lumps[8][2], 0.25, (1, 1, 0.85), (-0.3, -1, 0.2), 0.10))):
        mouther_mouth(f"Mouth{i}", bone, on(c, r, sc, d), d, w, teeth=5)

    # Eyes everywhere, all sizes, a few with green irises.
    eyes = (
        ("head", top[2], top[3], top[4], (-0.45, -0.75, 0.45), 0.10, "eye"),
        ("head", top[2], top[3], top[4], (0.40, -0.80, 0.50), 0.12, "eye"),
        ("head", top[2], top[3], top[4], (0.05, -0.45, 0.90), 0.08, "eye_green"),
        ("head", top[2], top[3], top[4], (0.85, -0.2, 0.3), 0.07, "eye"),
        ("head", top[2], top[3], top[4], (-0.8, 0.1, 0.5), 0.09, "eye_green"),
        ("body", lumps[0][2], 0.62, (1.05, 1.0, 0.72), (0.25, -1, 0.15), 0.09, "eye"),
        ("body", lumps[0][2], 0.62, (1.05, 1.0, 0.72), (-0.35, -1, 0.35), 0.07, "eye_green"),
        ("body", lumps[5][2], 0.30, (1, 1, 0.9), (0.2, -0.6, 0.8), 0.07, "eye"),
        ("body", lumps[6][2], 0.30, (1, 1, 0.9), (-0.4, -0.7, 0.6), 0.10, "eye"),
        ("body", lumps[6][2], 0.30, (1, 1, 0.9), (-0.7, 0.4, 0.6), 0.06, "eye_green"),
        ("lobe.L", lumps[2][2], 0.36, (1, 1, 0.85), (0.9, 0.1, 0.5), 0.09, "eye"),
        ("lobe.L", lumps[7][2], 0.24, (1, 1, 0.85), (0.2, -1, 0.5), 0.08, "eye"),
        ("lobe.R", lumps[3][2], 0.38, (1, 1, 0.85), (-0.9, 0.2, 0.5), 0.11, "eye_green"),
        ("lobe.R", lumps[3][2], 0.38, (1, 1, 0.85), (-0.3, -0.5, 0.85), 0.07, "eye"),
        ("lobe.B", lumps[4][2], 0.40, (1.1, 1, 0.85), (0.5, 0.6, 0.6), 0.10, "eye"),
        ("lobe.B", lumps[4][2], 0.40, (1.1, 1, 0.85), (0.0, 0.5, 0.9), 0.07, "eye_green"),
        ("lobe.B", lumps[4][2], 0.40, (1.1, 1, 0.85), (0.9, 0.3, 0.2), 0.08, "eye"),
    )
    for i, (bone, c, r, sc, d, size, iris) in enumerate(eyes):
        mouther_eye(f"Eye{i}", bone, on(c, r, sc, d), d, size, iris)


def build_gauth():
    """A gauth: a floating ball with one big eye, a toothy mouth below it, six eyestalks on top
    and four feeding tendrils dangling underneath."""
    centre = Vector((0, 0, 1.25))
    sphere("Body", "gauth", "body", centre, 0.48, scale=(1, 0.95, 0.92), segments=18, rings=12)
    # Bumpy plates over the back and top.
    for i in range(10):
        a, b = DEG(i * 36 + 18), DEG(35 + (i % 3) * 18)
        d = Vector((math.sin(b) * math.sin(a), math.sin(b) * math.cos(a) * 0.95 + 0.05, math.cos(b) * 0.92))
        sphere(f"Plate{i}", "gauth_dark", "body", centre + d * 0.45, 0.11, scale=(1, 1, 0.5),
               rot=turned(facing(d), (90, 0, 0)), segments=8, rings=5)
    # The big central eye with a lid.
    eye = centre + Vector((0, -0.40, 0.10))
    sphere("EyeWhite", "eye_white", "body", eye, 0.20, scale=(1, 0.6, 1), segments=14, rings=9)
    sphere("EyeIris", "eye", "body", eye + Vector((0, -0.10, 0)), 0.12, scale=(1, 0.4, 1), segments=12, rings=8)
    sphere("EyePupil", "black", "body", eye + Vector((0, -0.145, 0)), 0.05, scale=(0.6, 0.4, 1.4), segments=8, rings=6)
    sphere("EyeLid", "gauth_dark", "body", eye + Vector((0, 0.02, 0.15)), 0.21, scale=(1.04, 0.66, 0.36),
           segments=14, rings=8)
    # The mouth under the eye, on the head bone so it can snap.
    mouther_mouth("Mouth", "head", centre + Vector((0, -0.40, -0.21)), (0, -1, -0.15), 0.19, teeth=7)
    # Six eyestalks curling up and out from the top, each with a little eye.
    for i in range(6):
        a = DEG(i * 60 + 30)
        out = Vector((math.sin(a), -math.cos(a) * 0.9, 0))
        p0 = centre + out * 0.22 + Vector((0, 0, 0.38))
        p1 = p0 + out * 0.10 + Vector((0, 0, 0.25))
        p2 = p0 + out * 0.32 + Vector((0, 0, 0.35))
        p3 = p0 + out * 0.42 + Vector((0, 0, 0.25))
        n = 12
        for j in range(n):
            t = j / (n - 1)
            sphere(f"Stalk{i}_{j}", "gauth_light" if j % 3 == 0 else "gauth", "stalks", bezier(p0, p1, p2, p3, t),
                   0.055 - 0.02 * t, segments=7, rings=5)
        look = (out + Vector((0, -0.6, 0.3))).normalized()
        mouther_eye(f"StalkEye{i}", "stalks", p3 + look * 0.04, look, 0.07, "eye_green" if i % 2 else "eye")
    # Feeding tendrils hanging down, two to a bone.
    for i in range(4):
        a = DEG(45 + i * 90)
        dx, dy = math.sin(a), -math.cos(a)
        bone = ("tent.F" if dy < 0 else "tent.B") + ("L" if dx > 0 else "R")
        start = Vector((dx * 0.20, dy * 0.20, 0.85))
        end = Vector((dx * 0.30, dy * 0.30, 0.20))
        mid1, mid2 = start + Vector((dx * 0.15, dy * 0.15, -0.20)), end + Vector((-dx * 0.1, -dy * 0.1, 0.25))
        for j in range(8):
            t = j / 7
            sphere(f"Tendril{i}_{j}", "gauth_dark" if j % 3 == 0 else "gauth", bone, bezier(start, mid1, mid2, end, t),
                   0.05 - 0.03 * t, segments=7, rings=5)


def build_otyugh():
    """An otyugh: a bloated sack of a body on three stubby legs, a huge mouth of teeth across
    the front, an eyestalk with three eyes on top and two long tentacles raised up, each
    ending in a spiked club."""
    centre = Vector((0, 0.05, 0.88))
    sphere("Body", "otyugh", "body", centre, 0.62, scale=(1.08, 1.0, 0.9), segments=18, rings=12)
    # Warty bumps and dark blotches.
    for i in range(16):
        a, b = DEG(i * 67 % 360), DEG(30 + (i * 37) % 100)
        d = Vector((math.sin(b) * math.sin(a), math.sin(b) * math.cos(a), math.cos(b)))
        if d.y < -0.5 and d.z < 0.5:
            continue  # leave the mouth clear
        at = centre + Vector((d.x * 0.62 * 1.08, d.y * 0.62, d.z * 0.62 * 0.9)) * 0.97
        colour = "otyugh_dark" if i % 3 == 0 else "otyugh_light"
        sphere(f"Wart{i}", colour, "body", at, 0.05 + 0.03 * (i % 3), scale=(1, 1, 0.7), segments=8, rings=5)
    # The mouth: wide and toothy, on the head bone so it can chomp.
    mouther_mouth("Mouth", "head", centre + Vector((0, -0.56, -0.05)), (0, -1, 0.05), 0.40, teeth=11)
    # Three stubby legs: two at the front corners, one at the back (on the tail bone).
    for name, bone, x, y in (("Leg.L", "leg.L", 0.42, -0.22), ("Leg.R", "leg.R", -0.42, -0.22), ("Leg.B", "tail", 0, 0.45)):
        cone(name, "otyugh_dark", bone, (x, y, 0.20), 0.17, 0.42, sides=10, tip=0.21)
        box(f"{name}Foot", "otyugh_dark", bone, (x, y - 0.04, 0.05), (0.32, 0.36, 0.10), bevel=0.04)
        for i, dx in enumerate((-0.08, 0, 0.08)):
            cone(f"{name}Claw{i}", "bone", bone, (x + dx, y - 0.22, 0.05), 0.03, 0.09, rot=(90, 0, 0), sides=4)
    # The eyestalk rises from the top and bends forward, three eyes at its end.
    p0, p1, p2, p3 = (Vector((0, 0.15, 1.35)), Vector((0, 0.25, 1.75)), Vector((0, -0.05, 1.95)),
                      Vector((0, -0.15, 1.85)))
    for j in range(12):
        t = j / 11
        sphere(f"Eyestalk{j}", "otyugh_light" if j % 3 == 0 else "otyugh", "head", bezier(p0, p1, p2, p3, t),
               0.09 - 0.03 * t, segments=8, rings=6)
    for i, (dx, dz, r) in enumerate(((0, 0.05, 0.08), (0.10, -0.04, 0.065), (-0.10, -0.04, 0.065))):
        d = Vector((dx * 2, -1, dz * 2))
        mouther_eye(f"StalkEye{i}", "head", p3 + Vector((dx, -0.06, dz)), d, r, "eye")
    # Two tentacles: up from the shoulders in a curve, then a leafy spiked club.
    for side, tag in ((1, "L"), (-1, "R")):
        bone = f"arm.{tag}"
        q0 = Vector((0.58 * side, -0.05, 1.05))
        q1 = Vector((0.95 * side, -0.05, 1.20))
        q2 = Vector((0.80 * side, -0.15, 1.75))
        q3 = Vector((0.62 * side, -0.30, 1.95))
        n = 16
        for j in range(n):
            t = j / (n - 1)
            sphere(f"Tentacle{tag}{j}", "otyugh_light" if j % 4 == 0 else "otyugh", bone, bezier(q0, q1, q2, q3, t),
                   0.10 - 0.04 * t, segments=8, rings=6)
        club = q3 + Vector((-0.04 * side, -0.10, 0.05))
        sphere(f"Club{tag}", "otyugh_dark", bone, club, 0.15, scale=(0.8, 1.3, 0.7), segments=10, rings=7)
        for k, (dx, dy, dz) in enumerate(((1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, -1, 0), (0.7, -0.5, 0.5),
                                          (-0.7, -0.5, 0.5))):
            d = Vector((dx, dy, dz)).normalized()
            cone(f"ClubSpike{tag}{k}", "bone", bone, club + Vector((d.x * 0.12, d.y * 0.18, d.z * 0.10)), 0.035, 0.12,
                 rot=turned(facing(d), (90, 0, 0)), sides=5)


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
LIZARD_BONES = CULTIST_BONES + [("tail", (0, 0.25, 0.45), (0, 0.85, 0.12), "hips")]
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
GRELL_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("body", (0, 0, 0.95), (0, 0, 1.60), "root"),
    ("head", (0, -0.40, 0.90), (0, -0.40, 1.15), "body"),
    ("tent.FL", (0.22, -0.22, 1.0), (0.26, -0.26, 0.10), "body"),
    ("tent.FR", (-0.22, -0.22, 1.0), (-0.26, -0.26, 0.10), "body"),
    ("tent.BL", (0.22, 0.22, 1.0), (0.26, 0.26, 0.10), "body"),
    ("tent.BR", (-0.22, 0.22, 1.0), (-0.26, 0.26, 0.10), "body"),
]
MOUTHER_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("body", (0, 0.05, 0.05), (0, 0.05, 0.75), "root"),
    ("head", (0, -0.18, 0.70), (0, -0.18, 1.30), "body"),
    ("lobe.L", (0.48, -0.15, 0.05), (0.48, -0.15, 0.55), "body"),
    ("lobe.R", (-0.46, -0.15, 0.05), (-0.46, -0.15, 0.55), "body"),
    ("lobe.B", (0.05, 0.50, 0.05), (0.05, 0.50, 0.65), "body"),
]
GAUTH_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("body", (0, 0, 0.95), (0, 0, 1.60), "root"),
    ("head", (0, -0.38, 0.90), (0, -0.38, 1.15), "body"),
    ("stalks", (0, 0, 1.55), (0, 0, 2.0), "body"),
    ("tent.FL", (0.15, -0.15, 0.9), (0.2, -0.2, 0.2), "body"),
    ("tent.FR", (-0.15, -0.15, 0.9), (-0.2, -0.2, 0.2), "body"),
    ("tent.BL", (0.15, 0.15, 0.9), (0.2, 0.2, 0.2), "body"),
    ("tent.BR", (-0.15, 0.15, 0.9), (-0.2, 0.2, 0.2), "body"),
]
OTYUGH_BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("body", (0, 0.05, 0.40), (0, 0.05, 1.30), "root"),
    ("head", (0, -0.40, 0.80), (0, -0.40, 1.20), "body"),
    ("arm.L", (0.58, -0.05, 1.05), (0.65, -0.25, 1.95), "body"),
    ("arm.R", (-0.58, -0.05, 1.05), (-0.65, -0.25, 1.95), "body"),
    ("leg.L", (0.42, -0.22, 0.45), (0.42, -0.22, 0.02), "root"),
    ("leg.R", (-0.42, -0.22, 0.45), (-0.42, -0.22, 0.02), "root"),
    ("tail", (0, 0.45, 0.45), (0, 0.45, 0.02), "root"),
]
DRAKE_BONES = BEAR_BONES + [("tail", (0, 0.55, 0.75), (0, 1.05, 0.35), "hips")]
ASHARDALON_BONES = DRAKE_BONES + [("wing.L", (0.22, -0.05, 1.10), (0.95, 0.30, 1.62), "body"),
                                  ("wing.R", (-0.22, -0.05, 1.10), (-0.95, 0.30, 1.62), "body")]
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
    # Raise the staff high, then thrust it at the foe as the lightning flies.
    ("Spellcast_Shoot", False, [
        (0, {}),
        (10, {"arm.R": (150, 0, 15), "arm.L": (40, 0, -30), "body": (-14, -10, 0), "head": (-14, 0, 0)}),
        (16, {"arm.R": (95, 0, 0), "arm.L": (60, 0, -10), "body": (14, 10, 0), "head": (6, 0, 0),
              "hips": {"loc": (0, -0.05, 0)}}),
        (24, {"arm.R": (85, 0, 0), "arm.L": (50, 0, -10), "body": (10, 8, 0), "hips": {"loc": (0, -0.04, 0)}}),
        (38, {}),
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
        pb.scale = (1, 1, 1)
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
        if isinstance(value, dict) and "scale" in value:
            pb.scale = value["scale"]


def add_moves(rig, moves):
    rig.animation_data_create()
    # Only figures whose moves squash or swell get scale keys (the others stay as they were).
    scales = any(isinstance(v, dict) and "scale" in v for _n, _l, keys in moves for _f, spec in keys
                 for v in spec.values())
    for name, _loops, keys in moves:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame, spec in keys:
            pose(rig, spec)
            for pb in rig.pose.bones:
                pb.keyframe_insert("rotation_euler", frame=frame, group=pb.name)
                pb.keyframe_insert("location", frame=frame, group=pb.name)
                if scales:
                    pb.keyframe_insert("scale", frame=frame, group=pb.name)
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

# The grell floats: it bobs, glides with its tentacles trailing, lunges and snaps its beak.
TENTS = ("tent.FL", "tent.FR", "tent.BL", "tent.BR")
GRELL_FALLEN = {"body": {"rot": (-25, 0, 15), "loc": (0, -0.55, 0)}, "head": (20, 0, 0),
                **{t: (0, 0, 40 if t.endswith("L") else -40) for t in TENTS}}
GRELL_MOVES = [
    ("Idle", True, [
        (0, {}),
        (30, {"body": {"loc": (0, 0.06, 0)}, "tent.FL": (8, 0, 4), "tent.FR": (-6, 0, -4), "tent.BL": (-8, 0, 4),
              "tent.BR": (6, 0, -4), "head": (6, 0, 0)}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, {"body": {"rot": (10, 0, 0), "loc": (0, 0.05, 0)}, **{t: (-25, 0, 0) for t in TENTS}}),
        (12, {"body": {"rot": (10, 0, 0), "loc": (0, 0.10, 0)}, **{t: (-15, 0, 0) for t in TENTS}}),
        (24, {"body": {"rot": (10, 0, 0), "loc": (0, 0.05, 0)}, **{t: (-25, 0, 0) for t in TENTS}}),
    ]),
    ("1H_Melee_Attack_Chop", False, [
        (0, {}),
        (10, {"body": {"rot": (-15, 0, 0), "loc": (0, 0.10, -0.1)}, "head": (-20, 0, 0),
              "tent.FL": (-30, 0, 0), "tent.FR": (-30, 0, 0)}),
        (15, {"body": {"rot": (25, 0, 0), "loc": (0, 0, 0.18)}, "head": (25, 0, 0),
              "tent.FL": (70, 0, -10), "tent.FR": (70, 0, 10)}),
        (22, {"body": {"rot": (18, 0, 0), "loc": (0, 0, 0.12)}, "head": (-10, 0, 0),
              "tent.FL": (55, 0, 0), "tent.FR": (55, 0, 0)}),
        (34, {}),
    ]),
    ("Hit_A", False, [
        (0, {}),
        (5, {"body": {"rot": (-20, 0, 6), "loc": (0, 0.05, -0.15)}, **{t: (25, 0, 0) for t in TENTS}}),
        (20, {}),
    ]),
    ("Dodge_Right", False, [
        (0, {}),
        (7, {"root": {"loc": (-0.3, 0, 0), "rot": (0, 0, 12)}}),
        (22, {}),
    ]),
    ("Cheer", False, [
        (0, {}),
        (10, {"body": {"loc": (0, 0.15, 0)}, "tent.FL": (60, 0, 30), "tent.FR": (60, 0, -30),
              "tent.BL": (-60, 0, 30), "tent.BR": (-60, 0, -30)}),
        (22, {"body": {"loc": (0, 0.10, 0)}, "tent.FL": (40, 0, 20), "tent.FR": (40, 0, -20),
              "tent.BL": (-40, 0, 20), "tent.BR": (-40, 0, -20)}),
        (34, {}),
    ]),
    ("Death_A", False, [
        (0, {}),
        (10, {"body": {"rot": (-10, 0, 0), "loc": (0, 0.10, 0)}}),
        (30, GRELL_FALLEN),
    ]),
    ("Death_A_Pose", False, [(0, GRELL_FALLEN), (1, GRELL_FALLEN)]),
]

# The mouther oozes: its lumps swell and sag, it heaves itself forward and the top lump
# lunges to bite. "scale" is (side, up, forward) too.
LOBES = ("lobe.L", "lobe.R", "lobe.B")
MOUTHER_FALLEN = {"body": {"scale": (1.25, 0.45, 1.2)}, "head": {"rot": (35, 0, 0), "loc": (0, -0.1, 0.15)},
                  "lobe.L": {"rot": (0, 0, -30), "scale": (1.2, 0.7, 1.1)},
                  "lobe.R": {"rot": (0, 0, 30), "scale": (1.2, 0.7, 1.1)},
                  "lobe.B": {"rot": (-30, 0, 0), "scale": (1.2, 0.7, 1.1)}}
MOUTHER_MOVES = [
    ("Idle", True, [
        (0, {}),
        (20, {"body": {"scale": (1.04, 0.96, 1.04)}, "head": {"rot": (-5, 0, 4), "scale": (1.06, 1.06, 1.06)},
              "lobe.L": {"scale": (0.94, 0.94, 0.94)}, "lobe.B": {"scale": (1.06, 1.06, 1.06)}}),
        (40, {"body": {"scale": (0.97, 1.04, 0.97)}, "head": {"rot": (4, 0, -4)},
              "lobe.R": {"scale": (0.94, 0.94, 0.94)}, "lobe.L": {"scale": (1.05, 1.05, 1.05)}}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, {"body": {"scale": (1.06, 0.92, 1.1), "rot": (6, 0, 0)}, "lobe.B": {"rot": (-15, 0, 0)},
             "head": (10, 0, 0)}),
        (12, {"body": {"scale": (0.95, 1.08, 0.94), "rot": (-3, 0, 0)}, "lobe.L": {"rot": (15, 0, 0)},
              "lobe.R": {"rot": (15, 0, 0)}, "head": (-6, 0, 0)}),
        (24, {"body": {"scale": (1.06, 0.92, 1.1), "rot": (6, 0, 0)}, "lobe.B": {"rot": (-15, 0, 0)},
              "head": (10, 0, 0)}),
    ]),
    ("1H_Melee_Attack_Chop", False, [
        (0, {}),
        (10, {"body": {"rot": (-10, 0, 0), "scale": (0.95, 1.1, 0.95)}, "head": {"rot": (-30, 0, 0)}}),
        (15, {"body": {"rot": (14, 0, 0), "scale": (1.05, 0.9, 1.12)},
              "head": {"rot": (45, 0, 0), "loc": (0, 0, 0.30), "scale": (1.15, 1.15, 1.15)},
              "lobe.L": (25, 0, 0), "lobe.R": (25, 0, 0)}),
        (22, {"body": {"rot": (8, 0, 0)}, "head": {"rot": (30, 0, 0), "loc": (0, 0, 0.2)}}),
        (34, {}),
    ]),
    ("Hit_A", False, [
        (0, {}),
        (5, {"body": {"rot": (-14, 0, 5), "scale": (1.12, 0.82, 1.1)}, "head": (-20, 0, 0)}),
        (20, {}),
    ]),
    ("Dodge_Right", False, [
        (0, {}),
        (7, {"root": {"loc": (-0.3, 0, 0)}, "body": {"scale": (1.1, 0.9, 1.0), "rot": (0, 0, 10)}}),
        (22, {}),
    ]),
    ("Cheer", False, [
        (0, {}),
        (10, {"body": {"scale": (1.1, 1.15, 1.1)}, "head": {"rot": (-20, 0, 0), "scale": (1.15, 1.15, 1.15)},
              **{lobe: {"scale": (1.12, 1.12, 1.12)} for lobe in LOBES}}),
        (22, {"body": {"scale": (1.05, 1.08, 1.05)}, "head": {"rot": (-10, 0, 0)}}),
        (34, {}),
    ]),
    ("Death_A", False, [
        (0, {}),
        (10, {"body": {"scale": (0.95, 1.12, 0.95)}, "head": (-20, 0, 0)}),
        (32, MOUTHER_FALLEN),
    ]),
    ("Death_A_Pose", False, [(0, MOUTHER_FALLEN), (1, MOUTHER_FALLEN)]),
]

# The gauth floats like the grell, and fires rays: its eyestalks lean in and its body tilts.
GAUTH_MOVES = [m for m in GRELL_MOVES if m[0] != "Idle"] + [
    ("Idle", True, [
        (0, {}),
        (30, {"body": {"loc": (0, 0.06, 0), "rot": (0, 6, 0)}, "stalks": (8, 0, -6), "head": (6, 0, 0),
              "tent.FL": (8, 0, 4), "tent.BR": (6, 0, -4)}),
        (60, {}),
    ]),
    ("Spellcast_Shoot", False, [
        (0, {}),
        (10, {"body": {"rot": (-15, 0, 0), "loc": (0, 0.08, -0.08)}, "stalks": (-25, 0, 0)}),
        (16, {"body": {"rot": (12, 0, 0), "loc": (0, 0.05, 0.05)}, "stalks": (35, 0, 0), "head": (15, 0, 0)}),
        (26, {"body": {"rot": (10, 0, 0), "loc": (0, 0.05, 0.04)}, "stalks": (30, 0, 0)}),
        (38, {}),
    ]),
]

# The otyugh waddles on three legs, sways its tentacles and slams them down to attack.
OTYUGH_FALLEN = {"body": {"rot": (-70, 0, 10), "loc": (0, -0.1, -0.35)}, "arm.L": (-30, 0, 40),
                 "arm.R": (-30, 0, -40), "head": (-20, 0, 0)}
OTYUGH_MOVES = [
    ("Idle", True, [
        (0, {}),
        (30, {"body": {"scale": (1.03, 0.97, 1.03)}, "arm.L": (10, 0, -8), "arm.R": (-6, 0, 8), "head": (8, 0, 5)}),
        (60, {}),
    ]),
    ("Walking_A", True, [
        (0, {"body": {"rot": (0, 8, 0), "loc": (0, 0.03, 0)}, "leg.L": (25, 0, 0), "leg.R": (-25, 0, 0),
             "tail": (-15, 0, 0), "arm.L": (8, 0, 0), "arm.R": (-8, 0, 0)}),
        (12, {"body": {"rot": (0, -8, 0), "loc": (0, 0.03, 0)}, "leg.L": (-25, 0, 0), "leg.R": (25, 0, 0),
              "tail": (15, 0, 0), "arm.L": (-8, 0, 0), "arm.R": (8, 0, 0)}),
        (24, {"body": {"rot": (0, 8, 0), "loc": (0, 0.03, 0)}, "leg.L": (25, 0, 0), "leg.R": (-25, 0, 0),
              "tail": (-15, 0, 0), "arm.L": (8, 0, 0), "arm.R": (-8, 0, 0)}),
    ]),
    ("1H_Melee_Attack_Chop", False, [
        (0, {}),
        (10, {"arm.R": (-35, 0, 10), "arm.L": (-25, 0, -10), "body": {"rot": (-10, 0, 0)}, "head": (-15, 0, 0)}),
        (16, {"arm.R": (80, 0, 10), "arm.L": (70, 0, -10), "body": {"rot": (12, 0, 0), "loc": (0, -0.05, 0.08)},
              "head": (15, 0, 0)}),
        (24, {"arm.R": (70, 0, 5), "arm.L": (60, 0, -5), "body": {"rot": (8, 0, 0)}}),
        (36, {}),
    ]),
    ("Hit_A", False, [
        (0, {}),
        (5, {"body": {"rot": (-14, 0, 6), "scale": (1.08, 0.9, 1.06)}, "arm.L": (-25, 0, 15),
             "arm.R": (-25, 0, -15), "head": (-25, 0, 0)}),
        (20, {}),
    ]),
    ("Dodge_Right", False, [
        (0, {}),
        (7, {"root": {"loc": (-0.3, 0, 0), "rot": (0, 0, 10)}, "arm.L": (0, 0, 20)}),
        (22, {}),
    ]),
    ("Cheer", False, [
        (0, {}),
        (10, {"arm.L": (-20, 0, 30), "arm.R": (-20, 0, -30), "body": {"loc": (0, 0.1, 0)}, "head": (-20, 0, 0)}),
        (18, {"arm.L": (-10, 0, 20), "arm.R": (-10, 0, -20), "body": {"loc": (0, 0.0, 0)}}),
        (26, {"arm.L": (-20, 0, 30), "arm.R": (-20, 0, -30), "body": {"loc": (0, 0.1, 0)}}),
        (36, {}),
    ]),
    ("Death_A", False, [
        (0, {}),
        (10, {"body": {"rot": (10, 0, 0)}, "arm.L": (-20, 0, 10), "arm.R": (-20, 0, -10)}),
        (30, OTYUGH_FALLEN),
    ]),
    ("Death_A_Pose", False, [(0, OTYUGH_FALLEN), (1, OTYUGH_FALLEN)]),
]

# Ashardalon moves like the drake, with his wings: half folded at rest, spread wide when he
# rears up to bite or roar, and a fire-breath move (Spellcast_Shoot) of his own.
def wings(spread):
    """Both wings raised (+) or folded (-) by `spread` degrees about their own forward axis."""
    return {"wing.L": (0, 0, spread), "wing.R": (0, 0, -spread)}


ASH_FOLD = 0
ASHARDALON_MOVES = []
for _name, _loop, _keys in BEAR_MOVES:
    _spread = 35 if _name in ("1H_Melee_Attack_Chop", "Cheer") else (-55 if _name.startswith("Death") else ASH_FOLD)
    ASHARDALON_MOVES.append((_name, _loop, [
        (f, {**wings(_spread if (spec and spec is not BEAR_FALLEN) or _name.startswith("Death_A_Pose") else ASH_FOLD), **spec})
        for f, spec in _keys]))
ASHARDALON_MOVES[0] = ("Idle", True, [
    (0, wings(ASH_FOLD)),
    (30, {**wings(ASH_FOLD + 10), "body": (3, 0, 0), "head": (-6, 6, 0), "hips": {"loc": (0, -0.02, 0)}}),
    (60, wings(ASH_FOLD)),
])
ASHARDALON_MOVES.append(("Spellcast_Shoot", False, [
    (0, wings(ASH_FOLD)),
    (12, {**BEAR_REAR, **wings(40), "head": (-35, 0, 0)}),
    (20, {**wings(30), "body": (-6, 0, 0), "head": (25, 0, 0), "arm.L": (10, 0, 0), "arm.R": (10, 0, 0)}),
    (32, {**wings(30), "body": (-4, 0, 0), "head": (20, 0, 0)}),
    (44, wings(ASH_FOLD)),
]))

# name, file, build, height, bones, extra moves (, own moves)
# The board draws villains 1.3 times bigger, so a villain's height here is its real height / 1.3.
# Ashardalon is the big boss: about two squares long on the board, like the real miniature.
MONSTERS = [
    ("orc-smasher", "orc-smasher.glb", lambda: build_orc("mace"), 2.4, ORC_BONES, []),
    ("orc-archer", "orc-archer.glb", lambda: build_orc("bow"), 2.4, ORC_BONES, ["1H_Ranged_Shoot"]),
    ("villager-alek", "villager-alek.glb", lambda: build_villager("alek"), 2.25, CULTIST_BONES, []),
    ("villager-brandis", "villager-brandis.glb", lambda: build_villager("brandis"), 2.35, CULTIST_BONES, []),
    ("villager-cassi", "villager-cassi.glb", lambda: build_villager("cassi"), 2.1, CULTIST_BONES, []),
    ("villager-donnel", "villager-donnel.glb", lambda: build_villager("donnel"), 2.35, CULTIST_BONES, []),
    ("villager-elizar", "villager-elizar.glb", lambda: build_villager("elizar"), 2.2, CULTIST_BONES, []),
    ("rage-drake", "rage-drake.glb", build_drake, 1.4, DRAKE_BONES, [], BEAR_MOVES),
    ("ashardalon", "ashardalon.glb", lambda: build_drake(dragon=True), 2.6, ASHARDALON_BONES, [], ASHARDALON_MOVES),
    ("otyugh", "otyugh.glb", build_otyugh, 2.0, OTYUGH_BONES, [], OTYUGH_MOVES),
    ("gauth", "gauth.glb", build_gauth, 1.8, GAUTH_BONES, [], GAUTH_MOVES),
    ("orc-storm-shaman", "orc-storm-shaman.glb", lambda: build_orc("staff"), 2.2, ORC_BONES, ["Spellcast_Shoot"]),
    ("kobold-dragonshield", "kobold-dragonshield.glb", build_kobold, 1.9, KOBOLD_BONES, []),
    ("kobold-dragonlord", "kobold-dragonlord.glb", lambda: build_kobold(lord=True), 1.85, KOBOLD_BONES, []),
    ("human-cultist", "human-cultist.glb", build_cultist, 2.5, CULTIST_BONES, []),
    ("duergar-guard", "duergar-guard.glb", build_duergar, 2.15, DUERGAR_BONES, []),
    ("duergar-captain", "duergar-captain.glb", lambda: build_duergar(captain=True), 1.85, DUERGAR_BONES, []),
    ("snake", "snake.glb", build_snake, 1.75, SNAKE_BONES, [], SNAKE_MOVES),
    ("cave-bear", "cave-bear.glb", build_bear, 1.65, BEAR_BONES, [], BEAR_MOVES),
    ("legion-devil", "legion-devil.glb", build_devil, 2.5, DEVIL_BONES, []),
    ("grell", "grell.glb", build_grell, 2.2, GRELL_BONES, [], GRELL_MOVES),
    ("gibbering-mouther", "gibbering-mouther.glb", build_mouther, 1.75, MOUTHER_BONES, [], MOUTHER_MOVES),
    # Model Workshop figures.
    ("easton-doom-knight", "easton-doom-knight.glb", build_doom_knight, 2.8, ORC_BONES, []),
    ("colton-lizard-mage", "colton-lizard-mage.glb", build_lizard_mage, 2.5, LIZARD_BONES, ["Spellcast_Shoot"]),
]
# Moves only some figures have.
EXTRA_MOVES = {"1H_Ranged_Shoot", "Spellcast_Shoot"}


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
