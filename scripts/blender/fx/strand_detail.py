"""가닥 상세 맵 굽기 · 미리보기 (Blender 5.3, 헤드리스).

blender -b --factory-startup --python-exit-code 1 -P strand_detail.py -- bake   <work>          → work/bake_n.npy · bake_ao.npy
blender -b --factory-startup --python-exit-code 1 -P strand_detail.py -- render <work> <map.png> [tag] → work/view_*.png

굽기: 높이장(strand_detail_field.py → work/height.npy)을 고해상 원통(1024 × 2048+여백, 4.6M tri)에 변위로 입히고
저해상 원통(반지름 0.9, UV u = 둘레 · v = 길이)에 Cycles selected-to-active로 탄젠트 노멀 · AO를 256×512에 굽는다.
높이장이 둘레 · 길이 모두 주기라 맵 이음매가 없다(고해상 원통은 위아래로 한 주기 밖까지 이어 붙여 끝 AO가 끊기지 않는다).
"""
import math
import os
import sys

import bpy
import numpy as np

TAU = math.tau
L = 2 * TAU            # 길이 한 주기(r = 1)
MAP_W, MAP_H = 256, 512
MARGIN = 96            # 고해상 원통 위아래 여분 행(≈ 0.6r, AO 거리의 3배)
AO_DIST = 0.2          # r 단위 — 다발 폭(0.1~0.4r)만큼만 본다


def hexlin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def setup(samples):
    p = bpy.context.preferences
    p.use_preferences_save = False  # 전역 설정 저장 금지
    sc = bpy.context.scene
    for ob in list(bpy.data.objects):  # 기본 장면의 큐브 · 카메라 · 빛(큐브가 원통을 뚫고 AO를 가렸다)
        bpy.data.objects.remove(ob)
    sc.render.engine = 'CYCLES'
    dev = 'CPU'
    try:
        cp = p.addons['cycles'].preferences
        cp.compute_device_type = 'CUDA'
        cp.get_devices()
        cuda = [d for d in cp.devices if d.type == 'CUDA']
        for d in cp.devices:
            d.use = d.type == 'CUDA'
        if cuda:
            sc.cycles.device = 'GPU'
            dev = 'GPU ' + cuda[0].name
    except Exception as e:  # noqa: BLE001
        print('GPU 실패, CPU로', e)
    sc.cycles.samples = samples
    print('DEVICE', dev)
    return sc


def grid_mesh(name, verts, nu, nv, closed_u):
    """(nv, nu, 3) 격자 → 사각면 메시. closed_u면 둘레를 잇는다"""
    me = bpy.data.meshes.new(name)
    me.vertices.add(nu * nv)
    me.vertices.foreach_set('co', verts.reshape(-1).astype(np.float32))
    cu = nu if closed_u else nu - 1
    i = np.arange(cu)
    j = np.arange(nv - 1)
    I, J = np.meshgrid(i, j)
    a = J * nu + I
    b = J * nu + (I + 1) % nu
    quads = np.stack([a, b, b + nu, a + nu], -1).reshape(-1)  # 둘레 → 길이 순 = 바깥 법선
    nq = len(quads) // 4
    me.loops.add(len(quads))
    me.loops.foreach_set('vertex_index', quads.astype(np.int32))
    me.polygons.add(nq)
    me.polygons.foreach_set('loop_start', (np.arange(nq) * 4).astype(np.int32))
    me.update()
    me.validate()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, (I, J)


