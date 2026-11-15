"""초코칩 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음). 질감 · 조명은 사실적인 쪽.

구성(넷째 판): 옅은 하늘빛 접시 · 금빛 팬케이크 넉 장 · 밀크 초콜릿 소스가 카메라 쪽으로 쏠려 넓게 고였다
굵은 줄기로 흘러내림 · 뒤에 손으로 짠 휘핑크림 · 크림에 기대 꽂은 판 초콜릿 조각 둘.
칩은 박지 않는다 — 「초콜릿」 자체를 내세운다(코코아 팬케이크와는 금빛 장 · 판 초콜릿으로 갈린다).

반려된 판(사용자): ① 맑은 시럽 주황 판 + 옆 띠의 검은 덩이 + 뭉친 칩 더미 「식욕이 감퇴」
② 큰 칩만 흩음 「초코칩만 대충 뿌리지 말고」 ③ 조각을 잘라 단면에 녹은 초콜릿 덩이 「징그러워 · 초코칩을 박지 말고」.
짙은 점이 밝은 면에 여럿 박히면 벌레 · 구멍으로 읽힌다.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import fresh


def bar(lib, name, nx, ny, a=0.085, t0=0.014, t=0.030):
    """판 초콜릿 조각 — nx × ny 칸, 칸마다 사다리꼴로 솟는다(국소 XY에 눕는다, 원점 = 밑면 가운데)"""
    bm = bmesh.new()
    for i in range(nx):
        for j in range(ny):
            x0, y0 = (i - nx / 2) * a, (j - ny / 2) * a
            ring = lambda z, d: [bm.verts.new((x0 + (d if k in (0, 3) else a - d), y0 + (d if k < 2 else a - d), z))  # noqa: E731
                                 for k in range(4)]
            lo, mid, hi = ring(0.0, 0.0), ring(t0, 0.0), ring(t, a * 0.17)
            bm.faces.new(lo[::-1])
            bm.faces.new(hi)
            for k in range(4):
                n = (k + 1) % 4
                bm.faces.new((lo[k], lo[n], mid[n], mid[k]))
                bm.faces.new((mid[k], mid[n], hi[n], hi[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return lib.link(bpy.data.objects.new(name, me))


def bar_mat(lib, name='bar'):
    m = lib.Mat(name)
    P = m.lpos()
    col = m.mix(m.noise(P, scale=30.0, detail=2.0), '#4A2410', '#663618')
    return m.out(color=col, rough=m.mixf(m.noise(P, scale=14.0, detail=1.0), 0.58, 0.68))  # 매끈하면 칸 윗면이 천장 반사로 분홍빛 흰 네모가 된다


def build(lib):
    lib.reset(seed=85)
    R, H, T = 0.44, 0.118, 0.024
    kw = dict(steps=13, wob=0.032)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=31, **kw),
        fresh.Cake(R * 0.98, H, 0.115, -0.020, 0.014, seed=32, droop=0.010, **kw),
        fresh.Cake(R * 0.95, H, 0.230, 0.024, -0.008, seed=33, droop=0.010, **kw),
        fresh.Cake(R * 0.96, H * 0.96, 0.345, -0.010, 0.016, seed=34, droop=0.012, **kw),
    ]
    top = cakes[-1]

    def at(al, r, z=0.0):  # 윗장 가운데에서 카메라 기준 방위 al 로 r
        a = lib.az(al)
        return (top.cx + r * math.cos(a), top.cy + r * math.sin(a), top.top + z)

    cake = fresh.cake_mat('cake', R, top=('#DCA146', '#BE7C28', '#965818'))
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#C9D8DC')))

    # 초콜릿 소스: 카메라 조금 오른쪽으로 쏠려 넓게 고이고, 굵기 · 길이가 다른 줄기로 흘러내린다
    front = lib.az(14)
    pool = fresh.puddle(front, reach=0.04, back=0.15, ph=7.0)
    runs = [(front - 0.62, 0.10, 1.2), (front - 0.34, 0.27, 0.9), (front - 0.06, 0.07, 1.35), (front + 0.20, 0.33, 1.0),
            (front + 0.50, 0.15, 0.8)]
    sauce = fresh.sauce_mat('sauce', '#4A2412', '#8A5228', rough=0.38, depth=0.010, glow=(1.0, 0.45, 0.2))
    parts += fresh.sauce('sauce', cakes, pool, runs, sauce, w=0.034, plate=PR, thick=T, refine=0.008,
                         seed=4.0, riv=dict(aspect=0.6, head=1.45))

    # 휘핑크림: 뒤 왼쪽에 손으로 짠 한 덩이
    kx, ky, kz = at(165, 0.13)
    cream = fresh.rosette('cream', r0=0.14, height=0.21, tiers=2.5, tube=0.046, segs=44, rings=44, soft=1.0)
    lib.place(cream, (kx, ky, kz + 0.010), (0.0, 0.0, lib.az(-90)))
    parts.append(lib.assign(cream, fresh.cream_mat('cream')))

    # 판 초콜릿 조각: 큰 것은 크림 오른쪽에 비스듬히 꽂히고, 작은 것은 그 앞에 기대 눕는다
    choc = bar_mat(lib)
    big = bar(lib, 'bar0', 2, 3)
    # 칸이 솟은 면이 카메라 위쪽을 본다(뒷면이 보이면 밋밋한 마름모 판이다)
    face = lib.horiz(lib.az(-14)) * 0.72 + Vector((0.0, 0.0, 0.70))
    big.matrix_world = (Matrix.Translation(at(88, 0.10, 0.105))
                        @ lib.frame(face, lib.horiz(lib.az(76)) + Vector((0.0, 0.0, 0.85))))
    parts.append(lib.assign(big, choc))
    small = bar(lib, 'bar1', 2, 1)
    x, y, z = at(48, 0.20, 0.034)
    lib.place(small, (x, y, z), (math.radians(24), math.radians(8), lib.az(35)))
    parts.append(lib.assign(small, choc))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0), quality=76,
        ao_strength={'*': 0.5, 'cream': 0.15, 'plate': 0.3},
        uv_weight={'sauce': 1.2, 'cream': 1.3, 'bar': 1.4, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
    )
