# Generic phone for mockup studio, built procedurally in Blender (headless):
#   blender -b --python tools/blender/phone.py -- public/models/phone.glb
# Units are centimetres (the app's unit). Front faces -Y in Blender = +Z in three (glTF is Y-up).
# Material names are the app's slots: frame, back, glass, screen, band, lens, lensFace, flash, port, hole.
# The app replaces these materials at runtime (colours, finishes, screenshots); the GLB only carries geometry + UVs.
import bpy, bmesh, math, sys
from mathutils import Vector

W, H, D = 7.15, 14.7, 0.78          # body
R = 1.05                            # corner radius (plan view)
EDGE = 0.10                         # rounded edge of the metal band
GLASS_IN, GLASS_T = 0.07, 0.055     # front glass inset from the outline, thickness
BEZEL = 0.18                        # black border between glass edge and screen
BACK_T = 0.05

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}
def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name); m.use_nodes = True; MATS[name] = m
    return MATS[name]

def rr_points(w, h, r, seg=20):
    """Rounded rectangle outline (x, z), counter-clockwise, corner radius clamped."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4); pts = []
    for cx, cz, a0 in ((w/2-r, h/2-r, 0), (-w/2+r, h/2-r, 90), (-w/2+r, -h/2+r, 180), (w/2-r, -h/2+r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg); pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts

def slab(name, w, h, r, t, y, edge, material, seg=20, edge_seg=5, uv=False):
    """Rounded-rectangle slab: face in the XZ plane at depth y (front at y, back at y+t), rounded edges."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, z in rr_points(w, h, r, seg)]
    f = bm.faces.new(vs)
    if t > 0:
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        for v in [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]: v.co.y += t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if t == 0 and f.normal.y > 0: bmesh.ops.reverse_faces(bm, faces=[f])   # flat parts face the front (-Y)
    if uv:  # planar UV over the front face. The glTF exporter flips V (v' = 1 - v), and the app's screen textures
        # expect V up (top row at v=1 in three), so Blender gets the top at v=0.
        lay = bm.loops.layers.uv.new('UVMap')
        for face in bm.faces:
            for l in face.loops: l[lay].uv = (l.vert.co.x / w + .5, .5 - l.vert.co.z / h)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.data.materials.append(mat(material))
    if t > 0 and edge > 0:
        b = o.modifiers.new('edge', 'BEVEL'); b.limit_method = 'ANGLE'; b.angle_limit = math.radians(50)
        b.width = min(edge, t / 2 - 1e-4); b.segments = edge_seg; b.harden_normals = False
    return o

def finish(o, smooth_angle=35):
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
    o.select_set(False)
    return o

def cylinder(name, r, t, y, x, z, material, seg=64, edge=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=t, location=(x, y + t / 2, z), rotation=(math.radians(90), 0, 0))
    o = bpy.context.object; o.name = name; o.data.materials.append(mat(material))
    if edge > 0:
        b = o.modifiers.new('edge', 'BEVEL'); b.limit_method = 'ANGLE'; b.width = edge; b.segments = 4
    return finish(o)

def build():
    reset()
    # body: aluminium band with rounded edges (y from -D/2 front to +D/2 back)
    finish(slab('frame', W, H, R, D, -D/2, EDGE, 'frame', seg=24, edge_seg=6))
    # front: 2.5D glass slightly proud of the band, screen just under its surface
    gw, gh, gr = W - 2*GLASS_IN, H - 2*GLASS_IN, R - GLASS_IN
    finish(slab('glass', gw, gh, gr, GLASS_T, -D/2 - GLASS_T + 0.02, 0.03, 'glass', seg=24, edge_seg=4))
    sw, sh = gw - 2*BEZEL, gh - 2*BEZEL
    sr = max(0.0, gr - BEZEL)                                   # concentric with the glass
    finish(slab('screen', sw, sh, sr, 0, -D/2 - GLASS_T + 0.019, 0, 'screen', seg=24, uv=True))
    # punch-hole camera in the screen
    cylinder('selfie', 0.17, 0.004, -D/2 - GLASS_T + 0.018, 0, sh/2 - 0.45, 'hole', seg=48)
    # earpiece slit along the top edge of the glass
    finish(slab('ear', 1.4, 0.07, 0.035, 0, -D/2 - GLASS_T + 0.0185, 0, 'port', seg=6)).location.z = gh/2 - 0.1
    # back glass panel
    finish(slab('back', gw, gh, gr, BACK_T, D/2 - 0.02, 0.025, 'back', seg=24, edge_seg=3))
    # camera island: raised pill, two lenses with metal rings, flash and mic
    ix, iz = W/2 - 1.55, H/2 - 2.2
    isl = finish(slab('island', 2.0, 3.3, 0.95, 0.13, D/2 + BACK_T - 0.02, 0.05, 'frame', seg=20, edge_seg=5))
    isl.location = (ix, 0, iz)
    for k, dz in enumerate((0.74, -0.74)):
        y0 = D/2 + BACK_T + 0.11
        cylinder(f'ring{k}', 0.68, 0.12, y0 - 0.01, ix, iz + dz, 'frame', edge=0.03)
        cylinder(f'lens{k}', 0.58, 0.125, y0 - 0.005, ix, iz + dz, 'lens')
        cylinder(f'lensFace{k}', 0.5, 0.004, y0 + 0.121, ix, iz + dz, 'lensFace')
    cylinder('flash', 0.17, 0.03, D/2 + BACK_T, W/2 - 3.0, H/2 - 1.3, 'flash')
    cylinder('mic', 0.05, 0.004, D/2 + BACK_T + 0.001, W/2 - 3.0, H/2 - 1.85, 'hole', seg=16)
    # side buttons: slim pills standing 0.6 mm proud of the band
    # 3.2 mm deep (half inside the band) x 0.6 mm front-to-back, standing 0.6 mm proud
    for name, sx, z, l in (('power', 1, 2.6, 1.7), ('volUp', -1, 3.3, 1.2), ('volDown', -1, 1.85, 1.2)):
        b = finish(slab(name, 0.32, l, 0.03, 0.06, -0.03, 0.025, 'frame', seg=8, edge_seg=3))
        b.location = (sx * (W/2 + 0.06 - 0.16), 0, z)
    # antenna lines across the band, bottom port and speaker holes
    for sx in (-1, 1):
        for z in (H/2 - R - 0.55, -H/2 + R + 0.55):
            a = finish(slab(f'band{sx}{z:.0f}', D*0.62, 0.13, 0.0, 0.03, -0.015, 0, 'band', seg=1))
            a.rotation_euler = (0, 0, math.radians(90)); a.location = (sx * (W/2 + 0.001), 0, z)
    port = finish(slab('port', 0.86, 0.27, 0.135, 0, 0, 0, 'port', seg=10)); port.rotation_euler = (math.radians(90), 0, 0); port.location = (0, 0, -H/2 - 0.002)
    portIn = finish(slab('portIn', 0.7, 0.15, 0.075, 0, 0, 0, 'port', seg=10)); portIn.rotation_euler = (math.radians(90), 0, 0); portIn.location = (0, 0, -H/2 - 0.003)
    for i in range(6):
        for sx in (-1, 1):
            h = cylinder(f'spk{i}{sx}', 0.05, 0.004, 0, 0, 0, 'hole', seg=16)
            h.rotation_euler = (0, 0, 0); h.location = (sx * (1.05 + i * 0.19), 0, -H/2 - 0.004)   # disc on the bottom edge
    return

if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'phone.glb'
    build()
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=True)
    print('exported', out)
