"""
Special buildings: Pokémon Centers, shops, inns, the ten gym halls, the Battle Tower and the
League castle at Crownspire, plus town landmarks. Fronts face -Y.
"""
import math
from kit import (chimney, door, fence_run, gable_roof, gable_walls, lantern, mix, porch, shade, stone_band,
                 timber_frame, window)

STONE = 0x9e978b
WOOD = 0x8b5a33
WOOD_DARK = 0x5c3a1f


def emblem(a, x, y, z, r, outer, inner, ring=0x2a2a2a, rot_x=math.pi / 2):
    """A round emblem disc on a wall facing -Y (a Poké Ball style when outer/inner are red/white)."""
    a.cyl(r, r, 0.12, (x, y, z), ring, segs=24, rot=(rot_x, 0, 0))
    a.cyl(r * 0.9, r * 0.9, 0.08, (x, y - 0.09, z), outer, segs=24, rot=(rot_x, 0, 0))
    a.box((r * 1.8, 0.1, r * 0.95), (x, y - 0.11, z - r * 0.46), inner, bevel=0, grid=0)
    a.box((r * 1.8, 0.12, r * 0.12), (x, y - 0.13, z), ring, bevel=0, grid=0)
    a.cyl(r * 0.3, r * 0.3, 0.1, (x, y - 0.15, z), ring, segs=16, rot=(rot_x, 0, 0))
    a.cyl(r * 0.2, r * 0.2, 0.1, (x, y - 0.2, z), 0xf4f2ee, segs=16, rot=(rot_x, 0, 0))


def twin_plates(a, d_front, spread=4.2):
    """The two-person lock in front of a gym door (DESIGN §13.1): a plate either side."""
    for i, s in enumerate((-1, 1)):
        x = s * spread
        y = d_front - 3.2
        a.cyl(1.05, 1.1, 0.12, (x, y, 0), 0x5a6068, segs=24)
        a.cyl(0.85, 0.85, 0.08, (x, y, 0.1), 0x8fd8ff, segs=24, glow=True)
        a.anchor('plate' + 'AB'[i], x, y, 0.15)


# -------------------------------------------------------------------------------------------------
# Services
# -------------------------------------------------------------------------------------------------
def pokecenter(a):
    w, d, h = 12.0, 10.0, 4.6
    stone_band(a, w, d, 0.6, STONE)
    a.box((w, d, h), (0, 0, 0.5 + h / 2), 0xf6f1e6, bevel=0.06)
    a.box((w + 0.12, d + 0.12, 0.35), (0, 0, 0.5 + h - 0.1), 0xd9473a, bevel=0.04)
    top = 0.5 + h
    gable_walls(a, w, d, top, 3.0, 0xf6f1e6)
    gable_roof(a, w, d, top, 3.0, 0.7, 0xd9473a, 'tile')
    # glass entrance with an awning and the emblem above it
    a.box((4.2, 0.2, 3.0), (0, -d / 2 - 0.05, 0.5 + 1.5), 0x2a3a48, bevel=0.03, grid=0)
    a.box((1.75, 0.1, 2.7), (-0.95, -d / 2 - 0.12, 0.5 + 1.38), 0x9fe0ff, glow=True, bevel=0, grid=0)
    a.box((1.75, 0.1, 2.7), (0.95, -d / 2 - 0.12, 0.5 + 1.38), 0x9fe0ff, glow=True, bevel=0, grid=0)
    a.box((5.6, 2.2, 0.22), (0, -d / 2 - 1.0, 0.5 + 3.35), 0xd9473a, rot=(-0.15, 0, 0), bevel=0.05)
    emblem(a, 0, -d / 2 - 0.08, top + 1.3, 1.05, 0xd9473a, 0xf6f1e6)
    for x in (-w * 0.33, w * 0.33):
        window(a, x, 0.5 + 2.0, -d / 2 - 0.06, 0xd9473a, None, w=1.6, h=1.4)
    a.box((5.2, 2.0, 0.5), (0, -d / 2 - 1.1, 0.25), 0xc9c3b7, bevel=0.06)
    for s in (-1, 1):
        lantern(a, s * 3.1, -d / 2 - 1.6, 2.6)
    a.door(0, -d / 2 - 2.2, 'center')
    a.anchor('desk', 0, -d / 2 - 2.0)
    a.collider_box(0, 0, w / 2 + 0.2, d / 2 + 0.2, top + 3)


