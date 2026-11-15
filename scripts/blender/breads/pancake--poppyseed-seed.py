"""포피시드 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 레몬 포피시드로 풀었다.

구성: 짙은 남색 접시 · 옅은 레몬빛 팬케이크 석 장(겉 · 속살에 검푸른 씨 점이 고르지 않게) · 흰 레몬 아이싱이
앞 왼쪽으로 쏠려 고였다가 굵기 다른 줄기로 흘러내림(씨가 뿌려짐) · 뒤 오른쪽에 반달 레몬 조각 둘을 비스듬히
겹쳐 얹음 · 레몬 제스트 가닥 몇.
"""
import math
import random

import bmesh
from mathutils import Matrix

import fresh


def reopen(lib, mat):
    """이미 지은 재질에 노드를 더 얹는다(겉에 씨 점을 그릴 때)"""
    m = lib.Mat.__new__(lib.Mat)
    m.mat, m.nt = mat, mat.node_tree
    m.bsdf = m.nt.nodes['Principled BSDF']
    return m


def seeds(m, P, scale, keep, r=(0.16, 0.24), patch=0.0):
    """씨 점 마스크 0..1 — 보로노이 칸의 keep 비율에만 점. patch > 0 이면 큰 얼룩으로 성긴 데 · 촘촘한 데가 생긴다"""
    dot = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(P, scale=scale), *r))
    rnd = m.sep(m.voronoi(P, scale=scale, out='Color'))[0]
    if patch:
        rnd = m.math('ADD', rnd, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(P, scale=5.0, detail=1.0), 0.5), patch))
    return m.math('MULTIPLY', dot, m.math('SUBTRACT', 1.0, m.smooth(rnd, keep - 0.02, keep + 0.02)))


def wedge(lib, name, R=0.17, t=0.034):
    """반달 레몬 조각 — 얇은 원판의 반(자른 면 = 국소 XZ, 몸은 +Y, 두께 = Z)"""
    ob = lib.lathe(name, lib.superellipse_profile(R, t, n=7.0, steps=6), segs=22, theta0=0.0, theta1=math.pi,
                   rfn=lambda th, z: 1.0 + 0.012 * math.sin(3 * th + 1.0))
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.transform(Matrix.Translation((0.0, 0.0, -t / 2)))
    return ob


def lemon_mat(lib, name='lemon', R=0.17):
    """껍질 노랑 · 흰 속껍질 · 과육(부챗살 칸막이 + 알갱이 결) · 가운데 흰 심"""
    m = lib.Mat(name)
    P = m.lpos()
    x, y, _ = m.sep(P)
    rr = m.math('DIVIDE', m.math('SQRT', m.math('ADD', m.math('MULTIPLY', x, x), m.math('MULTIPLY', y, y))), R)
    ang = m.math('ARCTAN2', y, x)
    wall = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.math('SINE', m.math('ADD', m.math('MULTIPLY', ang, 4.5), 0.4))), 0.0, 0.16))
    # 알갱이: 바깥으로 뻗는 길쭉한 결
    sac = m.noise(m.combine(m.math('MULTIPLY', ang, 3.2), m.math('MULTIPLY', rr, 0.9), 0.0), scale=9.0, detail=2.0, rough=0.6)
    pulp = m.ramp(sac, [(0.28, '#EFD23C'), (0.52, '#F7E46C'), (0.78, '#FCF2A8')])
    col = m.mix(m.math('MULTIPLY', wall, 0.85), pulp, '#FBF3CC')
    col = m.mix(m.math('SUBTRACT', 1.0, m.smooth(rr, 0.05, 0.11)), col, '#FBF3CC')
    pith = m.smooth(rr, 0.78, 0.83)
    col = m.mix(pith, col, '#FBF2C8')
    rind = m.smooth(rr, 0.90, 0.94)
    col = m.mix(rind, col, m.mix(m.noise(P, scale=90.0, detail=1.0), '#F6D426', '#EEC212'))
    fresh.sss(m, 0.3, (1.0, 0.85, 0.3), 0.02)
    juicy = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, pith), m.math('SUBTRACT', 1.0, wall))
    return m.out(color=col, rough=m.mixf(juicy, 0.55, 0.30),
                 normal=m.bump(m.math('ADD', sac, m.math('MULTIPLY', m.noise(P, scale=120.0), rind)), strength=0.35, distance=0.005))


