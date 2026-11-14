"""딸기 팬케이크 (pancake--strawberry-fresh) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/pancake--strawberry-fresh{,-2,-3}.png — 정면(1번)이 정체성 기준.
색 앵커 assets/prompts/breads/pancake--strawberry-fresh.json.
단위: 팬케이크 지름 1, 바닥 z=0, 정면 = Blender −Y. 각도 α는 썸네일 카메라 기준(+ = 화면 오른쪽).
구성: 수플레 팬케이크 3장 · 휘핑크림 로제트(별깍지 나선) · 통딸기 1(꼭지 위) · 반쪽 딸기 8 ·
      소스(메타볼 — 윗면 웅덩이 + 옆면 흘러내림 + 크림·반쪽 위 덮임). 민트·슈가파우더 없음.
"""
import math
import random

import bmesh
import bpy
from lib import CAM, TAU, UP, at, az, bridged, frame, horiz, prof_r, with_normals
from mathutils import Matrix, Quaternion, Vector
from pancake_stack import DOME, RCT, build_cakes, crumb_material, stack_r, top_z

SEED = 7
# 팬케이크 장 — (반지름, 두께, xy 어긋남, z 회전, 기울기 x·y 도). 공용 형상·재질은 pancake_stack.py
CAKES = [
    (0.500, 0.226, (0.006, -0.004), 0.4, (0.5, -0.4)),
    (0.494, 0.230, (-0.007, 0.005), 2.1, (-0.6, 0.5)),
    (0.488, 0.228, (0.003, 0.002), 4.0, (0.25, 0.2)),
]


# ── 휘핑크림 ─────────────────────────────────────────────────────────────────

CREAM_TURNS = 2.5
CREAM_PHI0 = CAM + math.pi  # 짜기 시작 꼬리는 뒤쪽
CREAM_PEAK = 0.33  # 크림 바닥 → 꼭대기 (0.28은 누운 반쪽들 사이에 묻혔다, r5)


def cream_at(t):
    """나선 매개 t(0..1) → (방위, 중심 반지름, 높이, 관 굵기) — 크림 국소(바닥 가운데 원점)"""
    phi = CREAM_PHI0 + TAU * CREAM_TURNS * t
    rho = 0.160 * (1 - t) ** 0.85
    a = 0.090 * (1 - 0.52 * t)
    if t < 0.06:
        a *= 0.35 + 0.65 * t / 0.06  # 짜기 시작 꼬리
    if t > 0.88:
        a *= 1 - 0.75 * ((t - 0.88) / 0.12) ** 1.3  # 끝 뾰족
    return phi, rho, 0.070 + 0.250 * t ** 0.92, a


def build_cream(lib, mat, base):
    n = int(CREAM_TURNS * 32)
    sp = [cream_at(i / n) for i in range(n + 1)]
    star = [((1 - 0.2 * (0.5 - 0.5 * math.cos(8 * th))) * math.cos(th),
             (1 - 0.2 * (0.5 - 0.5 * math.cos(8 * th))) * math.sin(th))
            for th in (TAU * k / 32 for k in range(32))]  # 별깍지 — 골 8개(깊이 20%: 0.13은 매끈한 관으로 읽혔다)
    prof = lib.profile_curve('star', star)
    ob = lib.curve_tube('cream', [(rho * math.cos(phi), rho * math.sin(phi), z) for phi, rho, z, _ in sp],
                        [a for *_, a in sp], profile_obj=prof)
    lib.delete_faces(ob, lambda c, n: c.z < 0.0)  # 팬케이크 속
    lib.decimate(ob, min(1.0, 2600 / max(1, lib.tri_count(ob))))  # 관 5.2k → 2.6k — 길이 방향만 성겨지고 별깍지 골은 남는다(r9 네 방향 육안)
    lib.place(ob, tuple(base))
    return lib.assign(ob, mat)


