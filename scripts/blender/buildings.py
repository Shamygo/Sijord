"""
Houses for each settlement style (src/shared/region.ts SettlementStyle). Each builder takes an
Asset and a variant number and models one building with its front (door) facing -Y.
"""
import math
from kit import (Asset, chimney, door, fence_run, gable_roof, gable_walls, lantern, log_walls, mix, porch,
                 shade, stone_band, timber_frame, window)

ROOFS = {
    'meadow': [0xc8473a, 0x3d6fc4, 0x4f8f3a, 0x8a5a3a, 0xd77a2f],
    'stone': [0x5a6878, 0x4d5866, 0x6b6f78],
    'ice': [0x4f7fa8, 0x8a5a3a, 0x3d6fc4],
    'basalt': [0x3f8f7a, 0xb8642c, 0x5a4a44],
    'harbour': [0x3a3f48, 0x8a3a2c, 0x2f4f5f],
    'castle': [0x3d5f9a, 0x2f4b7a],
}
WALLS = {
    'meadow': [0xf4e8cc, 0xfff6e8, 0xf6e2b8, 0xf3d9cc, 0xe8eedf],
    'stone': [0xa7a39a, 0x9a978f, 0xb3ada0],
    'ice': [0xf4f6f8, 0xe8eef4, 0xf6f1e6],
    'adobe': [0xdcb486, 0xd7a06c, 0xe6c49a, 0xcf8f5e],
    'basalt': [0x4a4746, 0x5a5450, 0x3e3c3d],
    'harbour': [0xc8473a, 0xf0c43a, 0x3d6fc4, 0xf4ecdc, 0x4f8f5a, 0xd77a2f],
    'castle': [0xd8d2c4, 0xcfc8b8],
}
WOOD = 0x8b5a33
WOOD_DARK = 0x5c3a1f
STONE = 0x9e978b


def pick(a, lst, variant):
    return lst[(variant * 7 + 3) % len(lst)]


# -------------------------------------------------------------------------------------------------
# Meadow: half-timbered cottages like Bramblewick's
# -------------------------------------------------------------------------------------------------
def meadow_house(a, variant, large=False):
    w, d = (8.6, 6.8) if large else (6.4, 5.4)
    found = 0.7
    wallh = 5.0 if large else 3.0
    top = found + wallh
    rise = 2.6 if large else 2.1
    wall = pick(a, WALLS['meadow'], variant)
    roof = pick(a, ROOFS['meadow'], variant)
    stone_band(a, w, d, found + 0.1, STONE)
    a.box((w, d, wallh), (0, 0, found + wallh / 2), wall, bevel=0.04)
    timber_frame(a, w, d, found, wallh, WOOD_DARK)
    gable_walls(a, w, d, top, rise, wall)
    gable_roof(a, w, d, top, rise, 0.55, roof, 'tile', trim=WOOD_DARK)
    dx = -w * 0.18 if variant % 2 else w * 0.18
    door(a, dx, -d / 2 - 0.05, 0x7a4a26, WOOD_DARK, step=found)
    shutter = [0x3d6fc4, 0x4f8f3a, 0xc8473a, 0x8a5a3a][variant % 4]
    for x in ((-w * 0.32, w * 0.32) if not large else (-w * 0.35, 0.0, w * 0.35)):
        if abs(x - dx) < 1.3:
            continue
        window(a, x, found + 1.45, -d / 2 - 0.05, WOOD_DARK, shutter, flowers=(variant + int(x)) % 2 == 0)
    if large:
        for x in (-w * 0.3, w * 0.3):
            window(a, x, found + 3.7, -d / 2 - 0.05, WOOD_DARK, shutter, flowers=True)
    for side in (1, -1):
        a.push(rot_z=side * math.pi / 2)
        window(a, 0, found + 1.45, -w / 2 - 0.05, WOOD_DARK, shutter)
        a.pop()
    chimney(a, w * 0.28 * (1 if variant % 2 else -1), d * 0.15, top + 0.5, rise + 0.6, 0x8e8478)
    lantern(a, dx + 0.95, -d / 2 - 0.25, 2.3, post=False)
    if a.detail and variant % 3 == 0:
        porch(a, w * 0.62, 1.4, 2.5 + found, -d / 2, roof, WOOD_DARK, floor_color=0x9a6a3c)
    a.collider_box(0, 0, w / 2 + 0.15, d / 2 + 0.15, top + rise)
    return {'w': w, 'd': d, 'h': top + rise}


