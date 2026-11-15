"""건조 코코넛 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 질감 · 조명은 사실적인 쪽.

구성: 짙은 청록 접시 · 넓고 얇은 밝은 황금 팬케이크 석 장 · 흰 코코넛 크림이 카메라 오른쪽 앞으로 쏠려
고였다 조금 흘러내림 · 구운 코코넛 플레이크(얇게 휜 대패밥, 가장자리만 갈색)가 가운데 왼쪽에 수북이 쌓이고
둘레로 흩어짐 · 몇 조각은 접시에 떨어짐.
"""
import math
import random

import bmesh
import bpy


import fresh


def top_z(c, x, y):
    """장 c 윗면의 (x, y) 높이"""
    th = math.atan2(y - c.cy, x - c.cx)
    rr = math.hypot(x - c.cx, y - c.cy) / c.rf(th)
    i_eq = max(range(len(c.prof)), key=lambda i: c.prof[i][0])
    z = c.prof[-1][1]
    for (r0, z0), (r1, z1) in zip(c.prof[i_eq:], c.prof[i_eq + 1:]):
        if r1 <= rr <= r0:
            z = z0 + (z1 - z0) * (r0 - rr) / max(r0 - r1, 1e-9)
            break
    return c.z0 + z + c.zf(th, rr)