def mart(a):
    w, d, h = 10.0, 8.0, 4.2
    stone_band(a, w, d, 0.5, STONE)
    a.box((w, d, h), (0, 0, 0.4 + h / 2), 0xf4f2ec, bevel=0.06)
    a.box((w + 0.12, d + 0.12, 0.9), (0, 0, 0.4 + h - 0.55), 0x3d6fc4, bevel=0.04)
    top = 0.4 + h
    gable_walls(a, w, d, top, 2.4, 0xf4f2ec)
    gable_roof(a, w, d, top, 2.4, 0.6, 0x3d6fc4, 'tile')
    a.box((3.6, 0.2, 2.8), (0, -d / 2 - 0.05, 0.4 + 1.4), 0x2a3a48, bevel=0.03, grid=0)
    a.box((3.2, 0.1, 2.5), (0, -d / 2 - 0.12, 0.4 + 1.3), 0x9fe0ff, glow=True, bevel=0, grid=0)
    for x in (-w * 0.32, w * 0.32):
        window(a, x, 0.4 + 2.0, -d / 2 - 0.06, 0x3d6fc4, None, w=1.8, h=1.3)
    # striped awning and crates of goods
    for i in range(8):
        a.box((w * 0.9 / 8, 1.6, 0.05), (-w * 0.45 + (i + 0.5) * w * 0.9 / 8, -d / 2 - 0.75, 0.4 + 3.1), 0x3d6fc4 if i % 2 == 0 else 0xf4f2ec, rot=(-0.3, 0, 0), bevel=0, grid=0)
    for i, x in enumerate((-3.6, -2.6, 2.7)):
        a.box((0.8, 0.8, 0.7), (x, -d / 2 - 1.0, 0.35), 0xb07a46, bevel=0.04, grid=0)
        a.sphere(0.25, (x - 0.15, -d / 2 - 1.0, 0.82), [0xd9473a, 0xffd23a, 0x6fae3c][i], segs=8)
        a.sphere(0.25, (x + 0.18, -d / 2 - 0.95, 0.8), [0xffd23a, 0x6fae3c, 0xd9473a][i], segs=8)
    lantern(a, 2.2, -d / 2 - 0.3, 2.7, post=False)
    a.door(0, -d / 2 - 1.6, 'shop')
    a.collider_box(0, 0, w / 2 + 0.2, d / 2 + 0.2, top + 2.4)


def inn(a):
    w, d = 11.0, 8.0
    found, wallh, rise = 0.7, 5.4, 3.0
    top = found + wallh
    stone_band(a, w, d, found + 0.1, STONE)
    a.box((w, d, wallh), (0, 0, found + wallh / 2), 0xf6e2b8, bevel=0.04)
    timber_frame(a, w, d, found, wallh, WOOD_DARK)
    gable_walls(a, w, d, top, rise, 0xf6e2b8)
    gable_roof(a, w, d, top, rise, 0.6, 0x8a5a3a, 'tile', trim=WOOD_DARK)
    door(a, 0, -d / 2 - 0.05, 0x7a4a26, WOOD_DARK, w=1.6, step=found)
    for x in (-w * 0.33, w * 0.33):
        window(a, x, found + 1.5, -d / 2 - 0.05, WOOD_DARK, 0x4f8f3a, flowers=True)
    for x in (-w * 0.33, 0.0, w * 0.33):
        window(a, x, found + 3.8, -d / 2 - 0.05, WOOD_DARK, 0x4f8f3a, flowers=True)
    chimney(a, w * 0.3, 0, top + 0.6, rise + 0.6, 0x8e8478)
    chimney(a, -w * 0.3, 0, top + 0.6, rise + 0.4, 0x8e8478)
    # hanging sign on a bracket
    a.box((0.12, 1.6, 0.12), (1.6, -d / 2 - 0.8, found + 3.0), WOOD_DARK, bevel=0.02, grid=0)
    a.box((1.1, 0.1, 0.8), (1.6, -d / 2 - 1.4, found + 2.4), 0xb07a46, bevel=0.03, grid=0)
    a.cyl(0.18, 0.18, 0.08, (1.6, -d / 2 - 1.47, found + 2.4), 0xc9a24a, segs=10, rot=(math.pi / 2, 0, 0))
    porch(a, w * 0.5, 1.6, found + 2.6, -d / 2, 0x8a5a3a, WOOD_DARK, floor_color=0x9a6a3c)
    for s in (-1, 1):
        lantern(a, s * 1.4, -d / 2 - 1.5, 2.5)
    a.door(0, -d / 2 - 2.0, 'inn')
    a.collider_box(0, 0, w / 2 + 0.2, d / 2 + 0.2, top + rise)


