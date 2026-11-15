"""팥 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 도라야키로 풀었다.

구성: 온전한 도라야키 한 개(고른 밤색 겉 + 옅은 테) 위에, 반으로 가른 한 쪽을 단면이 카메라를 보게
기대어 얹음. 단면 = 위아래 카스텔라 속살 + 가운데 통팥 소(알이 박힌 짙은 팥, 살짝 볼록) · 흘린 팥알 몇.
"""
import math
import random

import bmesh
import bpy
from mathutils import Euler, Vector

import fresh

R, RIM, TS = 0.48, 0.034, 0.072  # 반지름 · 테 굵기 · 카스텔라 두께


def zo(r, h):
    """겉 윤곽 높이 — 가운데가 봉긋하고 가장자리는 둥근 테"""
    u = min(abs(r) / R, 1.0)
    z = h * (1.0 - u ** 2.6) ** 0.55
    d = abs(r) - (R - RIM)
    if d > 0:
        z = max(z, math.sqrt(max(RIM * RIM - d * d, 0.0)))
    return z


def shell(lib, name, h_top, h_bot, seed, theta0=0.0, theta1=math.tau, segs=64):
    rs = [R * math.sin(math.pi / 2 * k / 16) ** 0.8 for k in range(17)]
    prof = [(r, -zo(r, h_bot)) for r in rs[:-1]] + [(R, 0.0)] + [(r, zo(r, h_top)) for r in reversed(rs[:-1])]
    rnd = random.Random(seed)
    p1, p2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)
    ob = lib.lathe(name, prof, segs=segs, theta0=theta0, theta1=theta1,
                   rfn=lambda th, z: 1.0 + 0.012 * math.sin(2 * th + p1) + 0.008 * math.sin(5 * th + p2)
                   - 0.012 * math.exp(-(z / 0.008) ** 2))  # 두 장이 맞붙은 솔기
    lib.orient_faces(ob, lambda c: c)
    return ob