def cream_r(phi, z):
    """크림 바깥 반지름(국소 방위 phi · 높이 z) — 그 방위를 지나는 관 단면 원들의 합집합"""
    best = 0.0
    for k in range(-1, 5):
        t = ((phi - CREAM_PHI0) % TAU + TAU * k) / (TAU * CREAM_TURNS)
        if 0 <= t <= 1:
            _, rho, zc, a = cream_at(t)
            if abs(z - zc) < a:
                best = max(best, rho + math.sqrt(a * a - (z - zc) ** 2))
    return best


def cream_material(lib):
    m = lib.Mat('cream')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=7, detail=3), [(0.35, '#FFF8EE'), (0.7, '#FFFDF8')])
    return m.out(col, 0.45, m.bump(m.noise(p, scale=85, detail=2), strength=0.06, distance=0.002))


# ── 딸기 ─────────────────────────────────────────────────────────────────────

# 단면(r, z) 끝(0) → 꼭지(위). 하트형 — 끝은 뭉툭, 가장 넓은 곳 ≈ 높이 75%, 꼭지 자리 살짝 오목
# (첫 판은 끝이 뾰족해 반쪽이 원뿔 종이컵으로 읽혔다)
BERRY = [(0, 0), (0.018, 0.008), (0.042, 0.030), (0.066, 0.064), (0.088, 0.104), (0.105, 0.146),
         (0.117, 0.186), (0.123, 0.218), (0.121, 0.242), (0.108, 0.264), (0.082, 0.280),
         (0.047, 0.289), (0.018, 0.287), (0, 0.282)]
NTH, NZ = 20, 29.0  # 씨앗 격자 — 둘레 20칸, 높이 1당 29칸


def berry_rfn(lib, s):
    return lambda th, z: (1 + 0.03 * math.sin(3 * th + s)
                          + 0.018 * lib.n3(math.cos(th) * 1.5, math.sin(th) * 1.5, z * 7, s))


def berry_top_z(prof, r):
    """통딸기 윗면(어깨 위) 높이 — 꽃받침이 표면을 따라 눕게"""
    best = None
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if max(z0, z1) > 0.2 and r0 != r1 and (r0 - r) * (r1 - r) <= 0:
            z = z0 + (z1 - z0) * (r - r0) / (r1 - r0)
            best = z if best is None else max(best, z)
    return best if best is not None else prof[-1][1]


