"""
Render a contact sheet of assets for a quick look (not part of the game build).

  Blender -b --factory-startup --python scripts/blender/preview.py -- out.png name1 name2 ...

Names are entries of build.CATALOGUE; each is built, baked, laid out in a row and rendered
with Cycles under a warm sun, roughly as the game lights them.
"""
import sys
import os
import math
import bpy

sys.path.insert(0, os.path.dirname(__file__))
import kit  # noqa: E402
from build import CATALOGUE, make  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]
names = argv[1:] or list(CATALOGUE)[:6]

kit.reset_scene()
objs = []
x = 0.0
for n in names:
    obs, meta = make(n, detail=True)
    b = meta['bounds']
    w = b[3] - b[0]
    for ob in obs:
        ob.location.x = x - b[0]
    x += w + 3.0
    objs.extend(obs)

mat = bpy.data.materials.new('vc')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
attr = nt.nodes.new('ShaderNodeVertexColor')
attr.layer_name = 'Col'
nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85
glow = bpy.data.materials.new('glow')
glow.use_nodes = True
gb = glow.node_tree.nodes['Principled BSDF']
gb.inputs['Emission Color'].default_value = (1.0, 0.75, 0.35, 1)
gb.inputs['Emission Strength'].default_value = 2.0
for ob in objs:
    ob.data.materials.clear()
    ob.data.materials.append(glow if ob.name.endswith('__glow') else mat)

bpy.ops.mesh.primitive_plane_add(size=400, location=(x / 2, 0, 0))
ground = bpy.context.active_object
gm = bpy.data.materials.new('ground')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.45, 0.16, 1)
ground.data.materials.append(gm)

sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 4.0
sun.color = (1.0, 0.95, 0.86)
so = bpy.data.objects.new('sun', sun)
so.rotation_euler = (math.radians(50), 0, math.radians(-35))
bpy.context.scene.collection.objects.link(so)
world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.72, 0.9, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9

cam = bpy.data.cameras.new('cam')
cam.lens = 35
co = bpy.data.objects.new('cam', cam)
bpy.context.scene.collection.objects.link(co)
span = max(x, 10)
co.location = (x / 2 - 3, -span * 0.85, span * 0.42)
co.rotation_euler = (math.radians(68), 0, 0)
bpy.context.scene.camera = co

sc = bpy.context.scene
sc.render.resolution_x = 1600
sc.render.resolution_y = 700
sc.cycles.samples = 48
sc.render.filepath = out
sc.view_settings.view_transform = 'Standard'
bpy.ops.render.render(write_still=True)
print('PREVIEW', out)
