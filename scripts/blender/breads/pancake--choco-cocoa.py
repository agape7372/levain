"""코코아 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 질감 · 조명은 사실적인 쪽.

구성: 분홍 접시 · 반죽에 코코아를 넣어 짙은 도톰한 팬케이크 석 장(윗면 검은 갈색, 옆 띠 진갈색 속살) ·
윤나는 가나슈가 카메라 왼쪽 앞으로 쏠려 고였다 굵게 흘러내림 · 뒤 오른쪽에 손으로 짠 휘핑크림,
그 위에 체로 친 코코아 가루 · 깎아 말린 초콜릿 조각 몇.
"""
import math
import random

import bmesh
import bpy

import fresh


def curl(lib, name, L=0.10, W=0.11, r0=0.011, turns=1.5, nu=18, seed=0.0):
    """대패로 깎은 초콜릿 — 안으로 말린 얇은 띠(축 = 국소 Y, 폭 W). 두께가 있는 닫힌 면"""
    bm = bmesh.new()
    t = 0.0035
    rows = []
    for i in range(nu + 1):
        u = i / nu
        a = turns * math.tau * u
        r = r0 + (L / (turns * math.tau)) * u * 0.9  # 풀리면서 반지름이 커진다
        w = W * (0.55 + 0.45 * math.sin(math.pi * min(1.0, u * 1.3 + 0.12))) * (1.0 + 0.12 * lib.n3(u * 5, 0.0, 0.0, seed))
        skew = 0.12 * W * u  # 비스듬히 말린다
        row = []
        for rr in (r, r + t):
            for v in (-0.5, 0.5):
                row.append(bm.verts.new((rr * math.cos(a), v * w + skew, rr * math.sin(a))))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for i, j in ((0, 1), (1, 3), (3, 2), (2, 0)):
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me))


def build(lib):
    lib.reset(seed=96)
    rnd = random.Random(96)
    R, H, T = 0.45, 0.155, 0.024
    kw = dict(steps=13, wob=0.028)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=41, **kw),
        fresh.Cake(R * 0.96, H, 0.151, -0.022, -0.006, seed=42, droop=0.012, **kw),
        fresh.Cake(R * 0.93, H * 0.95, 0.302, 0.016, 0.014, seed=43, droop=0.012, **kw),
    ]
    top = cakes[-1]

    def at(al, r, z=0.0):  # 윗장 가운데에서 카메라 기준 방위 al 로 r
        a = lib.az(al)
        return (top.cx + r * math.cos(a), top.cy + r * math.sin(a), top.top + z)

    kx, ky, _ = at(120, 0.13)  # 크림 자리(뒤 오른쪽)
    cocoa = ((kx - 0.03, ky - 0.05, top.top + 0.17), 0.20, 0.55, "#5A2C12", 0.6)
    cake = fresh.cake_mat('cake', R, top=('#4E2A16', '#371B0C', '#241006'), side=('#8A5630', '#734222'),
                          pit='#4A2810', mottle=0.35, gold_w=0.5)
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.36
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#EFC9BC')))

    # 가나슈: 되직해서 굵고 둥글게, 길이는 제각각
    front = lib.az(-38)
    pool = fresh.puddle(front, reach=0.04, back=0.09, ph=5.0)
    runs = [(front - 0.50, 0.14, 1.25), (front - 0.16, 0.24, 1.0), (front + 0.14, 0.06, 1.35), (front + 0.44, 0.22, 0.85),
            (front + 0.66, 0.04, 1.0)]
    gan = fresh.sauce_mat('ganache', '#2C1409', '#5C3016', rough=0.42, depth=0.010, glow=(1.0, 0.45, 0.2))
    parts += fresh.sauce('ganache', cakes, pool, runs, gan, w=0.034, plate=PR, thick=T, refine=0.008,
                         seed=2.0, riv=dict(aspect=0.6, head=1.45))

    cream = fresh.rosette('cream', r0=0.15, height=0.24, tiers=2.6, tube=0.048, segs=44, rings=44, soft=1.0)
    lib.place(cream, (kx, ky, top.top + 0.012), (0.0, 0.0, lib.az(140)))
    parts.append(lib.assign(cream, fresh.cream_mat('cream', dust=cocoa)))

    # 깎은 초콜릿: 크림 발치와 가나슈 위에 몇 조각, 접시에 하나
    m = lib.Mat('shave')
    P = m.lpos()
    shave = m.out(color=m.mix(m.noise(P, scale=60.0, detail=2.0), '#3A1C0E', '#5A3018'),
                  rough=m.mixf(m.noise(P, scale=25.0), 0.36, 0.48))
    spots = [(at(62, 0.07, T + 0.030), 1.5), (at(20, 0.20, T + 0.026), 1.25), (at(-58, 0.17, T + 0.026), 1.4),
             (at(-100, 0.27, T + 0.020), 1.0), (at(165, 0.30, 0.024), 1.15), (at(96, 0.30, 0.022), 1.0)]
    for k, (loc, s) in enumerate(spots):
        ob = curl(lib, f'shave{k}', turns=rnd.uniform(1.1, 1.8), r0=rnd.uniform(0.009, 0.013), seed=k)
        lib.place(ob, loc, (rnd.uniform(-0.25, 0.25), rnd.uniform(0, math.tau), rnd.uniform(0, math.tau)), (s, s, s))
        parts.append(lib.assign(ob, shave))
    a = lib.az(48)
    ob = curl(lib, 'shave_plate', turns=1.2, seed=9.0)
    lib.place(ob, (0.56 * math.cos(a), 0.56 * math.sin(a), fresh.plate_z(PR, 0.56) + 0.026), (0.2, 0.4, lib.az(20)))
    parts.append(lib.assign(ob, shave))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0), quality=76,
        ao_strength={'*': 0.5, 'cream': 0.15, 'plate': 0.3},
        uv_weight={'ganache': 1.2, 'cream': 1.4, 'shave': 1.4, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
    )