def sepal(lib, name, prof, phi, L, W, curl):
    """꽃받침 한 장(통딸기 국소) — 가운데에서 phi 쪽으로 표면을 따라 눕다가 끝이 들린다"""
    o, bm, rows, n = horiz(phi), bmesh.new(), [], 8
    side = UP.cross(o)
    for k in range(n + 1):
        u = k / n
        r = 0.010 + L * u
        # 안쪽은 윗면을 따라 눕고, 어깨(r > 0.085)부터는 완만히 뻗어 나가 실루엣 밖으로 별처럼 펼쳐진다
        zs = berry_top_z(prof, min(r, 0.085)) - 0.35 * max(0.0, r - 0.085)
        c = Vector((o.x * r, o.y * r, zs + 0.004 + L * curl * u ** 2.2))
        if k == n:
            rows.append([bm.verts.new(c)])
            break
        hw = W / 2 * (0.35 + 0.65 * math.sin(math.pi * u ** 0.8))
        lift = UP * (0.003 * hw / (W / 2))  # 가장자리가 살짝 들린 홈
        rows.append([bm.verts.new(c - side * hw + lift), bm.verts.new(c), bm.verts.new(c + side * hw + lift)])
    for a, b in zip(rows, rows[1:]):
        if len(b) == 1:
            bm.faces.new((a[0], a[1], b[0]))
            bm.faces.new((a[1], a[2], b[0]))
        else:
            bm.faces.new((a[0], a[1], b[1], b[0]))
            bm.faces.new((a[1], a[2], b[2], b[1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    for p in me.polygons:
        p.use_smooth = True
    lib.solidify(ob, 0.004)
    return ob


def build_whole(lib, mat, calyx_mat, M):
    prof = lib.catmull(BERRY, 1)
    ob = lib.lathe('berry', prof, segs=40, rfn=berry_rfn(lib, 1.7))
    parts = [lib.assign(ob, mat)]
    rnd = random.Random(11)
    for k in range(8):  # 레퍼런스 꽃받침은 몸통보다 넓게 펼친 별 — 첫 판(7장 · 0.09)은 작고 가늘었다
        phi = TAU * k / 8 + rnd.uniform(-0.15, 0.15)
        parts.append(lib.assign(sepal(lib, f'sepal{k}', prof, phi, rnd.uniform(0.105, 0.13),
                                      rnd.uniform(0.028, 0.036), rnd.uniform(0.2, 0.7)), calyx_mat))
    top = prof[-1][1]
    parts.append(lib.assign(lib.curve_tube('stem', [(0, 0, top - 0.004), (0.002, 0.001, top + 0.014),
                                                    (0.006, 0.002, top + 0.028), (0.011, 0.004, top + 0.038)],
                                           [1, 1, 0.95, 0.9], bevel_depth=0.0065), calyx_mat))
    for p in parts:
        p.matrix_world = M
    return parts


def make_half(lib, mat, name, s):
    """반쪽 딸기(국소: 끝 원점, 축 +Z, 껍질 +Y 쪽, 단면 y=0 이 −Y를 본다)
    단면은 고리마다 격자를 깔고 flesh = |s|(가운데 0 → 껍질 1)를 정점 속성으로 — 하얀 심 · 붉은 테"""
    rfn = berry_rfn(lib, s)
    skin = lib.lathe(name, BERRY, segs=12, rfn=rfn, theta0=0.0, theta1=math.pi)
    lib.orient_faces(skin, lambda c: c - Vector((0, 0, 0.16)))
    nv = len(skin.data.vertices)
    lib.point_attr(skin, 'cut', [0.0] * nv)
    lib.point_attr(skin, 'flesh', [1.0] * nv)
    bm, rows, flesh, S = bmesh.new(), [], [], 6
    for r, z in BERRY:
        if r <= 1e-9:
            rows.append([bm.verts.new((0.0, 0.0, z))])
            flesh.append(1.0 if z < 0.1 else 0.3)  # 끝은 붉게, 꼭지 쪽 심은 하얗게
            continue
        rr, rl = r * rfn(0.0, z), r * rfn(math.pi, z)
        row = []
        for k in range(S + 1):
            u = -1 + 2 * k / S
            row.append(bm.verts.new((u * (rr if u > 0 else rl), 0.0, z)))
            flesh.append(abs(u))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for k in range(S):
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[k + 1]))
            elif len(b) == 1:
                bm.faces.new((a[k], a[k + 1], b[0]))
            else:
                bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    me = bpy.data.meshes.new(name + '_cut')
    bm.to_mesh(me)
    bm.free()
    cut = lib.link(bpy.data.objects.new(name + '_cut', me))
    lib.orient_faces(cut, lambda c: Vector((0, -1, 0)))
    lib.point_attr(cut, 'cut', [1.0] * len(me.vertices))
    lib.point_attr(cut, 'flesh', flesh)
    return [lib.assign(skin, mat), lib.assign(cut, mat)]


# 반쪽 딸기 — (α°, 중심 거리, 단면 앙각°, 단면 방향°(0 = 바깥, 180 = 크림 쪽), 끝 방향 비틀기°, 크기, 들림)
# 단면 앙각 e: 90 = 하늘, 0 = 수평으로 마주봄, 음수 = 아래를 봄. 비틀기 0이면 끝(뾰족)이 단면 안 내리막 쪽.
# 축 앙각 = 90° − e 라 e 35~50은 반쪽이 곧추서서 테두리에 흰 이빨 왕관으로 읽혔다(2026-11-14 r4) —
# 단면 쪽은 e 55~65로 눕혀 단면을 하늘·카메라로, 사이사이 e −25~−35로 씨 박힌 껍질을 세운다.
# 단면 위 소스 덮개(납작한 타원체)는 뺐다 — 테두리가 또렷한 빨간 단추로 읽혔다(2026-11-14, 두 번)
HALVES = [
    (-58, 0.33, 60, 12, -30, 1.25, 0.0),  # 정면 왼쪽 큰 반쪽 — 누워 단면이 카메라
    (-95, 0.29, 55, 45, 40, 1.15, 0.02),  # 왼쪽 위 — 크림에 기대 누움
    # 껍질 쪽 반쪽은 옆으로 눕힌다(단면 앙각 18 · 비틀기 ±65) — e −30으로 세운 판은 통딸기 두 개로 읽혔다(r5)
    (-24, 0.34, 18, 180, 65, 1.10, 0.0),  # 정면 왼쪽 가운데 — 씨 박힌 껍질이 앞
    (6, 0.36, 64, 0, 25, 1.12, 0.0),  # 정면 가운데 — 단면
    (36, 0.35, 18, 175, -65, 1.05, 0.0),  # 정면 오른쪽 — 껍질
    (68, 0.32, 50, -40, -12, 1.25, 0.0),  # 오른쪽 큰 반쪽 — 단면을 카메라 쪽으로
    (120, 0.29, -25, 0, 10, 1.10, 0.0),  # 뒤 오른쪽 — 크림 뒤 껍질
    (175, 0.30, 52, 180, -15, 1.10, 0.0),  # 뒤 — 단면이 앞
    (-135, 0.30, 55, 165, 20, 1.10, 0.0),  # 뒤 왼쪽 — 단면이 앞
]


def build_halves(lib, mat, top):
    parts = []
    for i, (alpha, rho, elev, yaw, roll, scale, lift) in enumerate(HALVES):
        th = az(alpha)
        f = horiz(th + math.radians(yaw))
        e = math.radians(elev)
        n = f * math.cos(e) + UP * math.sin(e)  # 단면 법선
        d = n * n.z - UP  # 단면 안 내리막
        d = d.normalized() if d.length > 1e-3 else f
        r_ = math.radians(roll)
        a = -(d * math.cos(r_) + n.cross(d) * math.sin(r_))  # 끝 → 꼭지
        RS = frame(a, (-n).cross(a)) @ Matrix.Scale(scale, 4)
        pieces = make_half(lib, mat, f'half{i}', 2.3 + i * 1.37)
        pts = [RS @ v.co for p in pieces for v in p.data.vertices]
        zmin = min(q.z for q in pts)
        cx = sum(q.x for q in pts) / len(pts)
        cy = sum(q.y for q in pts) / len(pts)
        tgt = horiz(th) * rho
        M = Matrix.Translation((tgt.x - cx, tgt.y - cy, top_z(top, rho) - zmin - 0.006 + lift)) @ RS

        def buried(c, _n, M=M):
            w = M @ c
            r = math.hypot(w.x, w.y)
            return r < top['R'] - 0.03 and w.z < top_z(top, r) - 0.003

        for p in pieces:
            lib.delete_faces(p, buried)
            p.matrix_world = M
        parts += pieces
    return parts


def berry_material(lib):
    m = lib.Mat('berry')
    p = m.lpos()
    px = m.sep(p)
    th = m.math('ARCTAN2', px[1], px[0])  # 이음매(±π) = 국소 −X — 반쪽은 단면 가장자리, 통딸기는 뒤로 돌린다
    uv = m.combine(m.math('MULTIPLY', th, NTH / TAU), m.math('MULTIPLY', px[2], NZ), 0.0)
    d = m.voronoi(uv, scale=1.0, randomness=0.7, dims='2D')
    seed = m.math('SUBTRACT', 1.0, m.smooth(d, 0.10, 0.15))
    pit = m.math('SUBTRACT', 1.0, m.smooth(d, 0.15, 0.33))
    skin = m.ramp(m.noise(p, scale=7, detail=3), [(0.32, '#BF1B22'), (0.5, '#D3262A'), (0.68, '#E23530')])
    skin = m.mix(m.math('MULTIPLY', pit, 0.55), skin, '#93132A')
    skin = m.mix(seed, skin, '#E6C058')
    cut = m.attr('cut')
    fl = m.math('ADD', m.attr('flesh'),
                m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=16, detail=3), 0.5), 0.14))
    # 하얀 심은 가늘게 → 분홍 → 붉은 살(넓게). 심 0.30까지 하얗게 둔 판은 단면이 흰 삼각형으로 읽혔다(r4)
    flesh = m.ramp(fl, [(0.0, '#FBE0D6'), (0.20, '#F7B6A6'), (0.38, '#EF7F72'), (0.56, '#E04A4A'),
                        (0.78, '#D12C34'), (1.0, '#C21E2A')])
    col = m.mix(cut, skin, flesh)
    rough = m.mixf(cut, m.mixf(seed, 0.26, 0.5), 0.32)  # 단면 0.22는 방 반사로 허옇게 떴다
    h = m.mixf(cut, m.math('SUBTRACT', m.math('MULTIPLY', seed, 0.6), pit),
               m.math('MULTIPLY', m.noise(p, scale=45, detail=2), 0.25))
    return m.out(col, rough, m.bump(h, strength=0.45, distance=0.003))


