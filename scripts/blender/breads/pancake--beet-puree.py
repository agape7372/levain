"""비트 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 질감 · 조명은 사실적인 쪽.

구성: 옅은 회색 접시 · 속살이 분홍 · 자홍인 얇은 팬케이크 넉 장(구운 윗면은 붉은 갈색) ·
숟가락으로 얹은 요거트 한 덩이(가운데에서 뒤 오른쪽, 숟가락 자국 + 한쪽으로 쏠린 끝) ·
진한 자홍 비트 소스가 왼쪽 앞으로 조금 고였다 흘러내림 · 깍둑 썬 비트 몇 알 · 민트 잎 둘.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import fresh


def dollop(lib, name, r=0.165, h=0.125, seed=1.0):
    """숟가락으로 떠 얹은 요거트 — 한쪽이 높고, 숟가락이 돌아 나간 나선 골, 끝이 살짝 솟아 꺾인다"""
    px, py = 0.045, -0.02  # 솟은 끝(가운데에서 비켜남)

    def rfn(th, z):
        return 1.0 + 0.11 * lib.n3(1.2 * math.cos(th), 1.2 * math.sin(th), z * 5.0, seed) \
            + 0.05 * lib.n3(3.1 * math.cos(th), 3.1 * math.sin(th), z * 9.0, seed + 2.0)

    def zfn(th, rr):
        u = rr / r
        x, y = rr * math.cos(th), rr * math.sin(th)
        swirl = -0.020 * math.sin(th - u * 6.5 + 0.8) * u * (1.0 - u ** 4)
        peak = 0.055 * math.exp(-((x - px) ** 2 + (y - py) ** 2) / 0.0022)
        lean = 0.020 * u * math.cos(th - 2.2) * (1.0 - u ** 6)
        return swirl + peak + lean

    return lib.lathe(name, lib.superellipse_profile(r, h, n=2.3, steps=16), segs=44, rfn=rfn, zfn=zfn)


def yogurt_mat(lib, stain):
    """되직한 요거트 — 뽀얀 흰색. 아래 가장자리엔 비트 물이 옅게 번진다"""
    m = lib.Mat('yogurt')
    P = m.lpos()
    col = m.mix(m.noise(P, scale=9.0, detail=2.0), '#FFFDF8', '#F4EFE6')
    z = m.sep(P)[2]
    wet = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(
        m.math('ADD', z, m.math('MULTIPLY', m.noise(P, scale=12.0, detail=2.0), 0.03)), 0.035, 0.075)), 0.55)
    col = m.mix(wet, col, stain)
    fresh.sss(m, 0.45, (1.0, 0.85, 0.85), 0.03)
    return m.out(color=col, rough=0.34)


def cube(lib, name, a, seed, cuts=2, k=7.0):
    """깍둑 썬 비트 — 모서리가 선 작은 주사위"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co * 2.0
        n = (abs(x) ** k + abs(y) ** k + abs(z) ** k) ** (1.0 / k)
        w = a / 2 * (1.0 + 0.05 * lib.n3(x * 1.3, y * 1.3, z * 1.3, seed)) / n
        v.co = Vector((x * w, y * w * 0.92, z * w * 0.85))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me))


def beet_mat(lib):
    """삶은 비트 — 짙은 자홍에 옅은 나이테 줄, 물기 도는 윤"""
    m = lib.Mat('beet')
    P = m.lpos()
    ringv = m.math('SINE', m.math('MULTIPLY', m.math('ADD', m.vmath('LENGTH', m.vmath('MULTIPLY', P, (1, 0.6, 1))),
                                                     m.math('MULTIPLY', m.noise(P, scale=20.0), 0.01)), 260.0))
    col = m.mix(m.noise(P, scale=30.0, detail=2.0), '#7A0E46', '#A01858')
    col = m.mix(m.math('MULTIPLY', m.smooth(ringv, 0.3, 0.9), 0.4), col, '#C43A78')
    fresh.sss(m, 0.3, (1.0, 0.2, 0.4), 0.02)
    return m.out(color=col, rough=0.3)