def bake(work):
    sc = setup(16)
    H = np.load(os.path.join(work, 'height.npy'))
    nv, nu = H.shape
    th = (np.arange(nu) + 0.5) / nu * TAU
    jj = np.arange(-MARGIN, nv + MARGIN)
    y = (jj + 0.5) / nv * L
    R = 1.0 + H[jj % nv]                       # (rows, nu)
    v = np.stack([R * np.cos(th)[None], R * np.sin(th)[None], np.broadcast_to(y[:, None], R.shape)], -1)
    hi, _ = grid_mesh('strand_high', v, nu, len(jj), True)

    # 저해상: 반지름 0.9(고해상 최저 0.95 아래), 둘레 256 + 이음매 열 1, 길이 2링
    nl = 256
    tl = np.arange(nl + 1) / nl * TAU
    yl = np.array([0.0, L])
    vl = np.stack([0.9 * np.cos(tl)[None].repeat(2, 0), 0.9 * np.sin(tl)[None].repeat(2, 0),
                   yl[:, None].repeat(nl + 1, 1)], -1)
    lo, (I, J) = grid_mesh('strand_low', vl, nl + 1, 2, False)
    uv = lo.data.uv_layers.new(name='UVMap')
    # 루프 순서 = quads(a, b, b+nu, a+nu) → (u, v)
    U = np.stack([I, I + 1, I + 1, I], -1) / nl
    V = np.stack([J, J, J + 1, J + 1], -1).astype(float)
    uv.data.foreach_set('uv', np.stack([U, V], -1).reshape(-1).astype(np.float32))
    for flag in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission', 'visible_volume_scatter'):
        setattr(lo, flag, False)

    mat = bpy.data.materials.new('bake')
    lo.data.materials.append(mat)
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    mat.node_tree.nodes.active = tex

    sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = AO_DIST
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.use_cage = False
    bk.cage_extrusion = 0.25
    bk.max_ray_distance = 0.45
    bk.margin = 2
    bk.normal_space = 'TANGENT'
    bk.normal_r, bk.normal_g, bk.normal_b = 'POS_X', 'POS_Y', 'POS_Z'

    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    print('TRIS high', len(hi.data.polygons) * 2, 'low', len(lo.data.polygons) * 2)

    for kind, spp, out in (('NORMAL', 16, 'bake_n.npy'), ('AO', 256, 'bake_ao.npy')):
        img = bpy.data.images.new(kind, MAP_W, MAP_H, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Non-Color'
        tex.image = img
        sc.cycles.samples = spp
        r = bpy.ops.object.bake(type=kind, use_clear=True)
        a = np.empty(MAP_W * MAP_H * 4, np.float32)
        img.pixels.foreach_get(a)
        np.save(os.path.join(work, out), a.reshape(MAP_H, MAP_W, 4))  # 행 0 = v 0(아래)
        print('BAKE', kind, r, 'spp', spp)


# ── 미리보기 ─────────────────────────────────────────────────────────────────

D = 1.824          # 병 안지름(월드)
R0 = 0.12          # 주 기둥 반지름 — spec 1-3 목 폭 0.15D × 0.85 / 2
HC = 0.85          # 기둥 높이 ≈ 0.47D (UPQ94 9s 기둥이 화면 위로 나감)
FLAT = 0.6         # 단면 깊이/폭(StrandMesh STRAND_FLAT)


def column():
    nu, nv = 160, 260
    CAPH = 0.06
    z = np.linspace(0, HC - CAPH, nv - 40)
    r = R0 * (1 + 1.3 * np.exp(-z / 0.07)) * (1 - 0.12 * np.sin(np.pi * z / HC))
    # 위 끝: 타원 돔으로 닫힘(1차는 z가 한 번 되감겨 회색 테 줄이 생겼다)
    phi = np.linspace(0, np.pi / 2, 41)[1:]
    r = np.concatenate([r, r[-1] * np.cos(phi)])
    zz = np.concatenate([z, z[-1] + CAPH * np.sin(phi)])
    r = np.maximum(r, 1e-4)
    th = np.arange(nu + 1) / nu * TAU + math.pi / 2   # 이음매를 뒤쪽(+Y)에
    x = r[:, None] * np.cos(th)[None]
    yv = FLAT * r[:, None] * np.sin(th)[None]
    v = np.stack([x, yv, np.broadcast_to(zz[:, None], x.shape)], -1)
    ob, (I, J) = grid_mesh('column', v, nu + 1, nv, False)
    # v = 호 길이 / (둘레 두 바퀴) — 앱과 같은 비율(길이 0..1 = 둘레 2바퀴), u = 각 / 2π
    ds = np.sqrt(np.diff(r) ** 2 + np.diff(zz) ** 2)
    s = np.concatenate([[0], np.cumsum(ds)]) / (2 * TAU * R0 * (1 + FLAT) / 2)
    U = np.stack([I, I + 1, I + 1, I], -1) / nu
    V = s[np.stack([J, J, J + 1, J + 1], -1)]
    uv = ob.data.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', np.stack([U, V], -1).reshape(-1).astype(np.float32))
    return ob


def dough_mat(map_path, use_map):
    m = bpy.data.materials.new('dough')
    nt = m.node_tree
    N = nt.nodes
    bsdf = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    base = hexlin('#f4ead4')
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Subsurface Weight'].default_value = 0.15
    bsdf.inputs['Subsurface Radius'].default_value = (0.02, 0.015, 0.01)
    if not use_map:
        return m
    img = bpy.data.images.load(os.path.abspath(map_path))
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'CHANNEL_PACKED'
    t = N.new('ShaderNodeTexImage')
    t.image = img
    t.interpolation = 'Linear'
    sep = N.new('ShaderNodeSeparateColor')
    nt.links.new(t.outputs['Color'], sep.inputs['Color'])
    # 노멀: (R, G) → z = √(1 − x² − y²) 복원 후 Normal Map(탄젠트, UVMap)
    def m2(op, a, b=None, v=None):
        n = N.new('ShaderNodeMath')
        n.operation = op
        nt.links.new(a, n.inputs[0])
        if b is not None:
            nt.links.new(b, n.inputs[1])
        elif v is not None:
            n.inputs[1].default_value = v
        return n.outputs[0]
    x = m2('SUBTRACT', m2('MULTIPLY', sep.outputs['Red'], v=2.0), v=1.0)
    y = m2('SUBTRACT', m2('MULTIPLY', sep.outputs['Green'], v=2.0), v=1.0)
    one = N.new('ShaderNodeValue')
    one.outputs[0].default_value = 1.0
    zz = m2('SQRT', m2('MAXIMUM', m2('SUBTRACT', m2('SUBTRACT', one.outputs[0], m2('MULTIPLY', x, x)), m2('MULTIPLY', y, y)), v=0.0))
    zc = m2('MULTIPLY_ADD', zz, v=0.5)
    zc.node.inputs[2].default_value = 0.5
    comb = N.new('ShaderNodeCombineColor')
    nt.links.new(sep.outputs['Red'], comb.inputs['Red'])
    nt.links.new(sep.outputs['Green'], comb.inputs['Green'])
    nt.links.new(zc, comb.inputs['Blue'])
    nm = N.new('ShaderNodeNormalMap')
    nm.space = 'TANGENT'
    nm.uv_map = 'UVMap'
    nt.links.new(comb.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    # 틈(B): 바탕색 × mix(1, B, 0.85)
    ao = m2('MULTIPLY_ADD', sep.outputs['Blue'], v=0.85)
    ao.node.inputs[2].default_value = 0.15
    mix = N.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs['A'].default_value = (*base, 1)
    nt.links.new(ao, mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return m


def render(work, map_path, tag):
    work = os.path.abspath(work)
    sc = setup(48)
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.view_settings.view_transform = 'Standard'
    sc.cycles.use_denoising = False
    sc.world = bpy.data.worlds.new('w')
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*hexlin('#f4ead4'), 1)
    bg.inputs['Strength'].default_value = 0.55
    sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    sun.data.energy = 2.6
    sun.data.angle = math.radians(12)
    # 반죽 키(three (-0.7, 0.45, 0.45)) → Blender (x, -z, y)
    kd = np.array([-0.7, -0.45, 0.45]); kd /= np.linalg.norm(kd)
    sun.rotation_mode = 'QUATERNION'
    from mathutils import Vector
    sun.rotation_quaternion = Vector(-kd).to_track_quat('-Z', 'Y')
    sc.collection.objects.link(sun)

    col = column()
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=4.0, fill_type='NGON', location=(0, 0, 0.0))
    floor = bpy.context.active_object
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    sc.collection.objects.link(cam)
    sc.camera = cam

    for use_map, suffix in ((True, ''), (False, '_plain')):
        m = dough_mat(map_path, use_map)
        col.data.materials.clear()
        col.data.materials.append(m)
        floor.data.materials.clear()
        floor.data.materials.append(dough_mat(map_path, False))
        views = [('app', 42, 1.25, 0.42), ('side', 0, 1.25, 0.42), ('close', 42, 0.42, 0.55)]
        if not use_map:
            views = views[:1] + views[2:]
        for name, el, scale, look_z in views:
            e = math.radians(el)
            cam.location = (0, -6 * math.cos(e), look_z + 6 * math.sin(e))
            cam.rotation_euler = (math.radians(90 - el), 0, 0)
            cam.data.ortho_scale = scale
            sc.render.filepath = os.path.join(work, f'view_{name}{suffix}{tag}.png')
            bpy.ops.render.render(write_still=True)
            print('RENDER', sc.render.filepath)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:]
    if argv[0] == 'bake':
        bake(argv[1])
    else:
        render(argv[1], argv[2], argv[3] if len(argv) > 3 else '')
