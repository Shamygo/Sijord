"""
Sijord's Blender modelling kit: small helpers that build stylised, chunky props out of bevelled
primitives, paint them with per-corner vertex colours, bake ambient occlusion into those colours
and export Draco-compressed GLBs for the game.

Conventions (Blender side): Z up, metres, the front of every building faces -Y (the glTF exporter
turns that into +Z, the game's "front"), the footprint is centred on the origin and the ground is
z = 0. Colours are sRGB hex like the game's palette; the exporter writes them as linear COLOR_0.

Every asset is two meshes: the solid part (vertex colours, matte) and an optional glow part
(lantern glass, windows that light up at night), which the game draws with its glow material.
"""
import bpy
import bmesh
import math
import random
from mathutils import Matrix, Vector, Euler


def srgb(h):
    return ((h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0, 1.0)


def shade(h, k):
    """Multiply an sRGB hex colour by k (clamped), for darker / lighter variants."""
    r, g, b = (h >> 16 & 255), (h >> 8 & 255), (h & 255)
    c = lambda v: max(0, min(255, int(round(v * k))))
    return (c(r) << 16) | (c(g) << 8) | c(b)


def mix(h1, h2, t):
    a = [(h1 >> s & 255) for s in (16, 8, 0)]
    b = [(h2 >> s & 255) for s in (16, 8, 0)]
    c = [int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


class Part:
    """A bmesh being built, with a byte colour layer on its loops."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')

    def free(self):
        self.bm.free()


class Asset:
    """Accumulates coloured primitives into a solid part and a glow part."""

    def __init__(self, name, detail=True):
        self.name = name
        self.detail = detail
        self.solid = Part()
        self.glow = Part()
        # Local frame stack (for building sub-assemblies in their own coordinates).
        self.frames = [Matrix.Identity(4)]
        # Metadata the game reads: collision boxes, doors, lamps, anchors.
        self.colliders = []
        self.doors = []
        self.lamps = []
        self.anchors = {}
        self.rnd = random.Random(hash(name) & 0xffffffff)

    # ---- frames ---------------------------------------------------------------------------------
    def push(self, loc=(0, 0, 0), rot_z=0.0, rot=(0, 0, 0)):
        m = Matrix.Translation(Vector(loc)) @ Euler((rot[0], rot[1], rot[2] + rot_z), 'XYZ').to_matrix().to_4x4()
        self.frames.append(self.frames[-1] @ m)

    def pop(self):
        self.frames.pop()

    @property
    def M(self):
        return self.frames[-1]

    # ---- low level --------------------------------------------------------------------------------
    def _append(self, part, src_bm, color, matrix):
        """Copy src_bm's geometry into part with `matrix` applied and every corner coloured."""
        bm = part.bm
        vmap = {}
        for v in src_bm.verts:
            vmap[v] = bm.verts.new(matrix @ v.co)
        bm.verts.ensure_lookup_table()
        rgba = srgb(color) if isinstance(color, int) else color
        for f in src_bm.faces:
            try:
                nf = bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.smooth = False
            for loop in nf.loops:
                loop[part.col] = rgba if not callable(rgba) else rgba(loop.vert.co)
        src_bm.free()

    def add(self, src_bm, color, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), glow=False):
        m = self.M @ Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal(Vector((*scale, 1)))
        self._append(self.glow if glow else self.solid, src_bm, color, m)

    # ---- primitives -----------------------------------------------------------------------------
    def box(self, size, at, color, rot=(0, 0, 0), bevel=0.03, segs=1, glow=False, grid=None):
        """A bevelled box of `size` (x, y, z) centred at `at`. `grid` subdivides big faces (m)."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        g = grid if grid is not None else (1.6 if self.detail else 0)
        if g and max(size) > g * 1.8:
            cuts = int(min(4, max(size) / g))
            if cuts > 0:
                bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
        if bevel > 0 and self.detail:
            bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary or len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.5],
                            offset=min(bevel, min(size) * 0.3), segments=segs, affect='EDGES', profile=0.5)
        self.add(bm, color, at, rot, glow=glow)

    def cyl(self, r1, r2, h, at, color, segs=10, rot=(0, 0, 0), glow=False, cap=True):
        """A cylinder / cone of height h standing on `at` (its base centre)."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs if self.detail else max(5, segs // 2),
                              radius1=r1, radius2=r2, depth=h)
        bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
        self.add(bm, color, at, rot, glow=glow)

    def sphere(self, r, at, color, segs=8, scale=(1, 1, 1), glow=False):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs if self.detail else 6, v_segments=max(4, segs // 2), radius=r)
        self.add(bm, color, at, scale=scale, glow=glow)

    def prism(self, w, d, h, at, color, rot=(0, 0, 0)):
        """A triangular prism (gable end): width w along x, depth d along y, apex height h."""
        bm = bmesh.new()
        p = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (0, -d / 2, h), (-w / 2, d / 2, 0), (w / 2, d / 2, 0), (0, d / 2, h)]
        vs = [bm.verts.new(v) for v in p]
        for f in [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]:
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.add(bm, color, at, rot)

    def poly(self, pts, z0, z1, color, at=(0, 0, 0)):
        """An extruded polygon (pts in xy, counter-clockwise) from z0 to z1."""
        bm = bmesh.new()
        bot = [bm.verts.new((x, y, z0)) for x, y in pts]
        top = [bm.verts.new((x, y, z1)) for x, y in pts]
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([bot[i], bot[j], top[j], top[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.add(bm, color, at)

    # ---- metadata ---------------------------------------------------------------------------------
    def collider_box(self, cx, cy, hw, hd, top):
        """A collision box in the current frame (only z rotation is respected)."""
        c = self.M @ Vector((cx, cy, 0))
        yaw = math.atan2(self.M[1][0], self.M[0][0])
        self.colliders.append({'x': round(c.x, 3), 'y': round(c.y, 3), 'hw': round(hw, 3), 'hd': round(hd, 3), 'yaw': round(yaw, 4), 'top': round(top, 2)})

    def collider_circle(self, cx, cy, r, top):
        c = self.M @ Vector((cx, cy, 0))
        self.colliders.append({'x': round(c.x, 3), 'y': round(c.y, 3), 'r': round(r, 3), 'top': round(top, 2)})

    def door(self, x, y, kind='door'):
        c = self.M @ Vector((x, y, 0))
        self.doors.append({'x': round(c.x, 3), 'y': round(c.y, 3), 'kind': kind})

    def lamp(self, x, y, z):
        c = self.M @ Vector((x, y, z))
        self.lamps.append([round(c.x, 3), round(c.y, 3), round(c.z, 3)])

    def anchor(self, name, x, y, z=0.0):
        c = self.M @ Vector((x, y, z))
        self.anchors[name] = [round(c.x, 3), round(c.y, 3), round(c.z, 3)]


# =================================================================================================
# Architectural pieces
# =================================================================================================

def gable_roof(a, w, d, top, rise, over, color, kind='tile', trim=None):
    """
    A gable roof over a w x d box whose walls end at z = top, ridge running along y.
    kind: 'tile' (rows of shingles), 'turf' (grass sod with tufts), 'thatch' (thick straw),
    'slate' (thin dark slabs), 'snow' (tile buried under a snow cap), 'plank'.
    """
    half = w / 2 + over
    slope_len = math.hypot(half, rise)
    ang = math.atan2(rise, half)
    depth = d + over * 2
    thick = 0.22 if kind in ('tile', 'slate', 'plank') else 0.42 if kind == 'turf' else 0.5
    base = shade(color, 0.85)
    for side in (1, -1):
        cx = side * half / 2
        cz = top + rise / 2
        a.box((slope_len, depth, thick), (cx, 0, cz + thick * 0.35), base, rot=(0, side * ang, 0), bevel=0.04)
        if not a.detail:
            continue
        if kind in ('tile', 'slate', 'snow'):
            rows = max(3, int(slope_len / (0.42 if kind != 'slate' else 0.34)))
            for r in range(rows):
                t = (r + 0.5) / rows
                x = side * (half - t * half)
                z = top + t * rise + thick * 0.75
                k = 0.88 + a.rnd.random() * 0.2
                a.box((slope_len / rows * 1.08, depth + 0.04, 0.09), (x - side * 0.01, 0, z), shade(color, k),
                      rot=(0, side * ang + (a.rnd.random() - 0.5) * 0.04, 0), bevel=0.02, grid=0)
        elif kind == 'turf':
            a.box((slope_len * 0.98, depth - 0.1, 0.18), (cx, 0, cz + thick * 0.95), 0x5f8f37, rot=(0, side * ang, 0), bevel=0.08)
            for _ in range(int(depth * 2.2)):
                t = a.rnd.random()
                y = (a.rnd.random() - 0.5) * (depth - 0.4)
                x = side * (half - t * half)
                z = top + t * rise + thick * 1.15
                a.cyl(0.12, 0.0, 0.32 + a.rnd.random() * 0.25, (x, y, z), mix(0x6f9f3e, 0x93b44e, a.rnd.random()), segs=5)
        elif kind == 'thatch':
            for r in range(4):
                t = (r + 0.5) / 4
                x = side * (half - t * half)
                z = top + t * rise + thick * 0.6
                a.box((slope_len / 4 * 1.15, depth + 0.1, 0.32), (x, 0, z), shade(color, 0.92 + r * 0.04), rot=(0, side * ang, 0), bevel=0.12, segs=2)
        if kind == 'snow':
            a.box((slope_len * 0.96, depth - 0.05, 0.3), (cx, 0, cz + thick + 0.2), 0xf3f7fd, rot=(0, side * ang, 0), bevel=0.12, segs=2)
    # ridge
    a.box((0.34, depth + 0.06, 0.3), (0, 0, top + rise + thick * 0.9), shade(color if kind != 'turf' else 0x6a4a2a, 0.7) if kind != 'snow' else 0xf3f7fd, bevel=0.06)
    if trim is not None and a.detail:
        # carved barge boards along the gable ends
        for yy in (-depth / 2 + 0.06, depth / 2 - 0.06):
            for side in (1, -1):
                a.box((slope_len, 0.1, 0.2), (side * half / 2, yy, top + rise / 2 + 0.05), trim, rot=(0, side * ang, 0), bevel=0.02)


def gable_walls(a, w, d, top, rise, color):
    """Triangular gable-end walls filling the roof ends."""
    for yy in (-d / 2 + 0.06, d / 2 - 0.06):
        a.prism(w, 0.12, rise, (0, yy, top), color)


def window(a, x, z, face_y, color_frame, color_shutter=None, flowers=False, w=0.9, h=1.0, glow=True, rot_z=0.0):
    """A framed window on a wall facing -y (face_y is the wall's outer y)."""
    a.push((x, face_y, z), rot_z=rot_z)
    a.box((w + 0.22, 0.14, h + 0.22), (0, -0.02, 0), color_frame, bevel=0.03, grid=0)
    a.box((w, 0.08, h), (0, -0.06, 0), 0xffd27a if glow else 0x9fd6f0, glow=glow, bevel=0, grid=0)
    if a.detail:
        a.box((0.07, 0.12, h), (0, -0.09, 0), color_frame, bevel=0.01, grid=0)
        a.box((w, 0.12, 0.07), (0, -0.09, 0), color_frame, bevel=0.01, grid=0)
        if color_shutter is not None:
            for s in (-1, 1):
                a.box((w * 0.5, 0.07, h + 0.1), (s * (w * 0.5 + 0.36), -0.08, 0), color_shutter, bevel=0.02, grid=0)
                a.box((w * 0.36, 0.05, 0.06), (s * (w * 0.5 + 0.36), -0.12, h * 0.22), shade(color_shutter, 0.75), bevel=0, grid=0)
                a.box((w * 0.36, 0.05, 0.06), (s * (w * 0.5 + 0.36), -0.12, -h * 0.22), shade(color_shutter, 0.75), bevel=0, grid=0)
        a.box((w + 0.32, 0.26, 0.08), (0, -0.14, -h / 2 - 0.12), shade(color_frame, 0.9), bevel=0.02, grid=0)
        if flowers:
            a.box((w + 0.2, 0.3, 0.24), (0, -0.25, -h / 2 - 0.3), 0x7a4a26, bevel=0.03, grid=0)
            for i in range(6):
                fx = (i / 5 - 0.5) * (w + 0.05)
                c = [0xff6f9a, 0xffd23a, 0xff7a4a, 0xa77bff, 0xfff4e0][a.rnd.randrange(5)]
                a.sphere(0.09, (fx, -0.27, -h / 2 - 0.12), 0x4f8f2a, segs=6, scale=(1.4, 1.2, 1))
                a.sphere(0.065, (fx + 0.03, -0.32, -h / 2 - 0.06), c, segs=6)
    a.pop()


def door(a, x, face_y, color, frame, w=1.15, h=2.15, step=0.0, rot_z=0.0):
    a.push((x, face_y, step), rot_z=rot_z)
    a.box((w + 0.35, 0.18, h + 0.2), (0, 0.0, h / 2 + 0.05), frame, bevel=0.03, grid=0)
    a.box((w, 0.12, h), (0, -0.07, h / 2), color, bevel=0.02, grid=0)
    if a.detail:
        for i in range(4):
            a.box((0.04, 0.05, h * 0.96), ((i - 1.5) * w / 4, -0.14, h / 2), shade(color, 0.8), bevel=0, grid=0)
        a.box((w * 0.9, 0.06, 0.12), (0, -0.15, h * 0.75), shade(color, 0.7), bevel=0.01, grid=0)
        a.box((w * 0.9, 0.06, 0.12), (0, -0.15, h * 0.25), shade(color, 0.7), bevel=0.01, grid=0)
        a.sphere(0.06, (w * 0.32, -0.18, h * 0.48), 0xc9a24a, segs=6)
    if step > 0:
        a.box((w + 0.8, 0.9, step), (0, -0.45, -step / 2), 0x9e978b, bevel=0.04)
    a.pop()
    a.door(x, face_y - 1.0)


def lantern(a, x, y, z, post=True):
    if post:
        a.cyl(0.07, 0.06, z, (x, y, 0), 0x3b3530, segs=8)
    a.box((0.34, 0.34, 0.06), (x, y, z), 0x2e2a26, bevel=0.01, grid=0)
    a.box((0.24, 0.24, 0.34), (x, y, z + 0.2), 0xffcf6a, glow=True, bevel=0, grid=0)
    if a.detail:
        for sx in (-1, 1):
            for sy in (-1, 1):
                a.box((0.04, 0.04, 0.36), (x + sx * 0.13, y + sy * 0.13, z + 0.2), 0x2e2a26, bevel=0, grid=0)
    a.cyl(0.24, 0.02, 0.2, (x, y, z + 0.37), 0x2e2a26, segs=4, rot=(0, 0, math.pi / 4))
    a.lamp(x, y, z + 0.2)


def chimney(a, x, y, z0, h, color):
    a.box((0.7, 0.7, h), (x, y, z0 + h / 2), color, bevel=0.04)
    a.box((0.86, 0.86, 0.16), (x, y, z0 + h + 0.05), shade(color, 0.8), bevel=0.03, grid=0)


def stone_band(a, w, d, h, color, z=0.0):
    """Irregular foundation stones round a w x d footprint."""
    if not a.detail:
        a.box((w + 0.3, d + 0.3, h), (0, 0, z + h / 2 - 0.15), color, bevel=0.05)
        return
    a.box((w + 0.2, d + 0.2, h * 0.9), (0, 0, z + h / 2 - 0.2), shade(color, 0.92), bevel=0.04)
    per = 2 * (w + d)
    n = int(per / 0.7)
    for i in range(n):
        t = i / n * per
        if t < w:
            x, y, r = -w / 2 + t, -d / 2 - 0.06, 0
        elif t < w + d:
            x, y, r = w / 2 + 0.06, -d / 2 + (t - w), math.pi / 2
        elif t < 2 * w + d:
            x, y, r = w / 2 - (t - w - d), d / 2 + 0.06, 0
        else:
            x, y, r = -w / 2 - 0.06, d / 2 - (t - 2 * w - d), math.pi / 2
        sw = 0.5 + a.rnd.random() * 0.35
        sh = h * (0.45 + a.rnd.random() * 0.3)
        for row in range(2):
            a.box((sw, 0.22, sh), (x, y, z + sh / 2 - 0.12 + row * h * 0.48), shade(color, 0.85 + a.rnd.random() * 0.3), rot=(0, 0, r), bevel=0.06, grid=0)


def timber_frame(a, w, d, z0, h, color):
    """Half-timbering: posts, rails and braces on all four walls."""
    if not a.detail:
        return
    for face in range(4):
        a.push(rot_z=face * math.pi / 2)
        L = w if face % 2 == 0 else d
        off = (d if face % 2 == 0 else w) / 2 + 0.05
        n = max(2, int(L / 1.6))
        for i in range(n + 1):
            x = -L / 2 + i * L / n
            a.box((0.18, 0.1, h), (x, -off, z0 + h / 2), color, bevel=0.02, grid=0)
        a.box((L, 0.1, 0.18), (0, -off, z0 + h * 0.5), color, bevel=0.02, grid=0)
        a.box((L + 0.1, 0.12, 0.2), (0, -off, z0 + h - 0.08), color, bevel=0.02, grid=0)
        for i in range(n):
            if i % 2:
                continue
            x0 = -L / 2 + i * L / n
            seg = L / n
            a.box((math.hypot(seg, h * 0.5) * 0.96, 0.08, 0.14), (x0 + seg / 2, -off - 0.01, z0 + h * 0.25), color,
                  rot=(0, -math.atan2(h * 0.5, seg), 0), bevel=0.01, grid=0)
        a.pop()


def log_walls(a, w, d, z0, h, color):
    """Stacked round logs with crossed corner ends (Nordic log house)."""
    n = max(4, int(h / 0.32))
    for i in range(n):
        z = z0 + (i + 0.5) * h / n
        k = 0.88 + (i % 2) * 0.1 + a.rnd.random() * 0.06
        for y in (-d / 2, d / 2):
            a.cyl(0.17, 0.17, w + 0.7, (-(w + 0.7) / 2, y, z), shade(color, k), segs=8, rot=(0, math.pi / 2, 0))
        for x in (-w / 2, w / 2):
            a.cyl(0.17, 0.17, d + 0.7, (x, -(d + 0.7) / 2, z + h / n / 2), shade(color, k * 0.96), segs=8, rot=(-math.pi / 2, 0, 0))


def porch(a, w, depth, h, face_y, roof_color, post_color, floor_color=None):
    """A covered porch along the front wall (face_y = front wall y)."""
    for s in (-1, 1):
        a.cyl(0.1, 0.09, h, (s * (w / 2 - 0.2), face_y - depth + 0.15, 0), post_color, segs=8)
    a.box((w + 0.3, depth + 0.4, 0.14), (0, face_y - depth / 2 + 0.1, h + 0.12), roof_color, rot=(-0.22, 0, 0), bevel=0.04)
    if floor_color is not None:
        a.box((w, depth, 0.2), (0, face_y - depth / 2, 0.1), floor_color, bevel=0.03)


def fence_run(a, x0, y0, x1, y1, color, h=1.0, kind='picket'):
    L = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    a.push(((x0 + x1) / 2, (y0 + y1) / 2, 0), rot_z=ang)
    if kind == 'picket':
        n = max(2, int(L / 0.28))
        for i in range(n):
            x = -L / 2 + (i + 0.5) * L / n
            a.box((0.1, 0.06, h), (x, 0, h / 2), shade(color, 0.92 + a.rnd.random() * 0.12), bevel=0.01, grid=0)
            if a.detail:
                a.cyl(0.07, 0.0, 0.12, (x, 0, h), color, segs=4)
        a.box((L, 0.06, 0.08), (0, 0.06, h * 0.75), shade(color, 0.85), bevel=0.01, grid=0)
        a.box((L, 0.06, 0.08), (0, 0.06, h * 0.3), shade(color, 0.85), bevel=0.01, grid=0)
    elif kind == 'palisade':
        n = max(2, int(L / 0.34))
        for i in range(n):
            x = -L / 2 + (i + 0.5) * L / n
            hh = h * (0.9 + a.rnd.random() * 0.2)
            a.cyl(0.16, 0.16, hh, (x, 0, 0), shade(color, 0.85 + a.rnd.random() * 0.2), segs=7)
            a.cyl(0.16, 0.0, 0.35, (x, 0, hh), shade(color, 0.8), segs=7)
        a.box((L, 0.1, 0.16), (0, 0.16, h * 0.7), shade(color, 0.7), bevel=0.02, grid=0)
    elif kind == 'stone':
        a.box((L, 0.6, h), (0, 0, h / 2), color, bevel=0.1, segs=2)
        if a.detail:
            for i in range(int(L / 0.6)):
                x = -L / 2 + (i + 0.5) * L / int(L / 0.6)
                a.box((0.55, 0.66, 0.2), (x, 0, h + 0.05), shade(color, 0.88 + a.rnd.random() * 0.2), bevel=0.06, grid=0)
    elif kind == 'rail':
        n = max(2, int(L / 2.0))
        for i in range(n + 1):
            a.box((0.14, 0.14, h), (-L / 2 + i * L / n, 0, h / 2), color, bevel=0.02, grid=0)
        a.box((L, 0.08, 0.12), (0, 0, h * 0.85), shade(color, 0.9), bevel=0.02, grid=0)
        a.box((L, 0.08, 0.12), (0, 0, h * 0.45), shade(color, 0.9), bevel=0.02, grid=0)
    a.pop()


# =================================================================================================
# Baking and export
# =================================================================================================

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = 1.3


def _mesh_from_part(name, part):
    me = bpy.data.meshes.new(name)
    part.bm.normal_update()
    part.bm.to_mesh(me)
    part.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def bake_ao(ob, strength=0.5, ground=True):
    """Bake ambient occlusion and multiply it into the 'Col' attribute."""
    me = ob.data
    if len(me.polygons) == 0:
        return
    plane = None
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.01))
        plane = bpy.context.active_object
    ao = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    mat = bpy.data.materials.new(ob.name + '_bake')
    mat.use_nodes = True
    me.materials.clear()
    me.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    col = me.color_attributes['Col']
    for i, d in enumerate(col.data):
        o = ao.data[i].color[0]
        k = 1.0 - strength * (1.0 - o)
        c = d.color
        d.color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['Col']
    me.materials.clear()
    if plane is not None:
        bpy.data.objects.remove(plane, do_unlink=True)


def finish(a, bake=True):
    """Turn an Asset into scene objects (solid + glow), baking AO on the solid part."""
    solid = _mesh_from_part(a.name, a.solid)
    for c in solid.data.color_attributes:
        pass
    solid.data.color_attributes.active_color = solid.data.color_attributes['Col']
    if bake:
        bake_ao(solid)
    out = [solid]
    if len(a.glow.bm.faces):
        glow = _mesh_from_part(a.name + '__glow', a.glow)
        glow.data.color_attributes.active_color = glow.data.color_attributes['Col']
        out.append(glow)
    else:
        a.glow.free()
    meta = {'colliders': a.colliders, 'doors': a.doors, 'lamps': a.lamps, 'anchors': a.anchors}
    # Bounding box for footprints and heights.
    xs, ys, zs = [], [], []
    for ob in out:
        for v in ob.data.vertices:
            xs.append(v.co.x); ys.append(v.co.y); zs.append(v.co.z)
    meta['bounds'] = [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3), round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)]
    meta['tris'] = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in out)
    return out, meta


def export_pack(objects, path):
    """Export the given objects as one Draco-compressed GLB."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_color_quantization=10,
        export_vertex_color='ACTIVE', export_materials='NONE', export_normals=True, export_texcoords=False,
        export_yup=True, export_apply=True,
    )