def build(lib):
    lib.reset(seed=107)
    rnd = random.Random(107)
    R, H, T = 0.44, 0.112, 0.020
    kw = dict(steps=13, wob=0.032)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=51, **kw),
        fresh.Cake(R * 0.97, H, 0.109, 0.024, -0.010, seed=52, droop=0.010, **kw),
        fresh.Cake(R * 0.99, H, 0.218, -0.020, 0.014, seed=53, droop=0.010, **kw),
        fresh.Cake(R * 0.93, H * 0.96, 0.327, 0.010, 0.012, seed=54, droop=0.012, **kw),
    ]
    top = cakes[-1]
    base = top.top + T - 0.006
    cake = fresh.cake_mat('cake', R, top=('#B8664A', '#96422E', '#6C2420'), side=('#DC6492', '#C4467C'), pit='#9A2A60',
                          pore_scale=48.0)
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#DCDEDC')))

    def at(al, r, z=0.0):
        a = lib.az(al)
        return (top.cx + r * math.cos(a), top.cy + r * math.sin(a), base + z)

    # 비트 소스: 왼쪽 앞으로 쏠려 조금 고였다 흐른다(되직한 퓌레 — 짧고 굵게)
    front = lib.az(-32)
    pool = fresh.puddle(front, reach=0.035, back=0.07, ph=6.0)
    runs = [(front - 0.46, 0.14, 1.1), (front - 0.15, 0.05, 1.3), (front + 0.14, 0.24, 0.9), (front + 0.48, 0.08, 1.15)]
    puree = fresh.sauce_mat('puree', '#6E0A3C', '#C0246C', rough=0.22, lump_bump=0.25)
    parts += fresh.sauce('puree', cakes, pool, runs, puree, w=0.030, plate=PR, thick=T, refine=0.008, lump=0.6, seed=4.0,
                         riv=dict(head=1.4))

    # 요거트: 가운데에서 뒤 오른쪽. 반쯤 묻어 얹는다
    yx, yy, _ = at(120, 0.085)
    yog = dollop(lib, 'yogurt')
    lib.place(yog, (yx, yy, base - 0.034), (0.0, 0.0, lib.az(-40)))
    parts.append(lib.assign(yog, yogurt_mat(lib, '#EE9CC0')))

    # 깍둑 비트: 요거트 앞 · 소스 위에 흩어진다 + 접시에 하나
    beet = beet_mat(lib)
    for k, (al, r, s, z) in enumerate(((-70, 0.20, 1.45, 0.0), (-22, 0.12, 1.2, 0.0), (8, 0.25, 1.3, 0.0),
                                       (40, 0.27, 0.95, 0.0))):
        ob = cube(lib, f'beet{k}', 0.062 * s, seed=30.0 + k)
        x, y, zz = at(al, r, z)
        lib.place(ob, (x, y, zz + 0.062 * s * 0.42 - 0.004), (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0, 6.28)))
        parts.append(lib.assign(ob, beet))
    a = lib.az(-58)
    ob = cube(lib, 'beet_p', 0.08, seed=39.0)
    lib.place(ob, ((R + 0.09) * math.cos(a), (R + 0.09) * math.sin(a), 0.036), (0.0, 0.0, 1.0))
    parts.append(lib.assign(ob, beet))

    # 민트: 요거트 왼쪽 어깨에 꽂힌 잎 둘
    green = fresh.leaf_mat('mint')
    lx, ly, _ = at(165, 0.03)
    for k, (yaw, pitch, s) in enumerate(((-140, 30, 1.35), (-60, 42, 1.05))):
        ob = fresh.leaf(f'mint{k}')
        lib.place(ob, (lx, ly, base + 0.075), (rnd.uniform(-0.3, 0.3), -math.radians(pitch), lib.az(yaw)), (s, s, s))
        parts.append(lib.assign(ob, green))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0), quality=76,
        uv_weight={'puree': 1.1, 'yogurt': 1.3, 'beet': 1.3, 'mint': 1.5, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'yogurt': 0.15, 'plate': 0.3},
    )