# -------------------------------------------------------------------------------------------------
# Timber: Nordic log houses with turf roofs and carved red trim
# -------------------------------------------------------------------------------------------------
def timber_house(a, variant, large=False):
    w, d = (10.5, 6.2) if large else (6.6, 5.2)
    found = 0.45
    wallh = 2.9 if not large else 3.4
    top = found + wallh
    rise = 2.3 if not large else 2.8
    logc = [0x8b5a33, 0x7a4e2c, 0x95633a][variant % 3]
    stone_band(a, w, d, found + 0.15, 0x8f887c)
    a.box((w - 0.2, d - 0.2, wallh), (0, 0, found + wallh / 2), shade(logc, 0.7), bevel=0.02)
    log_walls(a, w, d, found, wallh, logc)
    gable_walls(a, w, d, top, rise, shade(logc, 0.9))
    gable_roof(a, w, d, top, rise, 0.5, 0x6a4a2a, 'turf', trim=0xb33a2a)
    if a.detail:
        # dragon-head finials at the gable peaks
        for yy in (-d / 2 - 0.55, d / 2 + 0.55):
            a.cyl(0.12, 0.05, 1.1, (0, yy, top + rise + 0.2), 0xb33a2a, segs=6, rot=(0.6 if yy < 0 else -0.6, 0, 0))
    door(a, 0.0 if large else -w * 0.15, -d / 2 - 0.12, 0xb33a2a, WOOD_DARK, step=found)
    for x in (-w * 0.33, w * 0.3):
        window(a, x, found + 1.5, -d / 2 - 0.12, 0xf3ead6, None, w=0.75, h=0.85)
    if large:
        for x in (-w * 0.12, w * 0.12):
            window(a, x * 2.5, found + 1.5, d / 2 + 0.12, 0xf3ead6, None, w=0.75, h=0.85, rot_z=math.pi)
    chimney(a, w * 0.25, 0, top + 0.6, rise, 0x8f887c)
    lantern(a, 0.95 if large else -w * 0.15 + 0.95, -d / 2 - 0.4, 2.2, post=False)
    if a.detail:
        # a woodpile along one side
        for i in range(6):
            for j in range(3 - i % 2):
                a.cyl(0.13, 0.13, 1.4, (w / 2 + 0.45, -d * 0.3 + j * 0.3 + (i % 2) * 0.15, 0.15 + i * 0.24), mix(0x9a6a3c, 0xc8955a, (i * 3 + j) % 4 / 4), segs=7, rot=(math.pi / 2, 0, 0))
    a.collider_box(0, 0, w / 2 + 0.3, d / 2 + 0.3, top + rise)
    return {'w': w, 'd': d, 'h': top + rise}


# -------------------------------------------------------------------------------------------------
# Stilt: bog houses on posts with plank walls and thatch
# -------------------------------------------------------------------------------------------------
def stilt_house(a, variant, large=False):
    w, d = (8.0, 6.4) if large else (5.8, 5.0)
    lift = 1.9
    wallh = 2.7
    top = lift + 0.3 + wallh
    rise = 2.3
    plank = [0x7d6a55, 0x6f6252, 0x8a7a62][variant % 3]
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            a.cyl(0.16, 0.14, lift + 0.4, (sx * (w / 2 - 0.4), sy * (d / 2 - 0.4), -0.4), 0x5a4a38, segs=8)
    a.box((w + 1.2, d + 1.8, 0.3), (0, -0.3, lift + 0.15), 0x7a6a50, bevel=0.03)
    if a.detail:
        for i in range(int((w + 1.2) / 0.45)):
            a.box((0.4, d + 1.8, 0.06), (-(w + 1.2) / 2 + 0.225 + i * 0.45, -0.3, lift + 0.32), shade(0x7a6a50, 0.85 + (i % 3) * 0.08), bevel=0, grid=0)
    a.box((w, d, wallh), (0, 0, lift + 0.3 + wallh / 2), plank, bevel=0.03)
    if a.detail:
        for i in range(int(wallh / 0.35)):
            a.box((w + 0.08, d + 0.08, 0.05), (0, 0, lift + 0.5 + i * 0.35), shade(plank, 0.8), bevel=0, grid=0)
    gable_walls(a, w, d, top, rise, plank)
    gable_roof(a, w, d, top, rise, 0.75, 0xc9a35e, 'thatch')
    a.push((0, 0, lift + 0.3))
    door(a, 0, -d / 2 - 0.05, 0x5c4a36, 0x4a3a2a, w=1.05, h=2.0)
    for x in (-w * 0.3, w * 0.3):
        window(a, x, 1.4, -d / 2 - 0.05, 0x4a3a2a, None, w=0.7, h=0.75)
    a.pop()
    # stair down from the deck
    for i in range(7):
        a.box((1.3, 0.34, 0.12), (w / 2 - 0.2, -d / 2 - 1.15 - i * 0.32, lift - i * (lift / 7)), 0x7a6a50, bevel=0.02, grid=0)
    for s in (-1, 1):
        a.cyl(0.07, 0.07, 1.1, (s * (w / 2 + 0.6), -d / 2 - 1.1, lift + 0.3), 0x5a4a38, segs=6)
    lantern(a, -w / 2 - 0.45, -d / 2 - 1.1, lift + 1.4, post=False)
    a.cyl(0.07, 0.07, 1.4, (-w / 2 - 0.45, -d / 2 - 1.1, lift), 0x5a4a38, segs=6)
    a.collider_box(0, -0.3, w / 2 + 0.6, d / 2 + 0.9, lift + 0.4)
    a.anchors['deck'] = [0, round(-d / 2 - 0.9, 3), round(lift + 0.3, 3)]
    return {'w': w + 1.2, 'd': d + 1.8, 'h': top + rise}