# -------------------------------------------------------------------------------------------------
# Gyms (DESIGN §13): one hall per type, each with the twin plates in front of its doors
# -------------------------------------------------------------------------------------------------
def gym_hall(a, w, d, h, wall, roof, roof_kind='slate', trim=0x2a2a2a, emblem_cols=(0xffffff, 0xffffff)):
    stone_band(a, w, d, 0.8, STONE)
    a.box((w, d, h), (0, 0, 0.6 + h / 2), wall, bevel=0.08)
    top = 0.6 + h
    gable_walls(a, w, d, top, 4.0, wall)
    gable_roof(a, w, d, top, 4.0, 0.8, roof, roof_kind)
    # great double doors under a portico
    a.box((5.6, 0.4, 5.2), (0, -d / 2 - 0.1, 0.6 + 2.6), trim, bevel=0.06, grid=0)
    a.box((2.2, 0.2, 4.6), (-1.15, -d / 2 - 0.3, 0.6 + 2.3), shade(trim, 1.6), bevel=0.03, grid=0)
    a.box((2.2, 0.2, 4.6), (1.15, -d / 2 - 0.3, 0.6 + 2.3), shade(trim, 1.6), bevel=0.03, grid=0)
    for s in (-1, 1):
        a.cyl(0.45, 0.4, 6.2, (s * 3.4, -d / 2 - 1.6, 0.4), shade(wall, 1.05), segs=12)
    a.box((8.4, 3.0, 0.5), (0, -d / 2 - 1.4, 0.6 + 6.0), shade(wall, 0.9), bevel=0.1)
    a.box((7.4, 3.0, 1.2), (0, -d / 2 - 1.4, 0.6 + 6.85), roof, bevel=0.08)
    emblem(a, 0, -d / 2 - 0.3, top + 1.6, 1.4, emblem_cols[0], emblem_cols[1])
    a.box((7.0, 3.0, 0.6), (0, -d / 2 - 1.7, 0.3), 0xc9c3b7, bevel=0.08)
    for x in (-w * 0.36, w * 0.36):
        window(a, x, 0.6 + 3.0, -d / 2 - 0.08, trim, None, w=1.6, h=2.6)
    for s in (-1, 1):
        lantern(a, s * 5.2, -d / 2 - 2.6, 3.0)
    twin_plates(a, -d / 2 - 0.4)
    a.door(0, -d / 2 - 2.6, 'gym')
    a.collider_box(0, 0, w / 2 + 0.3, d / 2 + 0.3, top + 4)
    for s in (-1, 1):
        a.collider_circle(s * 3.4, -d / 2 - 1.6, 0.5, 6.6)
    return top


def gym_bug(a):
    top = gym_hall(a, 22, 18, 8, 0xe8dcb8, 0x5f8f37, 'turf', trim=0x5a3a20, emblem_cols=(0x9ac43a, 0xf2e6a0))
    # greenhouse dome on the back and honeycomb panels
    a.sphere(5.5, (0, 4.5, top - 1), 0xbfe8d0, segs=14, scale=(1, 1, 0.75))
    for i in range(7):
        for j in range(2):
            x = -6 + i * 2.0 + (j % 2)
            a.cyl(0.65, 0.65, 0.16, (x, -9.05, 2.4 + j * 1.15), 0xf0c43a, segs=6, rot=(math.pi / 2, 0, 0))
    for i in range(4):
        a.box((0.8, 0.8, 1.0), (-9 + i * 1.2, -11.5, 0.5), 0xf2e2a0, bevel=0.06, grid=0)
        a.box((0.9, 0.9, 0.12), (-9 + i * 1.2, -11.5, 1.05), 0x8a5a3a, bevel=0.03, grid=0)


def gym_water(a):
    top = gym_hall(a, 24, 18, 8, 0xf4f2ec, 0x2f6fa8, 'tile', trim=0x1f3f5f, emblem_cols=(0x3d8fd8, 0xbfe6ff))
    for i in range(3):
        a.sphere(4.5 - i, (-5 + i * 5, 3, top + 2.5 - i * 0.6), 0x3d8fd8, segs=12, scale=(1.4, 1.8, 0.45))
    for s in (-1, 1):
        a.cyl(0.25, 0.25, 2.2, (s * 9, -10.5, 0), 0x2a2a2a, segs=8)
        a.cyl(1.0, 1.0, 0.25, (s * 9, -10.5, 1.4), 0x2a2a2a, segs=12, rot=(math.pi / 2, 0, 0))