def sheet(lib, name, cols, vals=None, attr=None):
    """기둥마다 [(x, y, z)] → 격자 면(국소 −Y를 본다)"""
    bm = bmesh.new()
    grid = [[bm.verts.new(p) for p in col] for col in cols]
    for a, b in zip(grid, grid[1:]):
        for j in range(len(a) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.orient_faces(ob, lambda c: Vector((0, -1, 0)))
    if attr:
        lib.point_attr(ob, attr, vals)
    return ob


def build(lib):
    lib.reset(seed=74)
    rnd = random.Random(74)
    HT, HB = 0.13, 0.10       # 온전한 것: 위 봉긋 · 아래는 눌려 납작
    GT, GB = 0.215, 0.13      # 가른 것: 소를 넉넉히, 바닥은 납작(얹었을 때 양 끝이 덜 뜬다)

    skin = fresh.cake_mat('skin', R, top=('#C98C3C', '#B37024', '#9A5A1A'), side=('#EDCB86', '#DDB064'),
                          pit='#C89A52', pore_scale=80.0, mottle=0.6, ring_w=0.0, rough=0.8,
                          brand=(*(lib.horiz(lib.az(-18)) * 0.31)[:2], 0.085))
    whole = shell(lib, 'whole', HT, HB, seed=1)
    lib.place(whole, (0.0, 0.0, HB))
    parts = [lib.assign(whole, skin)]

    # ── 가른 반쪽(국소: 단면 = XZ 평면, 몸은 +Y) ──
    half = [lib.assign(shell(lib, 'half', GT, GB, seed=2, theta0=0.0, theta1=math.pi, segs=40), skin)]
    n = 44
    xs = [R * math.sin(math.pi * (i / n - 0.5)) for i in range(n + 1)]

    def inner(x, h):
        return max(0.0, zo(x, h) - TS)

    for sgn, h, nm in ((1, GT, 'cut_top'), (-1, GB, 'cut_bot')):
        cols, vals = [], []
        for x in xs:
            o, i = zo(x, h), inner(x, h)
            lip = min(0.008, (o - i) * 0.3)
            cols.append([(x, 0.0, sgn * z) for z in (i, (i + o) / 2, o - lip, o)])
            vals += [0.0, 0.0, 0.0, 1.0]
        half.append(sheet(lib, nm, cols, vals, 'skin'))
    crumb = lib.Mat('crumb')
    P = crumb.lpos()
    hole = crumb.math('SUBTRACT', 1.0, crumb.smooth(crumb.voronoi(P, scale=58.0), 0.13, 0.24))
    ccol = crumb.mix(crumb.noise(P, scale=14.0, detail=2.0), '#F2D894', '#E6C276')
    ccol = crumb.mix(crumb.math('MULTIPLY', hole, 0.8), ccol, '#CFA050')
    ccol = crumb.mix(crumb.smooth(crumb.attr('skin'), 0.3, 0.8), ccol, '#A8621E')
    crumb.out(color=ccol, rough=0.9, normal=crumb.bump(crumb.math('MULTIPLY', hole, -1.0), strength=0.4, distance=0.006))
    for ob in half[1:]:
        lib.assign(ob, crumb.mat)

    # 팥소: 단면 밖으로 볼록, 울퉁불퉁
    def bulge(x, z):
        zt, zb = inner(x, GT), inner(x, GB)
        lim = zt if z >= 0 else zb
        if lim < 1e-4:
            return 0.0
        v = min(1.0, abs(z) / lim)
        return (0.034 * (1 - v * v) ** 0.5 * min(1.0, (zt + zb) / 0.08)) * (1.0 + 0.5 * lib.n3(x * 16, z * 16, 0.0, 2.0))

    cols = []
    for x in xs:
        zt, zb = inner(x, GT), inner(x, GB)
        col = []
        for v in (-1.0, -0.82, -0.5, -0.17, 0.17, 0.5, 0.82, 1.0):
            z = v * (zt if v > 0 else zb)
            col.append((x, -bulge(x, z) if abs(v) < 1 else 0.0, z))
        cols.append(col)
    half.append(lib.assign(sheet(lib, 'anko', cols), fresh.anko_mat()))

    # 통팥 알: 소에 반쯤 묻혀 윤이 난다
    bean, one_bean = fresh.bean_mat(), fresh.bean
    for k in range(18):  # 반 넘게 묻는다(중심이 겉보다 안쪽) — 다 드러난 알은 박아 놓은 구슬로 읽혔다
        x = rnd.uniform(-0.39, 0.39)
        zt, zb = inner(x, GT), inner(x, GB)
        z = rnd.uniform(-zb * 0.75, zt * 0.75)
        s = rnd.uniform(0.75, 1.25)
        ob = lib.place(one_bean(f'bean{k}'), (x, -bulge(x, z) + 0.009 * s, z),
                       (rnd.uniform(-0.3, 0.3), rnd.uniform(0, math.tau), 0.0), (s, s, s))
        half.append(lib.assign(ob, bean))

    # 반쪽을 놓는다: 단면(국소 −Y)이 카메라를 보고, 뒤로 젖혀 온전한 것 등에 기댄다
    rot = Euler((math.radians(-15), 0.0, lib.az(90 + 24)), 'XYZ')
    M = rot.to_matrix()
    fwd = lib.horiz(lib.az(26))
    base = Vector((fwd.x * 0.07, fwd.y * 0.07, 0.0))
    need = -1e9
    for v in half[0].data.vertices:  # 온전한 것 윗면에 닿을 때까지 내린다
        p = M @ v.co + base
        r = math.hypot(p.x, p.y)
        if r < R:
            need = max(need, HB + zo(r, HT) - p.z)
    loc = base + Vector((0.0, 0.0, need - 0.008))
    for ob in half:
        if ob.name.startswith('bean'):  # 알은 제 회전을 먼저 굳힌 뒤 반쪽 변환을 따른다
            bpy.context.view_layer.update()
            lib.bake_transform(ob)
        lib.place(ob, loc, rot)
    parts += half

    # 바닥에 흘린 팥알
    for al, r in ((30, 0.55), (50, 0.58), (41, 0.63)):
        ob = one_bean(f'loose{al}')
        a = lib.az(al)
        lib.place(ob, (r * math.cos(a), r * math.sin(a), 0.015), (math.pi / 2, 0.0, rnd.uniform(0, math.tau)), (1.2, 1.2, 1.2))
        parts.append(lib.assign(ob, bean))

    return parts, dict(
        lit=dict(ao=0.6),
        uv_weight={'crumb': 1.5, 'anko': 2.0, 'bean': 1.5}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.6, 'skin': 0.45, 'crumb': 0.3, 'anko': 0.5, 'bean': 0.4},
        grade={'anko': 0.0, 'bean': 0.0},
    )