def calyx_material(lib):
    m = lib.Mat('calyx')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=25, detail=3), [(0.3, '#3F672E'), (0.7, '#5F8C45')])
    return m.out(col, 0.5, m.bump(m.noise(p, scale=90, detail=2), strength=0.12, distance=0.0015))


# ── 소스 ─────────────────────────────────────────────────────────────────────

# 흘러내림 — (α°, (끝 장, 장 안 높이 비율), 끝 방울 반지름, 위쪽 반폭, 중간 방울 [(장, 비율, 반지름)])
DRIPS = [  # 레퍼런스 흘러내림 폭 ≈ 지름의 0.058 (첫 판 반폭 0.02는 실처럼 가늘었다)
    (-74, (2, 0.42), 0.026, 0.026, ()),
    (-37, (1, 0.30), 0.036, 0.032, ()),
    (39, (0, 0.70), 0.038, 0.034, ((1, 0.55, 0.030),)),
    (86, (2, 0.10), 0.028, 0.027, ()),
    (172, (1, 0.62), 0.031, 0.028, ()),
]
PR = 0.012  # 흘러내림 돌출 두께


def chain(els, path, origin, th0, phase, width, s_end, pr=PR):
    """경로(r, z, 법선)를 따라 메타볼 사슬 — 보이는 단면(반폭 width(s) · 돌출 pr)이 되게 공을 벽 안으로 묻는다.
    공 간격 = 장 반지름 × 0.25 일 때 사슬 굵기 ≈ 0.715 × 장 반지름(임계 0.6 · 강성 2 — 실측 0.715)"""
    s = 0.0
    while s < s_end:  # 폭은 길이 따라 출렁인다 — 고른 관은 플라스틱 줄로 읽혔다
        hw = width(s) * (1 + 0.22 * math.sin(26 * s + phase) + 0.1 * math.sin(61 * s + 2 * phase))
        rho = (hw * hw + pr * pr) / (2 * pr)  # 벽 밖으로 pr 만큼 나온 구의 반지름
        r, z, nr, nz = at(path, s)
        th = th0 + 0.035 * math.sin(9 * s + phase) + 0.018 * math.sin(23 * s + 2 * phase)
        rc, zc = r - nr * (rho - pr), z - nz * (rho - pr)
        els.append(dict(type='BALL', co=(origin.x + rc * math.cos(th), origin.y + rc * math.sin(th), origin.z + zc),
                        radius=rho * 1.4))
        s += 0.35 * rho
    return th0 + 0.035 * math.sin(9 * s_end + phase) + 0.018 * math.sin(23 * s_end + 2 * phase)