def gym_fire(a):
    top = gym_hall(a, 22, 18, 9, 0x4a4746, 0xb8642c, 'slate', trim=0x2a1a14, emblem_cols=(0xff6a2a, 0xffd27a))
    for x in (-6, 0, 6):
        chimney(a, x, 4, top + 1, 6, 0x3a3836)
        a.box((0.5, 0.5, 0.3), (x, 4, top + 7.3), 0xff8a2a, glow=True, bevel=0, grid=0)
    for x in (-8, 8):
        a.box((2.2, 0.2, 1.0), (x, -9.12, 1.2), 0xff7a2a, glow=True, bevel=0, grid=0)


def gym_electric(a):
    top = gym_hall(a, 22, 18, 9, 0xd6d6d0, 0x3a3f48, 'slate', trim=0x2a2f38, emblem_cols=(0xffd23a, 0x2a2f38))
    for s in (-1, 1):
        x = s * 13.5
        a.cyl(0.7, 0.45, 20, (x, 4, 0), 0xe8e8e2, segs=12)
        a.box((1.4, 2.0, 1.4), (x, 3.4, 20.3), 0xe8e8e2, bevel=0.2)
        for k in range(3):
            ang = k * 2 * math.pi / 3
            a.box((0.5, 0.12, 7.0), (x + math.sin(ang) * 3.5, 2.2, 20.3 + math.cos(ang) * 3.5), 0xf4f4ee, rot=(0, ang, 0), bevel=0.08)
    a.cyl(0.12, 0.02, 6, (0, 2, top + 4.2), 0xffd23a, segs=6)


def gym_ground(a):
    for i, (w, d, h) in enumerate([(26, 20, 4), (20, 15, 4), (14, 10, 4)]):
        a.box((w, d, h), (0, 1.5 * i, 0.6 + i * 4 + h / 2), shade(0xc9935a, 1.0 - i * 0.06), bevel=0.25, segs=2)
        for k in range(int(w / 1.5)):
            a.box((1.2, 0.4, 0.5), (-w / 2 + 0.75 + k * 1.5, -d / 2 + 1.5 * i - 0.1, 0.6 + i * 4 + h - 0.2), 0xb07a46, bevel=0.06, grid=0)
    a.box((5.6, 0.4, 5.2), (0, -10.1, 3.2), 0x6a4a2a, bevel=0.06, grid=0)
    a.box((4.4, 0.2, 4.6), (0, -10.3, 2.9), 0x8a6a4a, bevel=0.03, grid=0)
    emblem(a, 0, -10.3, 7.0, 1.4, 0xc9935a, 0x6a4a2a)
    for s in (-1, 1):
        lantern(a, s * 5.2, -12.6, 3.0)
    twin_plates(a, -10.4)
    a.door(0, -12.6, 'gym')
    a.collider_box(0, 0, 13.3, 10.3, 13)


def gym_ice(a):
    a.box((22, 18, 1.2), (0, 0, 0.6), 0xdfeaf2, bevel=0.2)
    a.sphere(10, (0, 0, 1.0), 0xbfe6ff, segs=10, scale=(1.05, 0.85, 0.85))
    for k in range(10):
        ang = k / 10 * math.pi * 2
        a.cyl(0.9, 0.0, 4 + (k % 3) * 2, (math.cos(ang) * 10.5, math.sin(ang) * 8.5, 0.8), 0xdff4ff, segs=5)
    a.box((5.6, 3.0, 5.2), (0, -8.8, 3.2), 0xe8f2fa, bevel=0.3, segs=2)
    a.box((2.2, 0.2, 4.6), (-1.15, -10.35, 2.9), 0x9fd0f0, bevel=0.03, grid=0)
    a.box((2.2, 0.2, 4.6), (1.15, -10.35, 2.9), 0x9fd0f0, bevel=0.03, grid=0)
    emblem(a, 0, -10.4, 7.2, 1.3, 0x8fd8ff, 0xf4fbff)
    for s in (-1, 1):
        lantern(a, s * 5.2, -12.6, 3.0)
    twin_plates(a, -10.4)
    a.door(0, -12.6, 'gym')
    a.collider_box(0, 0, 11.2, 9.2, 10)