def flake(lib, name, L, W, bend, twist, seed, nu=7, nv=2, t=0.004):
    """코코넛 플레이크 한 조각 — 길이 방향으로 휘고 살짝 꼬인 얇은 띠(국소 +X로 뻗고 가운데 = 원점).
    윤곽은 들쭉날쭉(부서진 조각). 정점 속성 edge(0 가운데 → 1 가장자리 = 구워진 데). 두께 t 닫힌 면"""
    bm = bmesh.new()
    vals, grid = [], []
    for side in (1.0, -1.0):
        rows = []
        for i in range(nu + 1):
            u = 2 * i / nu - 1
            w = W * (1.0 - 0.55 * abs(u) ** 2.2) * (1.0 + 0.25 * lib.n3(u * 2.5, 0.0, 0.0, seed))
            a = bend * u
            row = []
            for j in range(nv + 1):
                v = 2 * j / nv - 1
                # 원호로 휜다(반지름 = L/2/bend) + 폭 방향 오목 + 길이 따라 꼬임
                x = (L / 2) * (math.sin(a) / bend if bend else u)
                z = (L / 2) * ((1 - math.cos(a)) / bend if bend else 0.0) + 0.25 * w * v * v
                y = v * w / 2
                tw = twist * u
                y, z2 = y * math.cos(tw), z + y * math.sin(tw)
                row.append(bm.verts.new((x, y, z2 + side * t / 2)))
                vals.append(max(abs(v), abs(u) ** 3))
            rows.append(row)
        grid.append(rows)
    for rows, flip in ((grid[0], False), (grid[1], True)):
        for a, b in zip(rows, rows[1:]):
            for j in range(nv):
                q = (a[j], b[j], b[j + 1], a[j + 1])
                bm.faces.new(q[::-1] if flip else q)
    up, dn = grid
    for i in range(nu):  # 옆 테
        for j in (0, nv):
            bm.faces.new((up[i][j], up[i + 1][j], dn[i + 1][j], dn[i][j]))
    for i in (0, nu):  # 끝 테
        for j in range(nv):
            bm.faces.new((up[i][j], up[i][j + 1], dn[i][j + 1], dn[i][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.point_attr(ob, 'edge', vals)
    return ob


def flake_mat(lib, name='flake'):
    """뽀얀 흰 살 + 구워져 갈색이 된 가장자리(조각마다 구운 정도가 다르다 — 굽기 전 국소 좌표 노이즈)"""
    m = lib.Mat(name)
    P = m.coords('Object')
    toast = m.noise(P, scale=7.0, detail=2.0)
    e = m.math('ADD', m.attr('edge'), m.math('MULTIPLY', m.math('SUBTRACT', toast, 0.5), 0.9))
    col = m.ramp(e, [(0.55, '#FDF9EE'), (0.80, '#F3E3BC'), (0.97, '#DDB26A'), (1.15, '#B47A30')])
    fresh.sss(m, 0.35, (1.0, 0.9, 0.75), 0.02)
    fib = m.noise(m.mapping(m.lpos(), scale=(1, 14, 1)), scale=60.0, detail=1.0)  # 길이 방향 섬유 결
    return m.out(color=col, rough=0.62, normal=m.bump(fib, strength=0.25, distance=0.003))


def build(lib):
    lib.reset(seed=107)
    rnd = random.Random(107)
    R, H, T = 0.48, 0.118, 0.020
    kw = dict(steps=13, wob=0.03)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=51, **kw),
        fresh.Cake(R * 0.97, H, 0.115, 0.024, -0.012, seed=52, droop=0.011, **kw),
        fresh.Cake(R * 0.94, H * 0.96, 0.230, -0.014, 0.010, seed=53, droop=0.012, **kw),
    ]
    top = cakes[-1]
    cake = fresh.cake_mat('cake', R, top=('#E6B862', '#CF9A44', '#AE762A'), side=('#F8EAC4', '#EDD7A4'))
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#1E6A6C', rough=0.38)))

    def at(al, r):
        a = lib.az(al)
        return top.cx + r * math.cos(a), top.cy + r * math.sin(a)

    # 코코넛 크림: 불투명한 흰 소스. 되직해서 넓은 혀로 넘고 줄기는 짧다
    front = lib.az(30)
    pool = fresh.puddle(front, reach=0.045, back=0.13, ph=6.0)
    runs = [(front - 0.46, 0.05, 1.3), (front - 0.10, 0.20, 1.0), (front + 0.30, 0.10, 1.2), (front + 0.58, 0.03, 0.9)]
    milk = fresh.sauce_mat('cocream', '#FCF8EE', '#F1E6CC', rough=0.36, depth=0.012, glow=(1.0, 0.9, 0.75))
    parts += fresh.sauce('cocream', cakes, pool, runs, milk, w=0.036, plate=PR, thick=T, refine=0.008, lump=0.2, lump_scale=6.0,
                         seed=6.0, riv=dict(aspect=0.6, head=1.4))

    # 플레이크 무더기: 가운데에서 카메라 왼쪽으로 치우쳐 수북이, 멀어질수록 낱장으로 눕는다
    skin = flake_mat(lib)
    hx, hy = at(-60, 0.07)
    n = 62
    for k in range(n):
        if k < 44:
            a, d = rnd.uniform(0, math.tau), abs(rnd.gauss(0.0, 0.095))
        else:  # 둘레로 흩어진 낱장
            a, d = rnd.uniform(0, math.tau), rnd.uniform(0.17, 0.30)
        x, y = hx + d * math.cos(a), hy + d * math.sin(a)
        if math.hypot(x - top.cx, y - top.cy) > R * 0.80:
            continue
        mound = 0.15 * math.exp(-(d / 0.085) ** 2)
        z = top_z(top, x, y) + T * 0.6 + 0.010 + mound * rnd.uniform(0.25, 1.0)
        L = rnd.uniform(0.12, 0.21)
        ob = flake(lib, f'flake{k}', L, L * rnd.uniform(0.30, 0.50), rnd.uniform(0.3, 1.2) * rnd.choice((1, 1, -1)),
                   rnd.uniform(-0.7, 0.7), k)
        steep = 0.9 * mound / 0.15 + 0.15  # 무더기 속은 서로 기대어 선다
        lib.place(ob, (x, y, z), (rnd.uniform(-steep, steep), rnd.uniform(-steep, steep), rnd.uniform(0, math.tau)))
        parts.append(lib.assign(ob, skin))
    for al, r, s in ((-48, 0.55, 1.0), (-70, 0.52, 0.8), (62, 0.56, 0.9), (-30, 0.58, 0.7)):  # 접시에 떨어진 조각
        a = lib.az(al)
        ob = flake(lib, f'drop{al}', 0.16 * s, 0.06 * s, rnd.uniform(0.4, 1.0), rnd.uniform(-0.5, 0.5), al)
        lib.place(ob, (r * math.cos(a), r * math.sin(a), fresh.plate_z(PR, r) + 0.008), (0.0, 0.0, rnd.uniform(0, math.tau)))
        parts.append(lib.assign(ob, skin))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0), quality=76,
        ao_strength={'*': 0.55, 'flake': 0.2, 'cocream': 0.2, 'plate': 0.3},
        uv_weight={'cocream': 1.1, 'flake': 1.3, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
    )
