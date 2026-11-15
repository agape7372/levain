"""구운 고구마 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 질감 · 조명은 사실적인 쪽.

구성: 짙은 청록 접시 · 노란빛 도는 두툼한 팬케이크 두 장 · 군고구마 조각 무더기(자주 껍질 한 면 + 노란 속살 +
그을린 모서리, 크기 제각각)가 카메라 왼쪽 뒤로 치우쳐 쌓임 · 오른쪽 앞에 녹는 버터 한 조각 ·
맑은 시럽이 버터 쪽에 조금 고였다 두어 줄기 흘러내림 · 접시에 굴러떨어진 조각 둘.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import fresh


def chunk(lib, name, size, seed, cuts=4, k=5.0):
    """고구마 한 조각 — 모서리 둥근 덩이. 국소 +X 면이 껍질(둥글게 불룩).
    정점 속성 edge(0 면 가운데 → 1 모서리) · skin(1 = 껍질)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    edge, skin = [], []
    for v in bm.verts:
        x, y, z = v.co * 2.0
        n = (abs(x) ** k + abs(y) ** k + abs(z) ** k) ** (1.0 / k)
        x, y, z = x / n, y / n, z / n
        edge.append(sorted((abs(x), abs(y), abs(z)))[1])
        skin.append(min(1.0, max(0.0, (x - 0.62) / 0.2)))
        if x > 0:  # 껍질 쪽은 둥근 고구마 겉
            x += 0.38 * x * (1.0 - 0.8 * y * y) * (1.0 - 0.5 * z * z)
        w = 1.0 + 0.06 * lib.n3(x * 1.7, y * 1.7, z * 1.7, seed)
        v.co = Vector((x * size[0] / 2 * w, y * size[1] / 2 * w, z * size[2] / 2 * w))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.point_attr(ob, 'edge', edge)
    lib.point_attr(ob, 'skin', skin)
    return ob


def potato_mat(lib):
    """속살 = 꿀 밴 짙은 노랑, 모서리 · 군데군데는 눌어 갈색. 껍질 = 주름진 자주"""
    m = lib.Mat('potato')
    P = m.lpos()
    big = m.noise(P, scale=14.0, detail=3.0, rough=0.6)
    fine = m.noise(P, scale=70.0, detail=2.0)
    flesh = m.ramp(big, [(0.25, '#F7D05C'), (0.55, '#F0B636'), (0.8, '#E29A22')])
    # 결: 고구마 속살의 실 같은 섬유
    fiber = m.smooth(m.noise(m.mapping(P, scale=(1.0, 6.0, 6.0)), scale=16.0, detail=2.0), 0.5, 0.75)
    flesh = m.mix(m.math('MULTIPLY', fiber, 0.25), flesh, '#FBE08A')
    roast = m.smooth(m.math('ADD', m.attr('edge'), m.math('MULTIPLY', m.math('SUBTRACT', big, 0.5), 0.7)), 0.72, 1.02)
    flesh = m.mix(m.math('MULTIPLY', roast, 0.85), flesh, m.mix(fine, '#A85A14', '#6E3408'))
    sk = m.smooth(m.math('ADD', m.attr('skin'), m.math('MULTIPLY', m.math('SUBTRACT', fine, 0.5), 0.25)), 0.35, 0.6)
    peel = m.mix(m.noise(P, scale=26.0, detail=3.0), '#6A2848', '#8C3A56')
    peel = m.mix(m.math('MULTIPLY', m.smooth(big, 0.6, 0.8), 0.6), peel, '#3E1626')  # 탄 얼룩
    col = m.mix(sk, flesh, peel)
    fresh.sss(m, 0.25, (1.0, 0.7, 0.3), 0.02)
    return m.out(color=col, rough=m.mixf(sk, m.mixf(roast, 0.36, 0.6), 0.66),
                 normal=m.bump(m.math('ADD', fine, m.math('MULTIPLY', fiber, 0.5)), strength=0.35, distance=0.006))