def gym_psychic(a):
    top = gym_hall(a, 22, 18, 9, 0xb3ada0, 0x5b4a8a, 'slate', trim=0x3a2a5a, emblem_cols=(0xd86ad8, 0xf4e8ff))
    a.cyl(5.0, 5.0, 4, (0, 4, top), 0xb3ada0, segs=20)
    a.sphere(5.2, (0, 4, top + 4), 0x5b4a8a, segs=16, scale=(1, 1, 0.8))
    a.box((0.8, 5.2, 4.2), (0, 1.5, top + 5.5), 0x2a2238, rot=(0.5, 0, 0), bevel=0.05)
    for s in (-1, 1):
        a.box((1.2, 0.8, 4.0), (s * 9.5, -12, 2.0), 0x8a8478, bevel=0.15, segs=2)
        a.box((0.5, 0.1, 2.4), (s * 9.5, -12.42, 2.2), 0x8fe8ff, glow=True, bevel=0, grid=0)


def gym_ghost(a):
    for s in (-1, 0, 1):
        for t in (-1, 1):
            a.cyl(0.35, 0.3, 2.2, (s * 9, t * 7, -0.4), 0x3a3238, segs=8)
    a.push((0, 0, 1.6))
    top = gym_hall(a, 20, 16, 8, 0x4a4250, 0x2a2430, 'slate', trim=0x1a1420, emblem_cols=(0x8a5ad8, 0x2a2430))
    a.cyl(2.2, 2.2, 14, (8, 4, 0), 0x3e3846, segs=10)
    a.cyl(2.8, 0.1, 5, (8, 4, 14), 0x2a2430, segs=10, rot=(0.12, 0, 0))
    for x in (-6, 6):
        a.box((0.8, 0.2, 1.0), (x, -8.12, 4.2), 0xb48aff, glow=True, bevel=0, grid=0)
    a.pop()


def gym_fairy(a):
    top = gym_hall(a, 22, 18, 8, 0xfff0f4, 0xe88aa8, 'tile', trim=0xb85a7a, emblem_cols=(0xf48ac8, 0xfff0f8))
    for i in range(5):
        x = -8 + i * 4
        a.cyl(1.9, 1.9, 0.4, (x, -9.3, 4.5), 0xf4c8d8, segs=16, rot=(math.pi / 2, 0, 0))
        for k in range(5):
            a.sphere(0.35, (x - 1.2 + k * 0.6, -10.2, 0.7), [0xff6fa0, 0xffd23a, 0xa77bff, 0xfff4e0, 0xff7a4a][k], segs=6)
        a.box((2.6, 0.9, 0.6), (x, -10.2, 0.3), 0xc9a0a8, bevel=0.06, grid=0)


def gym_steel(a):
    top = gym_hall(a, 24, 18, 9, 0x8a9098, 0x5a6068, 'slate', trim=0x3a3f48, emblem_cols=(0xb8c0c8, 0x3a3f48))
    for k in range(4):
        a.box((5.5, 18, 0.3), (-9 + k * 6, 0, top + 4.6), 0x6a7078, rot=(0, -0.45, 0), bevel=0.05)
    for s in (-1, 1):
        x = s * 13
        a.cyl(2.2, 2.2, 0.6, (x, -6, 6), 0x5a6068, segs=12, rot=(0, math.pi / 2, 0))
        for k in range(8):
            ang = k / 8 * math.pi * 2
            a.box((0.6, 0.6, 0.7), (x, -6 + math.cos(ang) * 2.3, 6.3 + math.sin(ang) * 2.3), 0x5a6068, bevel=0.05, grid=0)
    chimney(a, -8, 5, top + 1, 7, 0x6a6460)


