"""긴 빵 공용 — baguette · rye 가 함께 쓴다 (docs/BREADS.md §Blender).

loft: X축(길이) 따라 단면 고리를 잇는 몸통. 양끝은 극점 1개.
칼집(slash): 윗면을 위에서 내려다본 평면(x, y)의 렌즈 — 폭 = w·(1 − (along/a)²).
  기하(slash_disp)와 재질 마스크(slash_masks)가 같은 식을 쓴다 — 렌즈 가장자리가 형상·색에서 어긋나지 않게.
  f = 가로 위치 / 렌즈 반폭(부호 있음): |f| < 1 = 속살, f ≈ 1.1 = 귀(+쪽 테두리가 들린 껍질).
칼집 = (중심 x, 중심 y, 각도°(+X에서 반시계), 반길이 a, 반폭 w, 깊이, 귀 높이)
"""
import math

import bmesh
import bpy


def loft(lib, name, xs, section, nth=56):
    """xs = 길이 방향 정거장(양끝은 극점). section(x, th) → (y, z) — th 0 = +Y, π/2 = 위"""
    bm = bmesh.new()
    rings = []
    for i, x in enumerate(xs):
        pts = [section(x, math.tau * k / nth) for k in range(nth)]
        if i in (0, len(xs) - 1):
            y = sum(p[0] for p in pts) / nth
            z = sum(p[1] for p in pts) / nth
            rings.append([bm.verts.new((x, y, z))])
        else:
            rings.append([bm.verts.new((x, y, z)) for y, z in pts])
    for a, b in zip(rings, rings[1:]):
        for k in range(nth):
            j = (k + 1) % nth
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1:
                bm.faces.new((a[k], a[j], b[0]))
            else:
                bm.faces.new((a[k], a[j], b[j], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me))


def stations(n, cluster=0.5):
    """−0.5..0.5 정거장 n개 — 끝으로 갈수록 촘촘(끝 둥근 부분이 각지지 않게)"""
    out = []
    for i in range(n):
        u = -1 + 2 * i / (n - 1)
        out.append(0.5 * ((1 - cluster) * u + cluster * math.sin(u * math.pi / 2)))
    return out


def _local(s, x, y):
    xc, yc, ang, a, w = s[:5]
    c, sn = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    X = (x - xc) * c + (y - yc) * sn
    Y = -(x - xc) * sn + (y - yc) * c
    t = 1 - (X / a) ** 2
    return t, Y / (w * max(t, 1e-3))


def slash_disp(slashes, top_z):
    """법선 방향 변위 함수(co → 거리). top_z 아래(옆·바닥)는 건드리지 않는다"""
    def fn(co):
        if co.z < top_z:
            return 0.0
        d = 0.0
        for s in slashes:
            t, f = _local(s, co.x, co.y)
            if t <= 0:
                continue
            depth, ear = s[5], s[6]
            if abs(f) < 1:  # 속살 골 — 귀 쪽(+)이 깊다(귀 밑 그늘)
                d -= depth * math.sqrt(t) * (1 - f * f) ** 0.6 * (0.7 + 0.3 * f)
            d += ear * t ** 0.6 * math.exp(-((f - 1.15) / 0.35) ** 2)  # 귀(폭이 정점 간격보다 좁으면 톱니가 된다)
            d -= 0.35 * depth * t * math.exp(-((f + 1.0) / 0.22) ** 2)  # 반대쪽 테는 골로 내려앉는다
        return d
    return fn


def slash_masks(m, p, slashes, gate):
    """재질 마스크 (속살, 귀, 귀 밑 그늘) — 칼집마다 MAXIMUM. gate = 윗면 마스크(0..1)"""
    cut = ear = shade = None
    for s in slashes:
        xc, yc, ang, a, w = s[:5]
        r = math.radians(ang)
        c, sn = math.cos(r), math.sin(r)
        # Mapping POINT = R·v + L → R(−ang)·(v − c)
        loc = (-(xc * c + yc * sn), -(-xc * sn + yc * c), 0.0)
        q = m.sep(m.mapping(p, loc=loc, rot=(0.0, 0.0, -r)))
        t = m.math('SUBTRACT', 1.0, m.math('MULTIPLY', m.math('DIVIDE', q[0], a), m.math('DIVIDE', q[0], a)))
        f = m.math('DIVIDE', q[1], m.math('MULTIPLY', m.math('MAXIMUM', t, 1e-3), w))
        tip = m.smooth(t, 0.0, 0.15)
        c_ = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', f), 0.8, 1.0)), tip)
        e_ = m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(f, 0.92, 1.04),
                                       m.math('SUBTRACT', 1.0, m.smooth(f, 1.18, 1.5))), m.smooth(t, 0.05, 0.3))
        h_ = m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(f, 0.35, 0.92), m.math('SUBTRACT', 1.0, m.smooth(f, 0.98, 1.06))), tip)  # 귀 쪽으로 갈수록 구운 금빛 → 귀 밑 그늘
        cut = c_ if cut is None else m.math('MAXIMUM', cut, c_)
        ear = e_ if ear is None else m.math('MAXIMUM', ear, e_)
        shade = h_ if shade is None else m.math('MAXIMUM', shade, h_)
    return tuple(m.math('MULTIPLY', v, gate) for v in (cut, ear, shade))