def drop(els, path, s, th, radius, stretch=1.3):
    r, z, nr, _ = at(path, s)
    els.append(dict(type='ELLIPSOID', co=(r * math.cos(th), r * math.sin(th), z - 0.2 * radius),
                    radius=radius / 0.6, size=(1.0, 1.0, stretch)))


def build_sauce(lib, mat, cakes, cream_base):
    top, els = cakes[-1], []
    for k, (alpha, (ci, frac), bulb, hw0, mids) in enumerate(DRIPS):
        th = az(alpha)
        rt = top['R'] - RCT
        # 윗면 → 위 모서리는 맨 위 장의 국소 단면(r, h)에서 — 둘레 요철·어긋남을 옆벽(stack_r)과 똑같이 입힌다
        loc = [(r, top_z(top, r) - top['z']) for r in (0.30 + (rt - 0.30) * j / 12 for j in range(12))]
        loc += [(rt + RCT * math.cos(a), top['T'] - RCT + RCT * math.sin(a))
                for a in (math.pi / 2 * (1 - j / 10) for j in range(10))]
        shift = Vector(top['off'] + (0,)).dot(horiz(th))
        pts = [(r * top['rfn'](th - top['rotz'], h) + shift, top['z'] + h) for r, h in loc]
        zz = top['z'] + top['T'] - RCT
        while zz > 0.004:
            zz -= 0.004
            pts.append((bridged(lambda q: stack_r(cakes, q, th), zz, 0.04), zz))
        path = with_normals(pts)
        z_end = cakes[ci]['z'] + frac * cakes[ci]['T']
        s_end = next(p[4] for p in path if p[1] <= z_end)
        s_rim = next(p[4] for p in path if p[2] > 0.75)  # 옆벽 시작
        # 윗면·테두리에선 넓게 고였다가 옆벽을 0.12 내려가며 좁아진다
        width = (lambda s, hw0=hw0, s_rim=s_rim:
                 hw0 * (1.45 - 0.6 * min(1.0, max(0.0, s - s_rim) / 0.12)))
        th_end = chain(els, path, Vector((0, 0, 0)), th, k * 1.9, width, s_end)
        drop(els, path, s_end, th_end, bulb)
        for mci, mfrac, mr in mids:
            zm = cakes[mci]['z'] + mfrac * cakes[mci]['T']
            drop(els, path, next(p[4] for p in path if p[1] <= zm), th, mr, 1.15)
        for r in (0.24, 0.31, 0.38):  # 흘러내림으로 이어지는 윗면 웅덩이
            els.append(dict(type='ELLIPSOID', co=(r * math.cos(th), r * math.sin(th), top_z(top, r) + 0.002),
                            radius=0.09, size=(1.35, 0.9, 0.26), rot=Quaternion(UP, th)))
    for alpha, r, rad in ((-30, 0.37, 0.10), (-8, 0.39, 0.09), (20, 0.36, 0.10)):  # 앞 테두리를 덮는 웅덩이
        th = az(alpha)
        els.append(dict(type='ELLIPSOID', co=(r * math.cos(th), r * math.sin(th), top_z(top, r) + 0.002),
                        radius=rad, size=(0.9, 1.5, 0.24), rot=Quaternion(UP, th)))
    for k in range(7):  # 크림 둘레 웅덩이
        th = CAM + TAU * k / 7 + 0.3 * math.sin(k * 2.3)
        r = 0.225
        els.append(dict(type='ELLIPSOID', co=(cream_base.x + r * math.cos(th), cream_base.y + r * math.sin(th),
                                              top_z(top, r) + 0.002),
                        radius=0.085, size=(1.0, 1.0, 0.24), rot=Quaternion(UP, th)))
    # 크림을 타고 내린 줄기 하나 — 딸기 밑에서 카메라 쪽으로. 넓고 납작하게(둥근 관은 지렁이로 읽혔다).
    # 경로는 위아래 ±0.03 안의 가장 바깥 반지름(덮개) — 고리 골마다 꺼져 빨간 구슬 줄로 읽혔다(r6)
    for alpha, hw0 in ((-35, 0.034),):
        th = az(alpha)
        z, pts = CREAM_PEAK - 0.05, []
        while z > 0.0:
            r = max(cream_r(th, z + dz * 0.005) for dz in range(-6, 7))
            if r > 0:
                pts.append((r, z))
            z -= 0.004
        path = with_normals(pts)
        s_end = path[-1][4]
        chain(els, path, cream_base, th, alpha * 0.1, lambda s, hw0=hw0, s_end=s_end: hw0 * (1 - 0.2 * s / s_end),
              s_end, pr=0.012)

    ob = lib.metaballs('sauce', els, resolution=0.005)

    def inside(c, _n):
        for k in cakes:
            h = c.z - k['z']
            if -0.001 < h < k['T'] + DOME:
                r = math.hypot(c.x - k['off'][0], c.y - k['off'][1])
                if r < prof_r(k['prof'], h) - 0.010:
                    return True
        return False

    lib.delete_faces(ob, inside)
    lib.decimate(ob, min(1.0, 3500 / max(1, lib.tri_count(ob))))
    return lib.assign(ob, mat)