def battle_tower(a):
    a.box((26, 26, 1.2), (0, 0, 0.6), 0xc9c3b7, bevel=0.2)
    levels = [(9.0, 8), (8.0, 8), (7.0, 8), (6.0, 8), (5.0, 8)]
    z = 1.2
    for i, (r, h) in enumerate(levels):
        a.cyl(r, r * 0.96, h, (0, 0, z), shade(0xe8e4dc, 1.0 - i * 0.03), segs=16)
        a.cyl(r + 0.5, r + 0.5, 0.5, (0, 0, z + h - 0.3), 0x3d5f9a, segs=16)
        for k in range(8):
            ang = k / 8 * math.pi * 2
            a.box((1.0, 0.1, h * 0.55), (math.sin(ang) * (r + 0.05), -math.cos(ang) * (r + 0.05), z + h * 0.5), 0x9fe0ff, rot=(0, 0, ang), glow=True, bevel=0, grid=0)
        z += h
    a.cyl(4.5, 0.3, 6, (0, 0, z), 0x3d5f9a, segs=16)
    a.sphere(1.0, (0, 0, z + 6.2), 0xffe27a, segs=10, glow=True)
    a.lamp(0, 0, z + 6.2)
    a.box((6, 3, 5), (0, -9.5, 3.7), 0x3d5f9a, bevel=0.1)
    a.box((4, 0.2, 4), (0, -11.05, 3.2), 0x9fe0ff, glow=True, bevel=0, grid=0)
    a.door(0, -13.0, 'tower')
    a.collider_circle(0, 0, 9.4, z + 7)
    a.collider_box(0, -9.5, 3.2, 1.6, 6)


def league_castle(a):
    W, D = 44, 36
    wall, roof = 0xdcd6c8, 0x3d5f9a
    # curtain walls with crenellations
    for (x0, y0, x1, y1) in [(-W / 2, -D / 2, -3.5, -D / 2), (3.5, -D / 2, W / 2, -D / 2), (W / 2, -D / 2, W / 2, D / 2), (W / 2, D / 2, -W / 2, D / 2), (-W / 2, D / 2, -W / 2, -D / 2)]:
        L = math.hypot(x1 - x0, y1 - y0)
        ang = math.atan2(y1 - y0, x1 - x0)
        a.push(((x0 + x1) / 2, (y0 + y1) / 2, 0), rot_z=ang)
        a.box((L, 2.2, 9), (0, 0, 4.5), wall, bevel=0.1)
        for k in range(int(L / 1.6)):
            a.box((0.9, 2.3, 1.0), (-L / 2 + 0.8 + k * 1.6, 0, 9.5), shade(wall, 0.96), bevel=0.06, grid=0)
        a.pop()
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.cyl(4.0, 3.8, 15, (sx * W / 2, sy * D / 2, 0), wall, segs=16)
            a.cyl(4.6, 0.2, 8, (sx * W / 2, sy * D / 2, 15), roof, segs=16)
            a.cyl(0.08, 0.08, 3, (sx * W / 2, sy * D / 2, 23), 0x3a3a3a, segs=4)
            a.box((0.06, 1.6, 1.0), (sx * W / 2, sy * D / 2 + 0.8, 25.4), 0xf0c43a, bevel=0, grid=0)
    # gatehouse and keep
    a.box((10, 6, 14), (0, -D / 2, 7), shade(wall, 0.95), bevel=0.15)
    a.box((5, 0.3, 7), (0, -D / 2 - 3.1, 3.5), 0x2a2a2a, bevel=0.05, grid=0)
    a.cyl(2.5, 2.5, 0.3, (0, -D / 2 - 3.1, 7), 0x2a2a2a, segs=16, rot=(math.pi / 2, 0, 0))
    a.box((22, 18, 22), (0, 4, 11), wall, bevel=0.15)
    gable_walls(a, 22, 18, 22, 7, wall)
    gable_roof(a, 22, 18, 22, 7, 0.8, roof, 'slate')
    a.cyl(3.5, 3.5, 34, (0, 4, 0), shade(wall, 1.03), segs=16)
    a.cyl(4.2, 0.2, 12, (0, 4, 34), roof, segs=16)
    for x in (-6, 0, 6):
        for z in (8, 15):
            window(a, x, z, -5.05, 0x3a3a3a, None, w=1.4, h=2.4)
    emblem(a, 0, -D / 2 - 3.05, 11.5, 1.8, 0x3d5f9a, 0xf0c43a)
    for s in (-1, 1):
        lantern(a, s * 6.5, -D / 2 - 4.5, 3.2)
    twin_plates(a, -D / 2 - 3.4, spread=5.0)
    a.door(0, -D / 2 - 5.0, 'league')
    a.collider_box(0, 0, W / 2 + 4, D / 2 + 4, 24)