def build(lib):
    lib.reset(seed=107)
    rnd = random.Random(107)
    R, H, T = 0.44, 0.145, 0.022
    kw = dict(steps=14, wob=0.026)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=51, **kw),
        fresh.Cake(R * 0.96, H, 0.141, -0.020, -0.014, seed=52, droop=0.011, **kw),
        fresh.Cake(R * 0.93, H * 0.96, 0.282, 0.018, 0.010, seed=53, droop=0.012, **kw),
    ]
    top = cakes[-1]

    def at(al, r, z=0.0):
        a = lib.az(al)
        return (top.cx + r * math.cos(a), top.cy + r * math.sin(a), top.top + z)

    INK = '#1C2233'
    mat = fresh.cake_mat('cake', R, top=('#E2B657', '#C8943A', '#A47226'), side=('#FAEEBC', '#F0DE98'), pit='#D2B864',
                         pore_scale=50.0, mottle=0.35)
    m = reopen(lib, mat)
    P = m.lpos()
    up = m.math('ABSOLUTE', m.sep(m.lnrm())[2])
    dots = seeds(m, P, 46.0, 0.50, patch=0.5)
    col = m.bsdf.inputs['Base Color'].links[0].from_socket
    # 구운 면에선 겉에 비친 씨라 조금 흐리다
    m.out(color=m.mix(m.math('MULTIPLY', dots, m.mixf(m.smooth(up, 0.6, 0.9), 0.92, 0.72)), col, INK))
    parts = [lib.assign(c.build(f'cake{i}', segs=64), mat) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#2E3A56', rough=0.40)))

    # 레몬 아이싱: 흰 불투명. 앞 왼쪽으로 쏠려 고였다가 되직하게 흘러내린다
    front = lib.az(-30)
    pool = fresh.puddle(front, reach=0.04, back=0.12, ph=11.0)
    runs = [(front - 0.50, 0.15, 1.0), (front - 0.22, 0.05, 1.3), (front + 0.06, 0.29, 0.85), (front + 0.34, 0.10, 1.15),
            (front + 0.56, 0.21, 0.7)]
    icing = fresh.sauce_mat('icing', '#FCF8EC', '#F3E9C6', rough=0.26, depth=0.012, glow=(1.0, 0.9, 0.6))
    im = reopen(lib, icing)
    IP = im.coords('Object')
    idots = seeds(im, IP, 34.0, 0.42, r=(0.15, 0.23), patch=0.9)
    im.out(color=im.mix(idots, im.bsdf.inputs['Base Color'].links[0].from_socket, INK), rough=im.mixf(idots, 0.26, 0.5))
    parts += fresh.sauce('icing', cakes, pool, runs, icing, w=0.033, plate=PR, thick=T, refine=0.008, embed=0.007, fine=0.006, lump=0.25, lump_scale=6.0,
                         seed=5.0, riv=dict(head=1.45))

    # 반달 레몬 둘: 뒤 오른쪽, 하나는 눕듯 기대고 하나는 그 위에 비스듬히 섬(자른 면이 아래)
    lm = lemon_mat(lib)
    for k, (al, r, z, rot, s) in enumerate((
            (118, 0.20, 0.050, (math.radians(62), math.radians(6), lib.az(8)), 1.0),
            (150, 0.14, 0.030, (math.radians(28), math.radians(-8), lib.az(-36)), 0.92))):
        ob = wedge(lib, f'lemon{k}')
        lib.place(ob, at(al, r, z), rot, (s, s, s))
        parts.append(lib.assign(ob, lm))

    # 제스트: 가늘게 말린 가닥(아이싱 위 · 레몬 곁)
    zm = lib.Mat('zest')
    zest = zm.out(color=zm.mix(zm.noise(zm.lpos(), scale=40.0), '#F6D630', '#EEC418'), rough=0.5)
    for k, (al, r, yaw, ln, curl) in enumerate(((-55, 0.17, 20, 0.15, 12.0), (0, 0.09, -70, 0.12, -17.0), (40, 0.21, 110, 0.13, 14.0),
                                                 (-100, 0.24, 60, 0.09, -22.0))):
        x0, y0, z0 = at(al, r, T + 0.004)
        pts, a = [], lib.az(yaw)
        x, y = x0, y0
        for i in range(12):
            u = i / 11
            pts.append((x, y, z0 + 0.016 * math.sin(math.pi * u) ** 2 * (1 + 0.5 * math.sin(k + 4 * u))))
            a += curl * ln / 11
            x, y = x + ln / 11 * math.cos(a), y + ln / 11 * math.sin(a)
        ob = lib.curve_tube(f'zest{k}', pts, [0.6 + 0.4 * math.sin(math.pi * i / 11) for i in range(12)], bevel_depth=0.0048)
        lib.decimate(ob, 0.45)
        parts.append(lib.assign(ob, zest))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0), quality=76,
        uv_weight={'icing': 1.2, 'lemon': 1.6, 'zest': 1.2, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'icing': 0.2, 'lemon': 0.3, 'plate': 0.3},
    )
