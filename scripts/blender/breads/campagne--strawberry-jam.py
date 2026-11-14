"""딸기 스월 깜빠뉴 (campagne--strawberry-jam) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/campagne--strawberry-jam{,-2,-3}.png — 정면(1번)이 정체성 기준.
구성: 깜빠뉴(boule.py 형상·껍질 그대로)에서 오른쪽 앞 쐐기 한 조각을 불리언으로 덜어낸다 →
      두 단면 = 옅은 속살(기공) + 딸기잼 소용돌이(윤기) + 얇은 껍질 테.
단면 무늬는 (축 거리 r, 높이 z) 평면 식이라 두 단면에 같은 소용돌이가 보인다.
"""
import math

import bmesh
import bpy
from boule import Score, Shape, boule_mesh, campagne_crust, drop_base
from lib import az, horiz

SEED = 5
SHAPE = Shape()
SCORE = Score([az(45), az(-45)])  # 깜빠뉴와 같은 X — 오른쪽 앞 팔은 쐐기와 함께 빠진다
WEDGE = (-22, 70)  # 덜어낸 쐐기 — 카메라 기준 각(도), + = 화면 오른쪽. 왼쪽 면이 0°면 카메라와 나란해 안 보였다(r1)

# 소용돌이 — 단면 (r, z) 평면의 중심 · 감김 간격 · 바깥 반지름 · 잼 띠 비율
SWIRL_C, SWIRL_PITCH, SWIRL_R, JAM_W = (0.255, 0.21), 0.068, 0.205, 0.46  # r1(간격 0.052·반지름 0.17)은 과녁처럼 가늘었다


def wedge_cutter(lib, mat):
    """쐐기 기둥 — 꼭짓점은 축 바로 뒤(정확히 축 위면 극 정점과 겹쳐 불리언이 흔들린다)"""
    a0, a1 = az(WEDGE[0]), az(WEDGE[1])
    apex = -horiz((a0 + a1) / 2) * 0.004
    ring = [apex] + [horiz(a0 + (a1 - a0) * k / 12) * 0.9 for k in range(13)]
    bm = bmesh.new()
    lo = [bm.verts.new((v.x, v.y, -0.05)) for v in ring]
    hi = [bm.verts.new((v.x, v.y, SHAPE.H + 0.1)) for v in ring]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('wedge')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False  # 단면은 평평하게
    ob = lib.link(bpy.data.objects.new('wedge', me))
    return lib.assign(ob, mat)


def jam_crumb_material(lib):
    m = lib.Mat('jamcrumb')
    p = m.lpos()
    px = m.sep(p)
    r = m.vmath('LENGTH', m.combine(px[0], px[1], 0.0))
    qr, qz = m.math('SUBTRACT', r, SWIRL_C[0]), m.math('SUBTRACT', px[2], SWIRL_C[1])
    rho = m.vmath('LENGTH', m.combine(qr, qz, 0.0))
    phi = m.math('ARCTAN2', qz, qr)
    phase = m.math('ADD', m.math('DIVIDE', rho, SWIRL_PITCH), m.math('DIVIDE', phi, math.tau))
    phase = m.math('ADD', phase, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=7, detail=3), 0.5), 0.8))  # 손으로 만 반죽 — 고른 띠는 과녁으로 읽혔다(r2)
    d = m.math('ABSOLUTE', m.math('SUBTRACT', m.math('FRACT', phase), 0.5))  # 0.5 = 띠 한가운데
    env = m.math('MULTIPLY', m.smooth(rho, 0.004, 0.018), m.math('SUBTRACT', 1.0, m.smooth(rho, SWIRL_R - 0.02, SWIRL_R)))
    # 띠 폭은 노이즈로 들쭉날쭉, 가장자리는 번지게 — 고른 띠(r4)는 과녁으로 읽혔다(검수)
    d = m.math('ADD', d, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=9, detail=3), 0.5), 1.2))  # 노이즈 값은 0.35~0.65에 몰린다 — 진폭을 크게
    jam = m.math('MULTIPLY', m.smooth(d, 0.5 - JAM_W / 2 - 0.05, 0.5 - JAM_W / 2 + 0.03), env)
    halo = m.math('MULTIPLY', m.smooth(d, 0.5 - JAM_W / 2 - 0.09, 0.5 - JAM_W / 2), env)

    pore_d = m.voronoi(m.mapping(p, scale=(1, 1, 1.4)), scale=34, randomness=0.95)
    pore = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(pore_d, 0.12, 0.3)), m.smooth(m.noise(p, scale=11, detail=2), 0.3, 0.55))  # 기공 — 작고 성긴 점(r2·r4)은 티로 읽혔다
    crumb = m.ramp(m.noise(p, scale=9, detail=3), [(0.35, '#EEC484'), (0.65, '#F8D79E')])  # 레퍼런스 속살 #EDC790 — 회백(r3 #DEC8A4)이 됐다
    crumb = m.mix(m.math('MULTIPLY', pore, 0.7), crumb, '#BE8448')
    crumb = m.mix(m.math('MULTIPLY', halo, 0.55), crumb, '#D98466')  # 잼이 스민 분홍 테
    jam_c = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, '#8C1C0E'), (0.5, '#A82816'), (0.7, '#BC3620')])
    seeds = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=40, randomness=0.9), 0.05, 0.09))  # 씨 점 몇 개
    jam_c = m.mix(m.math('MULTIPLY', seeds, 0.9), jam_c, '#3E0608')
    col = m.mix(jam, crumb, jam_c)

    # 껍질 테 — 겉면까지 두께 ≈ 0.02 (정규화 반지름 0.95~) · 바닥
    rim = m.math('MAXIMUM', m.smooth(SHAPE.f_nodes(m, p), 0.935, 0.952),
                 m.math('SUBTRACT', 1.0, m.smooth(px[2], 0.012, 0.022)))
    col = m.mix(rim, col, '#8E4512')
    rough = m.mixf(rim, m.mixf(jam, 0.88, 0.42), 0.86)  # 잼 0.16·0.3은 왼쪽 단면에서 하늘 반사로 자홍색이 됐다(검수)
    h = m.math('ADD', m.math('MULTIPLY', pore, m.math('SUBTRACT', jam, 1.0)), m.math('MULTIPLY', jam, 0.25))
    return m.out(col, rough, m.bump(h, strength=0.35, distance=0.003))


def build(lib):
    lib.reset(SEED)
    crust, jamcrumb = campagne_crust(lib, SHAPE, SCORE), jam_crumb_material(lib)
    ob = lib.assign(boule_mesh(lib, 'boule', SHAPE, SCORE.disp, target=13500), crust)
    cutter = wedge_cutter(lib, jamcrumb)
    md = ob.modifiers.new('wedge', 'BOOLEAN')
    md.operation, md.solver, md.object = 'DIFFERENCE', 'EXACT', cutter
    md.material_mode = 'TRANSFER'
    lib.apply_modifiers(ob)
    bpy.data.objects.remove(cutter)
    drop_base(lib, ob)
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri  mats={[mt.name for mt in ob.data.materials]}')
    return [ob], dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45, 'jamcrumb': 0.3},
                      uv_weight={'crust': 1.0, 'jamcrumb': 1.5})