def build(lib):
    lib.reset(seed=96)
    rnd = random.Random(96)
    R, H, T = 0.43, 0.205, 0.018
    kw = dict(n=4.0, steps=16, wob=0.022)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=41, dome=0.016, **kw),
        fresh.Cake(R * 0.95, H * 0.95, 0.200, -0.030, 0.016, seed=42, dome=0.018, droop=0.010, **kw),
    ]
    top = cakes[-1]
    base = top.top + 0.004
    cake = fresh.cake_mat('cake', R, top=('#D9A03C', '#B87624', '#8E5216'), side=('#F8DC8C', '#F0C660'), pit='#D8A244',
                          pore_scale=54.0)
    parts = [lib.assign(c.build(f'cake{i}', segs=56), cake) for i, c in enumerate(cakes)]
    PR = R * 1.32
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#3E5658', rough=0.4)))

    def at(al, r, z=0.0):
        a = lib.az(al)
        return (top.cx + r * math.cos(a), top.cy + r * math.sin(a), base + z)

    # 버터: 오른쪽 앞
    bx, by, _ = at(38, 0.17)
    pat = fresh.butter('butter', a=0.12, h=0.044, seed=3.0)
    lib.place(pat, (bx, by, base + T - 0.010), (math.radians(-3), math.radians(4), lib.az(-18)))
    parts.append(lib.assign(pat, fresh.butter_mat('butter', h=0.044)))

    # 시럽: 버터 쪽 앞으로 조금만 고였다 흐른다
    front = lib.az(30)
    pool = fresh.puddle(front, reach=0.03, back=0.15, ph=5.0)
    runs = [(front - 0.42, 0.16, 0.9), (front - 0.08, 0.05, 1.2), (front + 0.22, 0.21, 0.75), (front + 0.50, 0.09, 1.0)]
    mat = fresh.sauce_mat('syrup', '#9A4E0A', '#D08A22', rough=0.10, edge=(0.1, 1.0), side_col='#F2C058',
                          melt=((bx, by, base + T), 0.11, '#F8E08E'))
    parts += fresh.sauce('syrup', cakes, pool, runs, mat, w=0.022, plate=PR, thick=T, embed=0.004, segs=52, refine=0.008,
                         seed=2.0, riv=dict(head=1.6))

    # 군고구마 무더기: 왼쪽 뒤로 치우쳐, 아래 다섯 + 위 셋. 껍질 면(국소 +X)은 저마다 다른 데를 본다
    pot = potato_mat(lib)
    spots = [  # (방위, 거리, 높이, (크기), 기울기)
        (-150, 0.20, 0.0, (0.15, 0.12, 0.085), 0.10), (-88, 0.17, 0.0, (0.12, 0.11, 0.09), 0.12),
        (-28, 0.07, 0.0, (0.13, 0.10, 0.08), 0.10), (150, 0.16, 0.0, (0.14, 0.12, 0.09), 0.10),
        (95, 0.05, 0.0, (0.11, 0.10, 0.085), 0.15), (-120, 0.09, 0.082, (0.13, 0.11, 0.08), 0.45),
        (170, 0.06, 0.086, (0.12, 0.10, 0.085), 0.5), (-60, 0.03, 0.150, (0.11, 0.095, 0.075), 0.6),
    ]
    for k, (al, r, z, size, tilt) in enumerate(spots):
        ob = chunk(lib, f'pot{k}', size, seed=20.0 + k)
        x, y, _ = at(al, r)
        lib.place(ob, (x - 0.035, y + 0.02, base + z + size[2] * 0.5 - 0.004),
                  (rnd.uniform(-tilt, tilt), rnd.uniform(-tilt, tilt), rnd.uniform(0, math.tau)))
        parts.append(lib.assign(ob, pot))
    for k, (al, r, size) in enumerate(((-52, R + 0.085, (0.12, 0.10, 0.08)), (-30, R + 0.10, (0.09, 0.085, 0.07)))):
        a = lib.az(al)
        ob = chunk(lib, f'loose{k}', size, seed=40.0 + k)
        lib.place(ob, (r * math.cos(a), r * math.sin(a), size[2] * 0.5 + 0.002), (0.0, 0.0, rnd.uniform(0, math.tau)))
        parts.append(lib.assign(ob, pot))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0, clear={'syrup': dict(absorb='#FFE650', density=42.0, base='#FFF2D2')}), quality=76,
        uv_weight={'syrup': 1.0, 'potato': 1.5, 'butter': 1.2, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'potato': 0.45, 'plate': 0.3},
    )
