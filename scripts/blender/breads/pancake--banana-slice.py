"""바나나 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 질감 · 조명은 사실적인 쪽.

구성: 흰 접시 · 도톰한 팬케이크 석 장 · 캐러멜 소스가 카메라 오른쪽 앞으로 쏠려 고였다 흘러내림 ·
비스듬히 썬 바나나 조각이 왼쪽 뒤에서 앞으로 기왓장처럼 겹쳐 눕고(단면 = 크림색 살 + 세 갈래 씨방 + 잔 씨점),
따로 누운 조각 둘 · 접시에 떨어진 한 조각 · 호두 조각 몇.
"""
import math
import random

from mathutils import Matrix, Vector

import fresh

RB, TH = 0.082, 0.032  # 바나나 조각 반지름 · 두께


def slice_ob(lib, name, seed):
    ob = lib.lathe(name, lib.superellipse_profile(RB, TH, n=3.6, steps=8), segs=22,
                   rfn=lambda th, z: 1.0 + 0.025 * lib.n3(math.cos(th) * 1.5, math.sin(th) * 1.5, 0.0, seed))
    ob.data.transform(Matrix.Translation((0.0, 0.0, -TH / 2)))
    return ob


def banana_mat(lib, dust=None):
    """단면: 크림색 살 → 가운데 세 갈래 씨방(조금 짙고 비친다) + 잔 씨점. 옆 띠는 조금 짙은 노랑"""
    m = lib.Mat('banana')
    P = m.lpos()
    x, y, z = m.sep(P)
    face = m.smooth(m.math('ABSOLUTE', m.sep(m.lnrm())[2]), 0.50, 0.88)
    rr = m.math('DIVIDE', m.vmath('LENGTH', m.vmath('MULTIPLY', P, (1, 1, 0))), RB)
    ang = m.math('ARCTAN2', y, x)
    n_fine = m.noise(P, scale=42.0, detail=2.0)
    lobe = m.math('ADD', m.math('MULTIPLY', m.math('COSINE', m.math('MULTIPLY', ang, 3.0)), 0.10), 0.34)
    d = m.math('SUBTRACT', m.math('ADD', rr, m.math('MULTIPLY', m.math('SUBTRACT', n_fine, 0.5), 0.14)), lobe)
    core = m.math('SUBTRACT', 1.0, m.smooth(d, -0.07, 0.05))
    flesh = m.mix(m.noise(P, scale=22.0, detail=2.0), '#FBEFC2', '#F3DF9A')
    # 살의 방사 결: 씨방에서 껍질 쪽으로 뻗는 옅은 줄
    ray = m.smooth(m.noise(m.combine(m.math('MULTIPLY', m.math('COSINE', ang), 9.0),
                                     m.math('MULTIPLY', m.math('SINE', ang), 9.0), 0.0), scale=1.6, detail=2.0), 0.42, 0.66)
    flesh = m.mix(m.math('MULTIPLY', m.math('MULTIPLY', ray, m.smooth(rr, 0.35, 0.6)), 0.22), flesh, '#E9CF86')
    col = m.mix(m.math('MULTIPLY', core, 0.8), flesh, '#E2BE6A')
    # 세 갈래 가운데 금(씨방 사이 벽)
    slit = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(
        m.math('MULTIPLY', m.math('ABSOLUTE', m.math('SINE', m.math('MULTIPLY', ang, 1.5))), rr), 0.0, 0.035)),
        m.math('SUBTRACT', 1.0, m.smooth(rr, 0.16, 0.30)))
    col = m.mix(m.math('MULTIPLY', slit, 0.55), col, '#B88C40')
    seed = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(P, scale=6.0 / RB), 0.13, 0.26))
    seed = m.math('MULTIPLY', seed, m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, -0.16, -0.06)), m.smooth(rr, 0.07, 0.14)))
    col = m.mix(m.math('MULTIPLY', seed, 0.9), col, '#54341A')
    col = m.mix(m.math('MULTIPLY', m.smooth(rr, 0.84, 0.99), 0.45), col, '#DDBB62')
    side = m.mix(m.noise(m.mapping(P, scale=(1, 1, 0.15)), scale=60.0, detail=2.0), '#EFD78C', '#E0BF68')
    col = m.mix(face, side, col)
    rough = 0.5
    fresh.sss(m, 0.35, (1.0, 0.85, 0.5), 0.02)
    if dust:
        col, w = fresh.sugar(m, col, *dust)
        rough = m.mixf(w, 0.5, 0.95)
    return m.out(color=col, rough=rough, normal=m.bump(m.math('ADD', n_fine, m.math('MULTIPLY', seed, -1.5)), strength=0.25, distance=0.004))


def walnut_mat(lib):
    """쪼갠 호두 — 옅은 황갈색 살에 짙은 속껍질 얼룩, 깊은 주름"""
    m = lib.Mat('walnut')
    P = m.lpos()
    crease = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(P, scale=22.0, feature='DISTANCE_TO_EDGE'), 0.0, 0.10))
    col = m.ramp(m.noise(P, scale=16.0, detail=3.0), [(0.3, '#8E5E30'), (0.5, '#BE8E54'), (0.72, '#DDB680')])
    col = m.mix(m.math('MULTIPLY', crease, 0.8), col, '#4E2C12')
    return m.out(color=col, rough=0.6, normal=m.bump(m.math('MULTIPLY', crease, -1.0), strength=0.9, distance=0.012))