# -------------------------------------------------------------------------------------------------
# Stone: grey stone cottages with slate roofs (heath, mountains, university town)
# -------------------------------------------------------------------------------------------------
def stone_house(a, variant, large=False, wall=None, roof=None, snow=False):
    w, d = (9.0, 7.0) if large else (6.4, 5.6)
    wallh = 5.2 if large else 3.2
    top = wallh + 0.3
    rise = 2.8 if large else 2.3
    wc = wall if wall is not None else pick(a, WALLS['stone'], variant)
    rc = roof if roof is not None else pick(a, ROOFS['stone'], variant)
    a.box((w, d, top), (0, 0, top / 2), wc, bevel=0.06)
    if a.detail:
        # quoins at the corners and a plinth course
        for sx in (-1, 1):
            for sy in (-1, 1):
                for i in range(int(top / 0.55)):
                    big = i % 2 == 0
                    a.box((0.7 if big else 0.45, 0.45 if big else 0.7, 0.5), (sx * (w / 2 - (0.3 if big else 0.18)), sy * (d / 2 - (0.18 if big else 0.3)), 0.27 + i * 0.55), shade(wc, 1.12), bevel=0.05, grid=0)
        a.box((w + 0.2, d + 0.2, 0.5), (0, 0, 0.2), shade(wc, 0.85), bevel=0.06)
    gable_walls(a, w, d, top, rise, wc)
    gable_roof(a, w, d, top, rise, 0.4, rc, 'snow' if snow else 'slate')
    dx = w * 0.2 * (1 if variant % 2 else -1)
    door(a, dx, -d / 2 - 0.08, [0x6a3a2a, 0x2f4b5a, 0x4f5f2f][variant % 3], 0x4a4440, step=0.25)
    for x in (-w * 0.3, w * 0.3):
        if abs(x - dx) < 1.2:
            continue
        window(a, x, 1.6, -d / 2 - 0.08, 0xe8e2d4, None, flowers=variant % 2 == 0)
    if large:
        for x in (-w * 0.3, 0.0, w * 0.3):
            window(a, x, 3.9, -d / 2 - 0.08, 0xe8e2d4, None)
    chimney(a, -dx, d * 0.2, top + 0.6, rise + 0.5, shade(wc, 0.9))
    lantern(a, dx + 0.95, -d / 2 - 0.3, 2.3, post=False)
    a.collider_box(0, 0, w / 2 + 0.15, d / 2 + 0.15, top + rise)
    return {'w': w, 'd': d, 'h': top + rise}


def ice_house(a, variant, large=False):
    info = stone_house(a, variant, large, wall=pick(a, WALLS['ice'], variant), roof=pick(a, ROOFS['ice'], variant), snow=True)
    if a.detail:
        w, d = info['w'], info['d']
        top = (5.2 if large else 3.2) + 0.3
        for i in range(int(w / 0.5)):
            x = -w / 2 + 0.3 + i * 0.5
            L = 0.2 + a.rnd.random() * 0.45
            for yy in (-d / 2 - 0.5, d / 2 + 0.5):
                a.cyl(0.05, 0.0, L, (x, yy, top - L), 0xdff4ff, segs=4, rot=(math.pi, 0, 0))
        # a snowbank against the front wall
        a.sphere(1.0, (-w * 0.32, -d / 2 - 0.5, 0.0), 0xf3f7fd, segs=10, scale=(1.6, 0.8, 0.45))
    return info