def sauce_material(lib):
    m = lib.Mat('sauce')
    col = m.ramp(m.noise(m.lpos(), scale=9, detail=3), [(0.3, '#C21D26'), (0.7, '#D8302F')])
    return m.out(col, 0.07)


# ── 조립 ─────────────────────────────────────────────────────────────────────

def build(lib):
    lib.reset(SEED)
    crumb, cream, berry = crumb_material(lib), cream_material(lib), berry_material(lib)
    calyx, sauce = calyx_material(lib), sauce_material(lib)

    cakes, parts = build_cakes(lib, crumb, CAKES, top_hole=0.10)
    top = cakes[-1]
    # 크림은 가운데에서 오른쪽 뒤로, 통딸기는 그 꼭대기 왼쪽 앞 — 레퍼런스처럼 딸기 오른쪽에 크림 소용돌이가 보인다
    cream_base = Vector((0.0, 0.0, top_z(top, 0.0) - 0.006)) + horiz(az(70)) * 0.06
    parts.append(build_cream(lib, cream, cream_base))

    # 통딸기 — 크림 왼쪽 어깨에 끝을 묻고 꼭지가 위. 화면 오른쪽으로 8°, 카메라 쪽으로 5° 기울임
    lean = horiz(CAM + math.pi / 2) * math.tan(math.radians(8)) + horiz(CAM) * math.tan(math.radians(5))
    # 꼭대기 한가운데에 얹은 판은 크림 위 고깔을 통째로 가려 크림이 고리로 읽혔다(r3·r4) — 레퍼런스처럼
    # 딸기는 크림 왼쪽 어깨, 소용돌이 꼭대기는 딸기 오른쪽에 드러나게
    seat = cream_base + Vector((0, 0, CREAM_PEAK - 0.15)) + horiz(az(-90)) * 0.12 + horiz(CAM) * 0.02
    parts += build_whole(lib, berry, calyx, Matrix.Translation(seat) @ frame(UP + lean, horiz(CAM)))

    parts += build_halves(lib, berry, top)
    parts.append(build_sauce(lib, sauce, cakes, cream_base))

    for p in parts:
        print(f'  {p.name:12s} {lib.tri_count(p):6d} tri')
    return parts, dict(size=1024, rough_size=512, ao_samples=48,
                       ao_strength={'*': 0.6, 'crumb': 0.45, 'cream': 0.25, 'berry': 0.45},
                       uv_weight={'crumb': 1.0, 'cream': 1.15, 'berry': 1.6, 'calyx': 1.8, 'sauce': 1.35})
