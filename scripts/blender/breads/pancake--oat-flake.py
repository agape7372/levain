"""귀리 플레이크 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음).

구성: 풀빛 접시 · 두툼하고 낮은 두 장(윗면에 압착 귀리가 박혀 구워져 겉이 거칠다) · 뒤 왼쪽에 숟가락으로 얹은
요거트 한 덩이 · 꿀이 앞 오른쪽으로 쏠려 고였다가 줄기 몇으로 흘러내림 · 흩뿌린 귀리 플레이크(눕고 방향 제각각,
요거트 위 · 접시에도 몇 장).
"""
import math
import random

import fresh


def reopen(lib, mat):
    """이미 지은 재질에 노드를 더 얹는다(fresh.cake_mat 겉에 박힌 것을 그릴 때)"""
    m = lib.Mat.__new__(lib.Mat)
    m.mat, m.nt = mat, mat.node_tree
    m.bsdf = m.nt.nodes['Principled BSDF']
    return m


def top_z(c, x, y):
    """Cake 윗면 높이(둘레 요철은 무시)"""
    r, th = math.hypot(x - c.cx, y - c.cy), math.atan2(y - c.cy, x - c.cx)
    pts = c.prof[len(c.prof) // 2:]
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if r1 <= r <= r0:
            return c.z0 + z0 + (z1 - z0) * ((r0 - r) / (r0 - r1) if r0 != r1 else 0.0) + c.zf(th, r)
    return c.top


def oat(lib, name, a=0.034, b=0.023, t=0.007, seed=0.0):
    """압착 귀리 한 장 — 납작한 타원, 가운데 긴 골, 가장자리는 살짝 들쭉날쭉(긴 축 = 국소 X)"""
    def rfn(th, z):
        e = 1.0 / math.sqrt(math.cos(th) ** 2 + (a / b * math.sin(th)) ** 2)
        return e * (1.0 + 0.10 * lib.n3(2 * math.cos(th), 2 * math.sin(th), 0.0, seed))

    def zfn(th, r):
        y = r * math.sin(th) * b / a
        return -0.0035 * math.exp(-(y / 0.004) ** 2) + 3.0 * (r * math.cos(th)) ** 2 * lib.n3(seed, 0.3, 0.0, 1.0)

    return lib.lathe(name, lib.superellipse_profile(a, t, n=2.4, steps=4), segs=10, rfn=rfn, zfn=zfn)


def oat_mat(lib, name='oat'):
    m = lib.Mat(name)
    P = m.lpos()
    col = m.mix(m.noise(P, scale=60.0, detail=2.0), '#F0DDB2', '#D6B67C')
    crease = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.sep(P)[1]), 0.0015, 0.006))
    col = m.mix(m.math('MULTIPLY', crease, 0.7), col, '#A9824A')
    return m.out(color=col, rough=0.88)


