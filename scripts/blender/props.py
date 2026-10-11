"""
Small props for towns and the wilds: market stalls, fences, gates, bridges, docks, boats, carts,
tents and the like, plus solid biome trees (snowy pines, dead trees, cacti, glowing mushrooms).
"""
import math
from kit import fence_run, lantern, mix, shade

WOOD = 0x8b5a33
WOOD_DARK = 0x5c3a1f


def stall(colour):
    def build(a):
        for sx in (-1, 1):
            for sy in (-1, 1):
                a.box((0.12, 0.12, 2.4 if sy < 0 else 2.0), (sx * 1.3, sy * 0.8, 1.2 if sy < 0 else 1.0), WOOD_DARK, bevel=0.02, grid=0)
        a.box((2.8, 1.8, 0.12), (0, 0, 0.9), 0x9a6a3c, bevel=0.03, grid=0)
        a.box((2.7, 1.7, 0.75), (0, 0, 0.45), shade(0x9a6a3c, 0.8), bevel=0.03, grid=0)
        for i in range(6):
            a.box((3.2 / 6, 2.2, 0.05), (-1.6 + (i + 0.5) * 3.2 / 6, 0.0, 2.2), colour if i % 2 == 0 else 0xf4ecdc, rot=(0.18, 0, 0), bevel=0, grid=0)
        goods = [0xd9473a, 0xffd23a, 0x6fae3c, 0xf08a3a, 0x8a5ad8]
        for k in range(10):
            x = -1.1 + (k % 5) * 0.55
            y = -0.35 + (k // 5) * 0.55
            a.sphere(0.17, (x, y, 1.08), goods[(k * 3) % 5], segs=6)
        a.box((0.9, 0.5, 0.45), (0.9, -1.25, 0.22), 0xb07a46, bevel=0.03, grid=0)
        a.anchor('counter', 0, -1.3)
        a.collider_box(0, 0, 1.45, 0.95, 1.0)
    return build


def lamp_post(a):
    a.cyl(0.18, 0.12, 0.3, (0, 0, 0), 0x3b3530, segs=8)
    lantern(a, 0, 0, 3.0)
    a.collider_circle(0, 0, 0.2, 3.4)


def bench(a):
    a.box((2.0, 0.5, 0.1), (0, 0, 0.48), WOOD, bevel=0.02, grid=0)
    a.box((2.0, 0.08, 0.45), (0, 0.24, 0.8), WOOD, rot=(-0.15, 0, 0), bevel=0.02, grid=0)
    for s in (-1, 1):
        a.box((0.1, 0.5, 0.48), (s * 0.85, 0, 0.24), WOOD_DARK, bevel=0.01, grid=0)
    a.collider_box(0, 0, 1.0, 0.3, 0.9)


def barrels(a):
    for i, (x, y) in enumerate([(0, 0), (0.75, 0.2), (0.3, 0.7)]):
        a.cyl(0.33, 0.33, 0.85, (x, y, 0), mix(0x8a5a33, 0xa8703f, i / 3), segs=10)
        for z in (0.15, 0.7):
            a.cyl(0.345, 0.345, 0.06, (x, y, z), 0x4a4440, segs=10)
    a.cyl(0.33, 0.33, 0.85, (0.35, 0.3, 0.85), 0x9a6a3c, segs=10)
    a.collider_circle(0.35, 0.3, 0.75, 1.7)


def crates(a):
    for i, (x, y, z, s) in enumerate([(0, 0, 0, 0.8), (0.85, 0.1, 0, 0.7), (0.3, 0.2, 0.8, 0.6)]):
        a.box((s, s, s), (x, y, z + s / 2), mix(0xb07a46, 0xc8955a, i / 3), bevel=0.04, grid=0)
        if a.detail:
            a.box((s * 1.01, s * 0.1, s * 1.01), (x, y - s * 0.46, z + s / 2), shade(0xb07a46, 0.8), rot=(0, 0.78, 0), bevel=0, grid=0)
    a.collider_box(0.4, 0.05, 0.85, 0.5, 1.4)


def cart(a):
    a.box((2.4, 1.4, 0.15), (0, 0, 0.75), WOOD, bevel=0.03, grid=0)
    for s in (-1, 1):
        a.box((2.4, 0.08, 0.5), (0, s * 0.7, 1.05), WOOD_DARK, bevel=0.02, grid=0)
        a.cyl(0.55, 0.55, 0.12, (-0.4, s * 0.8, 0.55), 0x6a4a2a, segs=12, rot=(math.pi / 2, 0, 0))
        a.cyl(0.12, 0.12, 0.16, (-0.4, s * 0.86, 0.55), 0x3a3a3a, segs=8, rot=(math.pi / 2, 0, 0))
    a.box((1.8, 0.08, 0.08), (2.0, 0.35, 0.65), WOOD_DARK, bevel=0, grid=0)
    a.box((1.8, 0.08, 0.08), (2.0, -0.35, 0.65), WOOD_DARK, bevel=0, grid=0)
    for k in range(4):
        a.sphere(0.32, (-0.6 + k * 0.4, (k % 2 - 0.5) * 0.4, 1.05), 0xd8b870, segs=6, scale=(1.3, 1, 0.8))
    a.collider_box(0.2, 0, 1.6, 0.85, 1.4)


def hay(a):
    a.cyl(0.85, 0.85, 1.3, (0, 0, 0), 0xd8b870, segs=12, rot=(math.pi / 2, 0, 0))
    a.cyl(0.86, 0.86, 0.08, (0, -0.4, 0.85), 0xb8984a, segs=12, rot=(math.pi / 2, 0, 0))
    a.collider_circle(0, 0, 0.9, 1.7)


def planter(a):
    a.box((1.6, 0.6, 0.5), (0, 0, 0.25), 0x9e978b, bevel=0.05, grid=0)
    for k in range(7):
        a.sphere(0.16, (-0.6 + k * 0.2, 0, 0.6), 0x4f8f2a, segs=6, scale=(1.3, 1.3, 1))
        a.sphere(0.1, (-0.6 + k * 0.2, -0.05, 0.72), [0xff6f9a, 0xffd23a, 0xff7a4a, 0xa77bff, 0xfff4e0][k % 5], segs=6)
    a.collider_box(0, 0, 0.8, 0.3, 0.6)


def beehives(a):
    for i in range(3):
        x = (i - 1) * 1.2
        a.box((0.8, 0.8, 0.12), (x, 0, 0.35), WOOD_DARK, bevel=0.02, grid=0)
        for k in range(3):
            a.box((0.72, 0.72, 0.28), (x, 0, 0.55 + k * 0.3), mix(0xf2e2a0, 0xe8c870, k / 3), bevel=0.03, grid=0)
        a.box((0.86, 0.86, 0.1), (x, 0, 1.45), 0x8a5a3a, bevel=0.03, grid=0)
    a.collider_box(0, 0, 1.8, 0.45, 1.5)


def tent(a):
    a.prism(3.0, 3.6, 2.2, (0, 0, 0), 0xc8473a)
    a.prism(1.1, 0.06, 1.6, (0, -1.83, 0), 0x3a2a22)
    for y in (-1.9, 1.9):
        a.cyl(0.05, 0.05, 2.4, (0, y, 0), WOOD_DARK, segs=6)
    a.collider_box(0, 0, 1.5, 1.8, 2.2)


def campfire(a):
    for k in range(8):
        ang = k / 8 * math.pi * 2
        a.sphere(0.22, (math.cos(ang) * 0.75, math.sin(ang) * 0.75, 0.08), 0x8a8478, segs=6, scale=(1.2, 1, 0.7))
    for k in range(4):
        a.cyl(0.08, 0.08, 1.1, (0, 0, 0.1), 0x5c3a1f, segs=6, rot=(1.2, 0, k * math.pi / 2))
    a.cyl(0.35, 0.0, 0.9, (0, 0, 0.1), 0xffa23a, segs=6, glow=True)
    a.lamp(0, 0, 0.6)
    a.collider_circle(0, 0, 0.9, 0.4)


def gate_arch(a):
    for s in (-1, 1):
        a.box((0.6, 0.6, 4.2), (s * 2.6, 0, 2.1), WOOD_DARK, bevel=0.05)
        a.cyl(0.4, 0.0, 0.6, (s * 2.6, 0, 4.2), WOOD_DARK, segs=4, rot=(0, 0, math.pi / 4))
    a.box((6.4, 0.5, 0.6), (0, 0, 3.7), WOOD, bevel=0.05)
    a.box((3.2, 0.12, 0.9), (0, -0.3, 3.2), 0xb07a46, bevel=0.03, grid=0)
    for s in (-1, 1):
        lantern(a, s * 2.6, -0.45, 3.0, post=False)
    a.collider_box(-2.6, 0, 0.35, 0.35, 4.2)
    a.collider_box(2.6, 0, 0.35, 0.35, 4.2)


def fence(kind, colour, length, h):
    def build(a):
        fence_run(a, -length / 2, 0, length / 2, 0, colour, h=h, kind=kind)
        a.collider_box(0, 0, length / 2, 0.35 if kind != 'stone' else 0.4, h + 0.2)
    return build


def signpost(a):
    a.cyl(0.1, 0.09, 2.6, (0, 0, 0), WOOD_DARK, segs=8)
    for i, ang in enumerate((0.4, -0.7)):
        a.push((0, 0, 2.2 - i * 0.45), rot_z=ang)
        a.box((1.3, 0.08, 0.32), (0.55, 0, 0), 0xb07a46, bevel=0.03, grid=0)
        a.cyl(0.16, 0.0, 0.3, (1.3, 0, 0), 0xb07a46, segs=3, rot=(0, math.pi / 2, 0))
        a.pop()
    a.collider_circle(0, 0, 0.15, 2.6)


def dock(a):
    L = 12.0
    for i in range(int(L / 0.5)):
        a.box((3.0, 0.46, 0.12), (0, -i * 0.5, 0.9), mix(0x9a7a50, 0x7a6a50, (i * 7 % 5) / 5), bevel=0.02, grid=0)
    for k in range(5):
        for s in (-1, 1):
            a.cyl(0.14, 0.14, 4.0, (s * 1.4, -k * 3.0, -3.0), 0x5a4a38, segs=8)
    for k in range(3):
        a.cyl(0.2, 0.18, 0.5, (1.35, -1.5 - k * 4.0, 0.95), 0x5a4a38, segs=8)
    a.anchor('end', 0, -L + 0.5, 0.96)


def bridge(a):
    """A timber road bridge, 24 m long and 4.4 m wide, its deck at z = 0.9 at the ends rising to 1.6."""
    L, W = 24.0, 4.4
    n = 48
    for i in range(n):
        t = (i + 0.5) / n
        x = -L / 2 + t * L
        z = 0.9 + math.sin(t * math.pi) * 0.7
        a.box((L / n * 1.02, W, 0.14), (x, 0, z), mix(0x9a7a50, 0x8a6a46, (i * 7 % 5) / 5), bevel=0.01, grid=0)
    for s in (-1, 1):
        for k in range(9):
            t = k / 8
            x = -L / 2 + t * L
            z = 0.9 + math.sin(t * math.pi) * 0.7
            a.box((0.18, 0.18, 1.1), (x, s * (W / 2 - 0.1), z + 0.55), WOOD_DARK, bevel=0.02, grid=0)
            if k < 8:
                t2 = (k + 0.5) / 8
                z2 = 0.9 + math.sin(t2 * math.pi) * 0.7
                a.box((L / 8, 0.1, 0.12), (-L / 2 + t2 * L, s * (W / 2 - 0.1), z2 + 1.0), WOOD, bevel=0.02, grid=0)
        for k in range(5):
            x = -L / 2 + 2 + k * (L - 4) / 4
            a.cyl(0.22, 0.22, 6.0, (x, s * (W / 2 - 0.4), -5.0), 0x5a4a38, segs=8)
    a.anchor('deck', 0, 0, 0.9)


def rowboat(a):
    a.sphere(1.0, (0, 0, 0.35), 0x8a5a3a, segs=10, scale=(0.75, 2.0, 0.45))
    a.box((1.2, 3.2, 0.1), (0, 0, 0.55), 0x6a4a2a, bevel=0.02, grid=0)
    a.box((1.3, 0.25, 0.08), (0, 0.3, 0.62), 0x9a6a3c, bevel=0.01, grid=0)


# ---- solid biome trees (the outer vegetation's extra kinds) --------------------------------------
def snowpine(a):
    a.cyl(0.25, 0.18, 1.6, (0, 0, 0), 0x5a3a24, segs=7)
    for i, (r, z, h) in enumerate([(2.2, 1.0, 2.6), (1.8, 2.6, 2.4), (1.35, 4.1, 2.2), (0.9, 5.5, 2.0)]):
        a.cyl(r, 0.1, h, (0, 0, z), shade(0x2b5432, 0.9 + i * 0.05), segs=9)
        a.cyl(r * 0.92, 0.0, h * 0.45, (0, 0, z + h * 0.42), 0xeef4fa, segs=9)
        a.cyl(r * 1.02, r * 0.88, 0.25, (0, 0, z + 0.05), 0xeef4fa, segs=9)


def deadtree(a):
    a.cyl(0.35, 0.18, 4.8, (0, 0, 0), 0x6a5a4c, segs=7)
    for k, (ang, z, L, tilt) in enumerate([(0.3, 2.6, 2.2, 0.8), (2.4, 3.4, 1.8, 0.7), (4.3, 2.0, 1.6, 0.9), (1.4, 4.2, 1.2, 0.5)]):
        a.cyl(0.13, 0.04, L, (0, 0, z), 0x6a5a4c, segs=5, rot=(tilt, 0, ang))
    a.cyl(0.5, 0.35, 0.4, (0, 0, 0), 0x5a4a3c, segs=7)


def cactus(a):
    a.cyl(0.45, 0.38, 3.4, (0, 0, 0), 0x4f8a3a, segs=10)
    a.sphere(0.38, (0, 0, 3.4), 0x4f8a3a, segs=8, scale=(1, 1, 0.6))
    for s, z, h in ((1, 1.3, 1.3), (-1, 1.8, 1.0)):
        a.cyl(0.24, 0.24, 0.8, (s * 0.35, 0, z), 0x4f8a3a, segs=8, rot=(0, s * math.pi / 2, 0))
        a.cyl(0.26, 0.22, h, (s * 1.1, 0, z), 0x4f8a3a, segs=8)
        a.sphere(0.22, (s * 1.1, 0, z + h), 0x4f8a3a, segs=6, scale=(1, 1, 0.6))
    a.sphere(0.12, (0, 0, 3.62), 0xff6f9a, segs=6)


def glowshroom(a):
    a.cyl(0.35, 0.28, 2.6, (0, 0, 0), 0xe8e0c8, segs=10)
    a.sphere(1.6, (0, 0, 2.5), 0x5fc8d8, segs=12, scale=(1, 1, 0.45), glow=True)
    for k in range(6):
        ang = k / 6 * math.pi * 2
        a.sphere(0.16, (math.cos(ang) * 1.0, math.sin(ang) * 1.0, 3.05), 0xf4fbff, segs=6)
    a.lamp(0, 0, 2.6)


PROPS = {
    'stall_red': ('furniture', stall(0xd9473a)),
    'stall_blue': ('furniture', stall(0x3d6fc4)),
    'stall_green': ('furniture', stall(0x4f8f3a)),
    'lamp_post': ('furniture', lamp_post),
    'bench': ('furniture', bench),
    'barrels': ('furniture', barrels),
    'crates': ('furniture', crates),
    'cart': ('furniture', cart),
    'hay': ('furniture', hay),
    'planter': ('furniture', planter),
    'beehives': ('furniture', beehives),
    'tent': ('furniture', tent),
    'campfire': ('furniture', campfire),
    'gate_arch': ('furniture', gate_arch),
    'signpost': ('furniture', signpost),
    'fence_picket': ('fences', fence('picket', 0xf4ecdc, 4.0, 1.0)),
    'fence_palisade': ('fences', fence('palisade', 0x7a5a3a, 6.0, 2.6)),
    'fence_stone': ('fences', fence('stone', 0xa7a39a, 6.0, 1.4)),
    'fence_rail': ('fences', fence('rail', WOOD_DARK, 6.0, 1.1)),
    'dock': ('water', dock),
    'bridge': ('water', bridge),
    'rowboat': ('water', rowboat),
    'tree_snowpine': ('trees', snowpine),
    'tree_dead': ('trees', deadtree),
    'tree_cactus': ('trees', cactus),
    'tree_glowshroom': ('trees', glowshroom),
}