def victory_gate(a):
    for s in (-1, 1):
        a.box((5, 5, 16), (s * 8, 0, 8), 0xdcd6c8, bevel=0.15)
        a.cyl(3.4, 0.2, 7, (s * 8, 0, 16), 0x3d5f9a, segs=12)
    a.box((21, 4.5, 4), (0, 0, 14), 0xd0cabc, bevel=0.15)
    emblem(a, 0, -2.3, 13.5, 1.3, 0x3d5f9a, 0xf0c43a)
    for s in (-1, 1):
        lantern(a, s * 4.5, -3.2, 3.2)
    a.anchor('gate', 0, -3.5)
    a.collider_box(-8, 0, 2.6, 2.6, 16)
    a.collider_box(8, 0, 2.6, 2.6, 16)


# -------------------------------------------------------------------------------------------------
# Landmarks and town furniture
# -------------------------------------------------------------------------------------------------
def windmill(a):
    a.cyl(3.2, 2.2, 10, (0, 0, 0), 0xf4ecdc, segs=12)
    a.cyl(2.7, 0.3, 3.6, (0, 0, 10), 0x8a5a3a, segs=12)
    a.cyl(0.35, 0.35, 1.6, (0, -2.4, 10.2), WOOD_DARK, segs=8, rot=(math.pi / 2, 0, 0))
    for k in range(4):
        ang = k * math.pi / 2 + 0.3
        a.push((0, -3.4, 10.2), rot=(0, ang, 0))
        a.box((0.3, 0.15, 7.0), (0, 0, 3.6), WOOD_DARK, bevel=0.03, grid=0)
        a.box((1.5, 0.08, 5.6), (0.85, 0, 4.0), 0xf4ecdc, bevel=0.02, grid=0)
        a.pop()
    door(a, 0, -2.75, 0x7a4a26, WOOD_DARK, w=1.0, h=2.0)
    window(a, 0, 6.0, -2.4, WOOD_DARK, None, w=0.7, h=0.8)
    a.collider_circle(0, 0, 3.0, 13)


def lighthouse(a):
    a.cyl(4.0, 4.0, 1.4, (0, 0, 0), 0x8e8478, segs=14)
    for i in range(6):
        a.cyl(2.6 - i * 0.12, 2.6 - (i + 1) * 0.12, 3.0, (0, 0, 1.4 + i * 3.0), 0xd9473a if i % 2 else 0xf4f2ee, segs=14)
    top = 1.4 + 18
    a.cyl(2.4, 2.4, 0.4, (0, 0, top), 0x2a2a2a, segs=14)
    a.cyl(1.4, 1.4, 2.2, (0, 0, top + 0.4), 0xffe9a8, segs=12, glow=True)
    a.cyl(1.8, 0.2, 1.8, (0, 0, top + 2.6), 0xd9473a, segs=12)
    a.lamp(0, 0, top + 1.5)
    door(a, 0, -2.55, 0x2f4b5a, 0x2a2a2a, w=1.0, h=2.0)
    a.collider_circle(0, 0, 2.8, top + 4)


def watchtower(a):
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.cyl(0.25, 0.22, 9, (sx * 1.6, sy * 1.6, 0), WOOD_DARK, segs=8)
    a.box((4.4, 4.4, 0.3), (0, 0, 7.5), WOOD, bevel=0.04)
    for side in range(4):
        a.push(rot_z=side * math.pi / 2)
        fence_run(a, -2.1, -2.1, 2.1, -2.1, WOOD, h=1.0, kind='rail')
        a.pop()
    a.box((4.8, 4.8, 0.2), (0, 0, 9.6), 0x8a5a3a, bevel=0.04)
    a.cyl(3.3, 0.1, 2.0, (0, 0, 9.7), 0x8a5a3a, segs=4, rot=(0, 0, math.pi / 4))
    for i in range(14):
        a.box((0.8, 0.1, 0.1), (2.0, -1.6 + 0, 0.5 * i + 0.3), WOOD_DARK, bevel=0, grid=0)
    lantern(a, 0, -2.0, 8.4, post=False)
    a.collider_box(0, 0, 2.0, 2.0, 7.5)
    a.anchor('top', 0, 0, 7.65)