def build(lib):
    lib.reset(seed=85)
    rnd = random.Random(85)
    R, H, T = 0.47, 0.20, 0.018
    kw = dict(n=3.8, steps=16, wob=0.028)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=31, dome=0.014, **kw),
        fresh.Cake(R * 0.94, H * 0.95, 0.195, -0.030, 0.018, seed=32, dome=0.016, droop=0.012, **kw),
    ]
    top = cakes[-1]

    def at(al, r):
        a = lib.az(al)
        return top.cx + r * math.cos(a), top.cy + r * math.sin(a)

    # 겉: 구운 면에 박힌 귀리(밝은 타원 조각 + 그을린 테) — 윗면만
    mat = fresh.cake_mat('cake', R, top=('#CE9240', '#A86A26', '#7C4616'), side=('#F0DEB6', '#E0C690'), pit='#C4A066',
                         pore_scale=40.0, mottle=0.45)
    m = reopen(lib, mat)
    # 칸을 잡음으로 일그러뜨린다 — 그냥 보로노이 점은 동글동글한 물방울무늬로 읽혔다
    wn = m.node('ShaderNodeTexNoise')
    m.link(m.lpos(), wn.inputs['Vector'])
    wn.inputs['Scale'].default_value = 9.0
    P = m.mapping(m.vmath('ADD', m.lpos(), m.vmath('MULTIPLY', wn.outputs['Color'], (0.035, 0.035, 0.0))), scale=(1, 1, 0.15))
    up = m.smooth(m.sep(m.lnrm())[2], 0.45, 0.85)
    vd = m.voronoi(P, scale=12.0)
    keep = m.smooth(m.sep(m.voronoi(P, scale=12.0, out='Color'))[0], 0.62, 0.66)
    w = m.math('MULTIPLY', keep, up)
    flake = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(vd, 0.21, 0.27)), w)
    rim = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(vd, 0.27, 0.36)), w)
    col = m.bsdf.inputs['Base Color'].links[0].from_socket
    col = m.mix(m.math('MULTIPLY', rim, 0.55), col, '#6E3E14')
    col = m.mix(m.math('MULTIPLY', flake, 0.9), col, m.mix(m.noise(m.lpos(), scale=50.0), '#E2C48C', '#C89A58'))
    nrm = m.bump(flake, strength=0.5, distance=0.008, normal=m.bsdf.inputs['Normal'].links[0].from_socket)
    m.out(color=col, normal=nrm)
    parts = [lib.assign(c.build(f'cake{i}', segs=52), mat) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#8E9F86')))

    # 꿀: 앞 오른쪽으로 쏠린 작은 웅덩이 + 줄기 넷(길이 · 굵기 제각각)
    front = lib.az(22)
    pool = fresh.puddle(front, reach=0.03, back=0.12, ph=9.0)
    runs = [(front - 0.42, 0.07, 1.15), (front - 0.10, 0.105, 0.9), (front + 0.16, 0.11, 0.6), (front + 0.46, 0.04, 1.2)]
    honey = fresh.sauce_mat('honey', '#B4640A', '#DC961E', rough=0.10, edge=(0.1, 1.0), side_col='#F6BE4C')
    parts += fresh.sauce('honey', cakes, pool, runs, honey, w=0.024, plate=PR, thick=T, refine=0.008, embed=0.006, segs=52, lump=0.3,
                         lump_scale=7.0, riv=dict(head=1.55))

    # 요거트: 뒤 왼쪽에 숟가락으로 얹은 한 덩이 — 한 바퀴 감긴 골 + 한쪽으로 끌린 꼬리
    yx, yy = at(-150, 0.15)
    YR, YH = 0.175, 0.095

    def y_r(th, z):
        return 1.0 + 0.07 * lib.n3(1.5 * math.cos(th), 1.5 * math.sin(th), z * 9.0, 4.0) + 0.10 * math.cos(th - 0.8)

    def y_z(th, r):
        u = r / YR
        swirl = 0.030 * math.sin(th - u * 7.5) * math.sin(math.pi * min(u, 1.0)) ** 1.2
        # 숟가락을 떼며 끌린 봉우리: 가운데서 비낀 자리
        peak = 0.034 * math.exp(-(math.hypot(r * math.cos(th) - 0.045, r * math.sin(th) + 0.02) / 0.04) ** 2)
        return swirl + peak

    yog = lib.lathe('yogurt', lib.superellipse_profile(YR, YH, n=2.3, steps=18), segs=36, rfn=y_r, zfn=y_z)
    lib.place(yog, (yx, yy, top_z(top, yx, yy) - YH * 0.36), (math.radians(5), math.radians(-4), lib.az(40)))
    ym = lib.Mat('yogurt')
    fresh.sss(ym, 0.5, (1.0, 0.92, 0.82), 0.03)
    parts.append(lib.assign(yog, ym.out(color=ym.mix(ym.noise(ym.lpos(), scale=7.0, detail=2.0), '#FFFCF4', '#F2EBDA'), rough=0.34)))

    # 흩뿌린 귀리: 윗면 왼쪽 앞 초승달 자리에 몰리고, 요거트 위 · 접시에 몇 장
    om = oat_mat(lib)
    spots = []
    for _ in range(44):
        al, r = rnd.gauss(-80, 30), rnd.uniform(0.06, 0.37)
        x, y = at(al, r)
        if math.hypot(x - yx, y - yy) < YR * 0.95:
            continue
        spots.append((x, y, top_z(top, x, y) + 0.004, 0.32))
    for al, r in ((150, 0.07), (-80, 0.08), (-130, 0.11)):
        a = lib.az(al)
        x, y = yx + r * math.cos(a), yy + r * math.sin(a)
        spots.append((x, y, top_z(top, x, y) + YH * 0.66 - 0.30 * r * r / YR, 0.45))
    for al, r in ((-64, 0.535), (-50, 0.565), (-41, 0.52), (64, 0.55), (-100, 0.545), (75, 0.52)):
        a = lib.az(al)
        spots.append((r * math.cos(a), r * math.sin(a), fresh.plate_z(PR, r) + 0.006, 0.15))
    for i, (x, y, z, tilt) in enumerate(spots):
        s = rnd.uniform(0.85, 1.25)
        ob = oat(lib, f'oat{i}', seed=float(i))
        lib.place(ob, (x, y, z), (rnd.uniform(-tilt, tilt), rnd.uniform(-tilt, tilt), rnd.uniform(0, math.tau)),
                  (s, s * rnd.uniform(0.85, 1.1), s))
        parts.append(lib.assign(ob, om))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0, clear={'honey': dict(absorb='#FFF050', density=45.0, base='#FFF4D6')}), quality=76,
        uv_weight={'honey': 1.1, 'yogurt': 1.2, 'oat': 1.4, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'yogurt': 0.15, 'oat': 0.35, 'plate': 0.3},
    )