def nut_ob(lib, name, seed):
    """울퉁불퉁하게 쪼개진 호두 한 조각"""
    return lib.lathe(name, lib.superellipse_profile(0.05, 0.062, n=2.5, steps=10), segs=18,
                     rfn=lambda th, z: 1.0 + 0.26 * lib.n3(2.0 * math.cos(th), 2.0 * math.sin(th), z * 30.0, seed)
                     + 0.10 * lib.n3(5.0 * math.cos(th), 5.0 * math.sin(th), z * 70.0, seed + 3.0))


def build(lib):
    lib.reset(seed=85)
    rnd = random.Random(85)
    R, H, T = 0.45, 0.14, 0.022
    kw = dict(steps=13, wob=0.03)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=31, **kw),
        fresh.Cake(R * 0.98, H, 0.136, -0.018, 0.012, seed=32, droop=0.012, **kw),
        fresh.Cake(R * 0.94, H * 0.96, 0.272, 0.016, -0.008, seed=33, droop=0.012, **kw),
    ]
    top = cakes[-1]
    base = top.top + T - 0.006
    cake = fresh.cake_mat('cake', R)
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.34
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#FBF7EF')))

    # 캐러멜: 카메라 오른쪽 앞으로 쏠린다(바나나 줄은 왼쪽 · 뒤)
    front = lib.az(24)
    pool = fresh.puddle(front, reach=0.035, back=0.13, ph=3.0)
    runs = [(front - 0.55, 0.07, 1.15), (front - 0.26, 0.19, 0.85), (front + 0.06, 0.11, 1.1), (front + 0.40, 0.22, 0.7),
            (front + 0.62, 0.04, 1.2)]
    mat = fresh.sauce_mat('caramel', '#8A4408', '#C67A1C', rough=0.12, edge=(0.1, 1.0), side_col='#E8AE50')
    parts += fresh.sauce('caramel', cakes, pool, runs, mat, w=0.026, plate=PR, thick=T, refine=0.008, embed=0.004, segs=52, lump=0.3,
                         lump_scale=7.0, seed=1.0, riv=dict(head=1.55))

    # 바나나: 호를 따라 기왓장처럼 겹친다 — 앞 조각 등에 기대 눕고, 방향 · 기울기는 제각각
    ban = banana_mat(lib)

    def put(name, loc, normal, heading, s=1.0):
        ob = slice_ob(lib, name, rnd.uniform(0, 9))
        ob.matrix_world = (Matrix.Translation(loc) @ lib.frame(normal, lib.horiz(heading))
                           @ Matrix.Diagonal((1.32 * s, s, s, 1.0)))  # 비스듬히 썰어 길쭉하다
        parts.append(lib.assign(ob, ban))

    n_row = 6
    for i in range(n_row):
        t = i / (n_row - 1)
        al = math.radians(-168 + 122 * t) + rnd.uniform(-0.05, 0.05)
        a = lib.CAM + al
        r = 0.20 + 0.035 * math.sin(t * 2.6) + rnd.uniform(-0.012, 0.012)
        tilt = math.radians(6 if i == 0 else rnd.uniform(20, 34))
        tang = Vector((math.sin(a), -math.cos(a), 0.0))  # 앞 조각 쪽(호를 거슬러)
        normal = Vector((0, 0, 1)) * math.cos(tilt) - tang * math.sin(tilt)
        s = rnd.uniform(0.9, 1.08)
        z = base + TH / 2 + RB * 1.2 * s * math.sin(tilt) * 0.86
        put(f'ban{i}', (top.cx + r * math.cos(a), top.cy + r * math.sin(a), z), normal, a + rnd.uniform(-0.5, 0.5), s)
    # 줄에서 떨어져 누운 둘 + 접시에 떨어진 하나
    a = lib.az(-28)
    put('ban_a', (top.cx + 0.10 * math.cos(a), top.cy + 0.10 * math.sin(a), base + TH / 2 + 0.004),
        Vector((0.06, -0.05, 1.0)), lib.az(40), 1.0)
    a = lib.az(-66)
    put('ban_b', (top.cx + 0.115 * math.cos(a), top.cy + 0.115 * math.sin(a), base + TH * 1.5 + 0.022),
        Vector((math.cos(a) * 0.42, math.sin(a) * 0.42, 1.0)), lib.az(-20), 0.94)
    a = lib.az(-48)
    put('ban_p', ((R + 0.105) * math.cos(a), (R + 0.105) * math.sin(a), TH / 2 + 0.004),
        Vector((math.cos(a) * 0.10, math.sin(a) * 0.10, 1.0)), lib.az(70), 0.96)

    # 호두: 쪼갠 조각 몇(크기 제각각)
    nut = walnut_mat(lib)
    for k, (al, r, s, onplate) in enumerate(((8, 0.05, 1.0, 0), (52, 0.20, 0.8, 0), (-8, 0.25, 0.7, 0), (118, 0.16, 0.9, 0),
                                              (60, R + 0.09, 0.85, 1))):
        a = lib.az(al)
        ob = nut_ob(lib, f'nut{k}', 10.0 + k)
        z0 = 0.004 if onplate else base
        cx, cy = (0.0, 0.0) if onplate else (top.cx, top.cy)
        lib.place(ob, (cx + r * math.cos(a), cy + r * math.sin(a), z0 + 0.016 * s),
                  (rnd.uniform(0.9, 2.2), rnd.uniform(-0.6, 0.6), rnd.uniform(0, math.tau)), (1.25 * s, 0.9 * s, s))
        parts.append(lib.assign(ob, nut))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0, clear={'caramel': dict(absorb='#F6D444', density=60.0, base='#FFF2D6')}), quality=76,
        uv_weight={'caramel': 1.1, 'banana': 1.5, 'walnut': 1.2, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'banana': 0.3, 'plate': 0.3},
    )