# -------------------------------------------------------------------------------------------------
# Adobe: clay houses with flat roofs, beams and awnings (badlands)
# -------------------------------------------------------------------------------------------------
def adobe_house(a, variant, large=False):
    w, d = (9.0, 7.5) if large else (6.4, 5.6)
    h1 = 3.4
    wc = pick(a, WALLS['adobe'], variant)
    a.box((w, d, h1), (0, 0, h1 / 2), wc, bevel=0.18, segs=2)
    a.box((w + 0.1, d + 0.1, 0.5), (0, 0, h1 + 0.2), shade(wc, 1.04), bevel=0.14, segs=2)
    top = h1 + 0.45
    if large:
        a.box((w * 0.55, d * 0.6, 2.6), (w * 0.18, d * 0.12, top + 1.3), wc, bevel=0.16, segs=2)
        a.box((w * 0.55 + 0.1, d * 0.6 + 0.1, 0.4), (w * 0.18, d * 0.12, top + 2.6), shade(wc, 1.04), bevel=0.12)
        window(a, w * 0.18, top + 1.4, -d * 0.18 - 0.02, 0x6a4a2a, None, w=0.7, h=0.8)
    if a.detail:
        for i in range(int(w / 0.9)):
            a.cyl(0.1, 0.1, 0.6, (-w / 2 + 0.5 + i * 0.9, -d / 2 + 0.05, h1 - 0.25), 0x6a4a2a, segs=6, rot=(math.pi / 2, 0, 0))
    door(a, -w * 0.2, -d / 2 - 0.02, 0x6a4a2a, 0x4a3420, w=1.1, h=2.1)
    window(a, w * 0.22, 1.7, -d / 2 - 0.02, 0x6a4a2a, None, w=0.8, h=0.8)
    cloth = [0xd9553f, 0x3d8fc4, 0xf0c43a, 0x4fa86a][variant % 4]
    if a.detail:
        # striped cloth awning on poles
        for s in (-1, 1):
            a.cyl(0.06, 0.06, 2.4, (-w * 0.2 + s * 1.3, -d / 2 - 1.6, 0), 0x6a4a2a, segs=6)
        for i in range(6):
            a.box((2.8 / 6, 1.8, 0.05), (-w * 0.2 - 1.4 + (i + 0.5) * 2.8 / 6, -d / 2 - 0.8, 2.45), cloth if i % 2 == 0 else 0xf4ecdc, rot=(-0.25, 0, 0), bevel=0, grid=0)
        for i in range(3):
            a.cyl(0.25, 0.32, 0.6, (w * 0.3 + i * 0.6, -d / 2 - 0.5, 0), [0xb8642c, 0xc87a3c, 0xa8542c][i], segs=10)
    lantern(a, -w * 0.2 + 0.95, -d / 2 - 0.25, 2.2, post=False)
    a.collider_box(0, 0, w / 2 + 0.1, d / 2 + 0.1, top)
    return {'w': w, 'd': d, 'h': top + (3.0 if large else 0)}


# -------------------------------------------------------------------------------------------------
# Basalt: dark stone forge-houses with copper roofs and glowing vents (highlands, Jernhamn)
# -------------------------------------------------------------------------------------------------
def basalt_house(a, variant, large=False):
    w, d = (9.6, 7.2) if large else (6.8, 5.8)
    wallh = 4.6 if large else 3.2
    wc = pick(a, WALLS['basalt'], variant)
    rc = pick(a, ROOFS['basalt'], variant)
    a.box((w, d, wallh), (0, 0, wallh / 2), wc, bevel=0.06)
    if a.detail:
        for i in range(int(wallh / 0.6)):
            a.box((w + 0.06, d + 0.06, 0.06), (0, 0, 0.5 + i * 0.6), shade(wc, 0.75), bevel=0, grid=0)
        for sx in (-1, 1):
            a.box((0.5, d + 0.3, wallh + 0.2), (sx * (w / 2 + 0.05), 0, (wallh + 0.2) / 2), shade(wc, 0.85), bevel=0.06)
    gable_walls(a, w, d, wallh, 2.2, wc)
    gable_roof(a, w, d, wallh, 2.2, 0.4, rc, 'slate')
    door(a, 0, -d / 2 - 0.08, 0x3a2a22, 0x2a2420, w=1.4, h=2.3)
    for x in (-w * 0.32, w * 0.32):
        window(a, x, 1.7, -d / 2 - 0.08, 0x2a2420, None, w=0.9, h=0.9)
    chimney(a, w * 0.3, 0, wallh + 0.4, 3.4, shade(wc, 1.1))
    if a.detail:
        a.box((1.2, 0.2, 0.5), (-w * 0.32, -d / 2 - 0.1, 0.5), 0xff8a2a, glow=True, bevel=0, grid=0)
    lantern(a, 1.1, -d / 2 - 0.3, 2.4, post=False)
    a.collider_box(0, 0, w / 2 + 0.3, d / 2 + 0.15, wallh + 2.2)
    return {'w': w + 0.6, 'd': d, 'h': wallh + 2.2}