def well(a):
    a.cyl(1.3, 1.3, 0.9, (0, 0, 0), 0x9e978b, segs=14)
    a.cyl(1.05, 1.05, 0.2, (0, 0, 0.75), 0x2f4f6f, segs=14)
    for s in (-1, 1):
        a.box((0.18, 0.18, 2.4), (s * 1.1, 0, 1.2), WOOD_DARK, bevel=0.02, grid=0)
    a.cyl(0.12, 0.12, 2.4, (-1.2, 0, 2.0), WOOD, segs=8, rot=(0, math.pi / 2, 0))
    for s in (-1, 1):
        a.box((3.0, 1.3, 0.12), (0, s * 0.55, 2.75), 0x8a5a3a, rot=(-s * 0.55, 0, 0), bevel=0.02, grid=0)
    a.cyl(0.25, 0.2, 0.35, (0, -0.2, 1.5), 0x7a5a3a, segs=8)
    a.collider_circle(0, 0, 1.35, 1.0)


def fountain(a):
    a.cyl(4.0, 4.0, 0.6, (0, 0, 0), 0xc9c3b7, segs=20)
    a.cyl(3.6, 3.6, 0.2, (0, 0, 0.45), 0x5fa8d8, segs=20)
    a.cyl(0.6, 0.5, 2.2, (0, 0, 0.5), 0xc9c3b7, segs=12)
    a.cyl(1.8, 1.6, 0.4, (0, 0, 2.6), 0xc9c3b7, segs=16)
    a.cyl(1.5, 1.5, 0.12, (0, 0, 2.95), 0x5fa8d8, segs=16)
    a.cyl(0.3, 0.2, 1.4, (0, 0, 2.9), 0xc9c3b7, segs=8)
    a.sphere(0.5, (0, 0, 4.4), 0xd9473a, segs=10)
    a.collider_circle(0, 0, 4.0, 0.7)


def monolith(a):
    a.box((3.0, 3.0, 0.5), (0, 0, 0.25), 0x8a8478, bevel=0.1)
    a.box((1.4, 1.0, 5.0), (0, 0, 3.0), 0x7a7a74, bevel=0.15, segs=2)
    a.cyl(0.9, 0.0, 0.8, (0, 0, 5.5), 0x7a7a74, segs=4, rot=(0, 0, math.pi / 4))
    for k in range(5):
        a.box((0.5, 0.06, 0.18), (0, -0.53, 1.3 + k * 0.75), 0x8fe8ff, glow=True, bevel=0, grid=0)
    a.collider_box(0, 0, 0.8, 0.6, 5.5)


def notice_board(a):
    for s in (-1, 1):
        a.box((0.16, 0.16, 2.4), (s * 1.0, 0, 1.2), WOOD_DARK, bevel=0.02, grid=0)
    a.box((2.3, 0.12, 1.4), (0, 0, 1.6), 0x9a6a3c, bevel=0.03, grid=0)
    a.box((2.6, 0.5, 0.12), (0, -0.1, 2.45), 0x6a4a2a, rot=(-0.3, 0, 0), bevel=0.02, grid=0)
    for k in range(6):
        x = -0.75 + (k % 3) * 0.75
        z = 1.9 - (k // 3) * 0.6
        a.box((0.5, 0.03, 0.42), (x + (a.rnd.random() - 0.5) * 0.1, -0.08, z), [0xf4ecd8, 0xf0e2c0, 0xfff4e0][k % 3], rot=(0, (a.rnd.random() - 0.5) * 0.15, 0), bevel=0, grid=0)
    a.anchor('read', 0, -1.0)
    a.collider_box(0, 0, 1.1, 0.2, 2.6)


SPECIALS = {
    'pokecenter': ('services', pokecenter),
    'mart': ('services', mart),
    'inn': ('services', inn),
    'gym_bug': ('gyms', gym_bug),
    'gym_water': ('gyms', gym_water),
    'gym_fire': ('gyms', gym_fire),
    'gym_electric': ('gyms', gym_electric),
    'gym_ground': ('gyms', gym_ground),
    'gym_ice': ('gyms', gym_ice),
    'gym_psychic': ('gyms', gym_psychic),
    'gym_ghost': ('gyms', gym_ghost),
    'gym_fairy': ('gyms', gym_fairy),
    'gym_steel': ('gyms', gym_steel),
    'battle_tower': ('landmarks', battle_tower),
    'league_castle': ('landmarks', league_castle),
    'victory_gate': ('landmarks', victory_gate),
    'windmill': ('landmarks', windmill),
    'lighthouse': ('landmarks', lighthouse),
    'watchtower': ('landmarks', watchtower),
    'well': ('furniture', well),
    'fountain': ('furniture', fountain),
    'monolith': ('furniture', monolith),
    'notice_board': ('furniture', notice_board),
}