# -------------------------------------------------------------------------------------------------
# Harbour: tall, narrow, brightly painted plank gables with hoist beams (Bryggen-style)
# -------------------------------------------------------------------------------------------------
def harbour_house(a, variant, large=False):
    w, d = (5.6, 9.0) if large else (4.8, 6.6)
    wallh = 6.2 if large else 4.8
    rise = 3.2
    wc = pick(a, WALLS['harbour'], variant)
    rc = pick(a, ROOFS['harbour'], variant)
    a.box((w + 0.3, d + 0.3, 0.6), (0, 0, 0.2), 0x8e8478, bevel=0.05)
    a.box((w, d, wallh), (0, 0, 0.5 + wallh / 2), wc, bevel=0.03)
    if a.detail:
        for i in range(int(w / 0.3) + 1):
            for yy in (-d / 2 - 0.02, d / 2 + 0.02):
                a.box((0.05, 0.05, wallh), (-w / 2 + i * 0.3, yy, 0.5 + wallh / 2), shade(wc, 0.82), bevel=0, grid=0)
    # The gable faces the street (front, -Y), as the roof builder's ridge runs front to back.
    gable_walls(a, w, d, 0.5 + wallh, rise, wc)
    gable_roof(a, w, d, 0.5 + wallh, rise, 0.35, rc, 'tile')
    door(a, 0, -d / 2 - 0.05, 0xf4ecdc if wc != 0xf4ecdc else 0x3d6fc4, 0xf4ecdc, h=2.2, step=0.4)
    window(a, 0, 3.4, -d / 2 - 0.05, 0xf4ecdc, None, w=1.0, h=1.1)
    if large:
        window(a, 0, 5.3, -d / 2 - 0.05, 0xf4ecdc, None, w=1.0, h=1.1)
    for z in ((2.0, 4.0) if not large else (2.0, 4.0, 5.8)):
        for yy in (-d * 0.25, d * 0.25):
            for side in (1, -1):
                a.push(rot_z=side * math.pi / 2)
                window(a, yy * side, z, -w / 2 - 0.05, 0xf4ecdc, None, w=0.8, h=0.9)
                a.pop()
    if a.detail:
        # hoist beam with pulley high on the gable
        a.box((0.2, 1.4, 0.2), (0, -d / 2 - 0.6, 0.5 + wallh + rise * 0.55), WOOD_DARK, bevel=0.02, grid=0)
        a.cyl(0.18, 0.18, 0.12, (0, -d / 2 - 1.25, 0.5 + wallh + rise * 0.45), 0x5c4a36, segs=8, rot=(0, math.pi / 2, 0))
        a.cyl(0.02, 0.02, wallh, (0, -d / 2 - 1.3, 0.6), 0xd8c8a0, segs=4)
    lantern(a, 0.95, -d / 2 - 0.25, 2.6, post=False)
    a.collider_box(0, 0, w / 2 + 0.15, d / 2 + 0.15, 0.5 + wallh + rise)
    return {'w': w, 'd': d, 'h': 0.5 + wallh + rise}


def castle_house(a, variant, large=False):
    info = stone_house(a, variant, large, wall=pick(a, WALLS['castle'], variant), roof=pick(a, ROOFS['castle'], variant))
    if a.detail and variant % 2 == 0:
        w, d = info['w'], info['d']
        # a little round corner turret with a cone roof
        r = 1.0
        h = info['h'] + 0.8
        a.cyl(r, r, h, (w / 2, -d / 2, 0), shade(pick(a, WALLS['castle'], variant), 0.96), segs=12)
        a.cyl(r + 0.25, 0.05, 2.6, (w / 2, -d / 2, h), pick(a, ROOFS['castle'], variant), segs=12)
        window(a, w / 2, h - 1.2, -d / 2 - r + 0.02, 0xe8e2d4, None, w=0.5, h=0.8)
    return info


HOUSES = {
    'meadow': meadow_house, 'timber': timber_house, 'stilt': stilt_house, 'stone': stone_house, 'ice': ice_house,
    'adobe': adobe_house, 'basalt': basalt_house, 'harbour': harbour_house, 'castle': castle_house,
}
