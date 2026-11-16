"""스콘 쐐기 공용 — scone · scone--choco-chip 이 함께 쓴다 (docs/BREADS.md §Blender).

국소 좌표: 꼭지(둥근 스콘의 가운데) = 원점, 이등분선 = +Y(꼭지 → 바깥 호), 바닥 z=0.
평면 윤곽 = 부채꼴(반지름 R, 반각 HALF) + 볼록한 칼 단면 + 둥근 모서리 세 곳.
세로 단면 = 바닥 둥근 모서리(rb) · 거의 곧은 옆벽(위가 살짝 넓다) · 둥근 윗모서리(rt) · 낮은 돔.
형상: 윤곽 링을 쌓은 닫힌 껍질 → 복셀 리메시(고른 사각 격자) → 돔·요철·켜 골 변위 → 바닥 지움 → decimate.
갈라짐 = 형상 골(호·직선 금을 길이 따라 흔들고 폭을 들쭉날쭉) + 정점 속성 crack(골 바닥 색).
재질: 윗면 = 금갈색 크러스트, 옆 = 크림 속살 + 가로 켜·기공.
"""
import math

import bmesh
import bpy
import numpy as np
from lib import TAU, az, frame
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


# ── 평면 윤곽 ────────────────────────────────────────────────────────────────

def _fillet(pts, c, rc):
    """pts[c] 모서리를 반지름 rc 원호로 깎는다 → (버릴 인덱스 집합, 끼울 점 목록)"""
    n = len(pts)
    V = pts[c]
    d1 = (V - pts[(c - 3) % n]).normalized()
    d2 = (pts[(c + 3) % n] - V).normalized()
    th = math.acos(max(-1.0, min(1.0, (-d1).dot(d2))))
    t = rc / math.tan(th / 2)
    p1, p2 = V - d1 * t, V + d2 * t
    C = V + ((-d1) + d2).normalized() * (rc / math.sin(th / 2))
    a1 = math.atan2(p1.y - C.y, p1.x - C.x)
    a2 = math.atan2(p2.y - C.y, p2.x - C.x)
    da = (a2 - a1 + math.pi) % TAU - math.pi
    arc = [C + Vector((math.cos(a1 + da * k / 10), math.sin(a1 + da * k / 10))) * rc for k in range(11)]
    drop = {c}
    for step in (-1, 1):
        j = (c + step) % n
        while (pts[j] - V).length < t * 1.02:
            drop.add(j)
            j = (j + step) % n
    return drop, arc


def outline(R, half, bulge=0.02, rc_tip=0.07, rc_arc=0.06, n_side=60, n_arc=60):
    """반시계 2D 윤곽 [Vector(x, y)] — 꼭지 → 오른쪽 단면 → 바깥 호 → 왼쪽 단면"""
    A = Vector((R * math.sin(half), R * math.cos(half)))
    B = Vector((-A.x, A.y))
    pts = []
    for P, Q in ((Vector((0, 0)), A), (B, Vector((0, 0)))):
        d = (Q - P).normalized()
        nrm = Vector((d.y, -d.x))  # 반시계 윤곽의 바깥
        seg = [P + (Q - P) * (i / n_side) + nrm * bulge * math.sin(math.pi * i / n_side) for i in range(n_side)]
        if P.length < 1e-9:
            pts += seg
            pts += [Vector((R * math.sin(half - 2 * half * i / n_arc), R * math.cos(half - 2 * half * i / n_arc)))
                    for i in range(n_arc)]
        else:
            pts += seg
    corners = [(0, rc_tip), (n_side, rc_arc), (n_side + n_arc, rc_arc)]
    drops, arcs = set(), {}
    for c, rc in corners:
        d, a = _fillet(pts, c, rc)
        drops |= d
        arcs[c] = a
    out = []
    for i, p in enumerate(pts):
        if i in arcs:
            out += arcs[i]
        elif i not in drops:
            out.append(p)
    return out


def _normals2d(pts):
    n = len(pts)
    out = []
    for i in range(n):
        d = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        out.append(Vector((d.y, -d.x)))
    return out


# ── 형상 ─────────────────────────────────────────────────────────────────────

def _smooth01(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def crack_lines(lib, cracks, seed):
    """금 → [(점 (k,2), 반폭 (k,))]. cracks = [('arc', r0, φa, φb) | ('ray', φ0, ra, rb) | ('seg', p0, p1, 폭)] —
    φ = 이등분선(+Y)에서 잰 각(+ = 오른쪽, 라디안), r = 꼭지에서 거리(바깥 호 = R). 길이 따라 흔들리고 폭이 들쭉날쭉"""
    out = []
    for i, (kind, a, b, c) in enumerate(cracks):
        pts, ws = [], []
        for k in range(33):
            u = k / 32
            if kind == 'seg':  # ('seg', (x0, y0), (x1, y1), 폭 배율) — 반죽 위에 그은 듯한 곧은 금
                p0, p1 = Vector(a), Vector(b)
                v, wk = (p1 - p0).length * u, c
            else:
                v, wk = b + (c - b) * u, 1.0
            jit = 0.035 * lib.n3(v * 3, 0.5, 0.0, seed + i * 3.1) + 0.009 * lib.n3(v * 19, 0.2, 0.0, seed + i * 1.7)
            if kind == 'seg':
                d = (p1 - p0).normalized()
                q = p0 + (p1 - p0) * u + Vector((-d.y, d.x)) * jit * 0.4
                pts.append((q.x, q.y))
            else:
                r, phi = (a + jit, v) if kind == 'arc' else (v, a + jit / max(v, 0.2))
                pts.append((r * math.sin(phi), r * math.cos(phi)))
            w = 0.010 * wk * (0.5 + 1.0 * max(0.0, 0.5 + 0.7 * lib.n3(v * 7, 0.9, 0.0, seed + i * 2.3)))
            ws.append(w * math.sin(math.pi * u) ** 0.6 + 1e-4)  # 끝은 가늘어져 사라진다
        out.append((np.array(pts), np.array(ws)))
    return out


def build_wedge(lib, mat, R=1.0, half=math.radians(33), H=0.44, rt=0.075, rb=0.03, taper=0.015,
                dome=0.03, bulge=0.02, voxel=0.006, tris=10500, seed=0.0, layers=(0.22, 0.42, 0.62),
                ledge=0.10, cracks=()):
    """쐐기 몸통 → (오브젝트, 윤곽, 정보 dict). 오브젝트는 국소 좌표(꼭지 원점) 그대로 — 배치는 place_all"""
    ol = outline(R, half, bulge)
    nl = _normals2d(ol)
    rings = []  # (안쪽 들임, z)
    for k in range(5):
        a = -math.pi / 2 * (1 - k / 4)
        rings.append((rb - rb * math.cos(a) + taper, rb + rb * math.sin(a)))
    for k in range(1, 4):
        z = rb + (H - rt - rb) * k / 4
        rings.append((taper * (1 - z / (H - rt)), z))
    for k in range(7):
        a = math.pi / 2 * k / 6
        rings.append((rt - rt * math.cos(a), H - rt + rt * math.sin(a)))
    bm = bmesh.new()
    grid = [[bm.verts.new((p.x - n.x * ins, p.y - n.y * ins, z)) for p, n in zip(ol, nl)] for ins, z in rings]
    m = len(ol)
    for a, b in zip(grid, grid[1:]):
        for i in range(m):
            bm.faces.new((a[i], a[(i + 1) % m], b[(i + 1) % m], b[i]))
    bm.faces.new(list(reversed(grid[0])))
    bm.faces.new(grid[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('scone')
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new('scone', me))
    md = ob.modifiers.new('rm', 'REMESH')
    md.mode = 'VOXEL'
    md.voxel_size = voxel
    md.use_smooth_shade = True
    lib.apply_modifiers(ob)

    # 변위 — 넘파이로 한 번에(정점 수만 개)
    me = ob.data
    me.update()
    nv = len(me.vertices)
    co = np.empty(nv * 3, dtype=np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nrm = np.empty(nv * 3, dtype=np.float64)
    me.vertices.foreach_get('normal', nrm)
    nrm = nrm.reshape(-1, 3)
    # 윤곽까지 평면 거리(안쪽 +)
    P = np.array([(p.x, p.y) for p in ol])
    Q = np.roll(P, -1, axis=0)
    d = Q - P
    L2 = (d * d).sum(1)
    best = np.full(nv, 1e9)
    for i in range(len(P)):  # 윤곽 선분마다(200개 안팎)
        t = np.clip(((co[:, :2] - P[i]) * d[i]).sum(1) / L2[i], 0, 1)
        q = P[i] + t[:, None] * d[i]
        best = np.minimum(best, np.hypot(*(co[:, :2] - q).T))
    zf = _smooth01((co[:, 2] - H * 0.55) / (H * 0.45))
    dz = dome * _smooth01(best / 0.30) * zf
    n1 = np.array([lib.n3(x * 3.2, y * 3.2, z * 3.2, seed) for x, y, z in co])
    n2 = np.array([lib.n3(x * 9, y * 9, z * 9, seed + 2) for x, y, z in co])
    disp = 0.008 * n1 + 0.003 * n2
    side = 1 - _smooth01((np.abs(nrm[:, 2]) - 0.4) / 0.4)
    # 옆 단면 가로 켜(접어 민 반죽 결) — 얕은 골 두 줄 + 크러스트 아래 턱
    for i, frac in enumerate(layers):
        wob = np.array([lib.n3(x * 4, y * 4, 0.0, seed + 5 + i) for x, y, _ in co]) * 0.03
        dep = 0.006 * (0.6 + 0.4 * np.array([lib.n3(x * 6, y * 6, 1.0, seed + 7 + i) for x, y, _ in co]))
        disp -= side * dep * np.exp(-((co[:, 2] - H * frac - wob) / 0.011) ** 2)
    # 골 0.0045 두 줄 + 턱은 고른 띠 셋으로 갈려 켜켜이 쌓은 케이크로 읽혔다(r1) — 켜는 얕게, 흔들림은 크게
    wob = np.array([lib.n3(x * 5, y * 5, 0.0, seed + 9) for x, y, _ in co]) * 0.008
    disp -= side * 0.005 * np.exp(-((co[:, 2] - (H - ledge) - wob) / 0.011) ** 2)
    # 크러스트 테가 옆벽보다 살짝 부풀어 나온다(레퍼런스 2번 — 윗면 띠가 버섯 갓처럼 덮는다)
    disp += side * 0.007 * np.exp(-((co[:, 2] - (H - ledge * 0.55)) / 0.025) ** 2)
    # 갈라짐 — 윗면에 골(깊이 0.013)을 판다. 정점 속성 crack = 골 바닥 정도(재질이 짙게 칠한다)
    top = _smooth01((nrm[:, 2] - 0.55) / 0.3) * (co[:, 2] > H - ledge * 0.5)
    dn = np.full(nv, 1e9)
    for pts, ws in crack_lines(lib, cracks, seed):
        for j in range(len(pts) - 1):
            p0, dd = pts[j], pts[j + 1] - pts[j]
            t = np.clip(((co[:, :2] - p0) * dd).sum(1) / max((dd * dd).sum(), 1e-12), 0, 1)
            dist = np.hypot(*(co[:, :2] - (p0 + t[:, None] * dd)).T)
            dn = np.minimum(dn, dist / (ws[j] + (ws[j + 1] - ws[j]) * t))
    groove = (1 - _smooth01((dn - 0.3) / 0.9)) * top
    disp -= 0.013 * groove
    disp += 0.0025 * np.exp(-((dn - 1.6) / 0.5) ** 2) * top  # 살짝 들린 입술
    # 옆 단면은 칼에 뜯긴 듯 울퉁불퉁 — 가로로 길쭉한 혹(xy 성기게, z 촘촘하게). 매끈한 띠는 치즈로 읽혔다(본세션 검수)
    torn = np.array([lib.n3(x * 7, y * 7, z * 22, seed + 11) for x, y, z in co])
    disp += side * (1 - _smooth01((co[:, 2] - (H - ledge)) / 0.02)) * 0.007 * torn
    co = co + nrm * disp[:, None]
    co[:, 2] += dz
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    lib.point_attr(ob, 'crack', groove)
    lib.delete_faces(ob, lambda c, n: c.z < 0.004 and n.z < -0.9)  # 바닥 — 안 보인다
    lib.decimate(ob, min(1.0, tris / max(1, lib.tri_count(ob))))
    lib.assign(ob, mat)
    return ob, ol, dict(R=R, half=half, H=H)


def place_all(parts, tip_alpha):
    """국소(꼭지 원점, +Y 바깥) → 세계: 꼭지가 썸네일 카메라 기준 tip_alpha°를 보게 돌리고 평면 가운데를 원점에"""
    pts = [v.co for p in parts for v in p.data.vertices]
    cx = (min(q.x for q in pts) + max(q.x for q in pts)) / 2
    cy = (min(q.y for q in pts) + max(q.y for q in pts)) / 2
    M = Matrix.Rotation(az(tip_alpha) + math.pi / 2, 4, 'Z') @ Matrix.Translation((-cx, -cy, 0))
    for p in parts:
        p.matrix_world = M


# ── 재질 ─────────────────────────────────────────────────────────────────────

def scone_material(lib, H, top_stops, side_stops, name='crumb', ledge=0.10, tones=None, stain=None, extra=None,
                   glaze=None, drizzle=None, gloss=0.78):
    """tones = 테 · 금 · 기공 색 덮어쓰기(반죽 색이 다른 변형) · stain = 정점 속성 stain 자리에 번지는 과즙 색 ·
    extra(m, top_c, side_c, p, crust) → (top_c, side_c) 무늬 · glaze = 윗면을 덮고 옆으로 흘러내리는 아이싱 색 ·
    gloss = 크러스트 거칠기(달걀물 윤은 낮춘다)"""
    t = dict(dict(edge='#D08A35', crack='#B0661F', pit='#C27A2C', pore='#D9B176', bot='#E2AC62'), **(tones or {}))
    m = lib.Mat(name)
    p = m.lpos()
    pz = m.sep(p)[2]
    nz = m.sep(m.lnrm())[2]
    blot = m.noise(p, scale=5.0, detail=5, rough=0.6, distortion=0.4)
    # 크러스트 = 크러스트 턱(H − ledge) 위. 경계는 얼룩으로 살짝 들쭉날쭉(흔들림은 턱 골 폭 안)
    crust = m.smooth(m.math('ADD', pz, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.02)),
                     H - ledge - 0.008, H - ledge + 0.012)
    top_c = m.ramp(blot, top_stops)
    # 모서리를 넘는 크러스트(기울어진 면)는 더 구워져 짙다
    edge = m.math('MULTIPLY', m.smooth(nz, 0.95, 0.6), crust)
    top_c = m.mix(m.math('MULTIPLY', edge, 0.35), top_c, t['edge'])  # 0.55·#C9802F는 테가 #BE833E 흙빛(r4)
    # 금 = 형상 골(build_wedge가 판다) + 골 바닥 색. 셰이더로만 그린 금은 분필·바느질 선으로 읽혔다(r1~r3)
    groove = m.attr('crack')
    top_c = m.mix(m.math('MULTIPLY', groove, 0.7), top_c, t['crack'])
    pit = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=48), 0.04, 0.10))
    top_c = m.mix(m.math('MULTIPLY', pit, 0.25), top_c, t['pit'])
    # 옆 = 크림 속살: 가로 켜(세로로 눌린 노이즈) + 가로로 길쭉한 기공
    strata = m.noise(m.mapping(p, scale=(4, 4, 20)), scale=1.0, detail=4, rough=0.55)
    side_c = m.ramp(strata, side_stops)
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 2.2)), scale=42), 0.05, 0.13))
    pore = m.math('MULTIPLY', pore, m.smooth(m.noise(p, scale=9, detail=2), 0.45, 0.6))
    side_c = m.mix(m.math('MULTIPLY', pore, 0.5), side_c, t['pore'])
    bot = m.math('SUBTRACT', 1.0, m.smooth(pz, 0.0, 0.045))  # 팬에 닿은 바닥 모서리 — 옅은 금빛
    side_c = m.mix(m.math('MULTIPLY', bot, 0.6), side_c, t['bot'])
    if extra:
        top_c, side_c = extra(m, top_c, side_c, p, crust)
    col = m.mix(crust, side_c, top_c)
    rough = m.mixf(crust, 0.88, gloss)
    if glaze:  # 가장자리에서 들쭉날쭉 흘러내린다(높이 문턱을 평면 잡음으로 흔든다). detail 1은 뾰족한 톱니 흘림(2026-11-16)
        drip = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(m.mapping(p, scale=(1, 1, 0)), scale=6, detail=0), 0.5), 0.5)
        drip = m.math('MAXIMUM', drip, -0.08)  # 깊게 파인 데는 윗모서리까지 벗겨져 베어 문 자국이 됐다
        g = m.smooth(m.math('ADD', pz, drip), H - 0.20, H - 0.185)
        g_col, g_a = glaze if isinstance(glaze, tuple) else (glaze, 0.82)  # (색, 불투명도) — 레몬은 1.0 판이 통과(사용자 「아까 거 좋았는데」)
        col = m.mix(m.math('MULTIPLY', g, g_a), col, g_col)
        rough = m.mixf(g, rough, 0.6)
    if drizzle:  # (색, 방향°, 줄 수, 줄 폭) — 윗면에 지그재그로 뿌린 아이싱 줄. 가장자리에서 조금 흘러내린다
        d_col, d_ang, d_freq, d_w = drizzle
        px = m.sep(p)
        u = m.math('ADD', m.math('MULTIPLY', px[0], math.cos(math.radians(d_ang))),
                   m.math('MULTIPLY', px[1], math.sin(math.radians(d_ang))))
        ph = m.math('ADD', m.math('MULTIPLY', u, d_freq), m.math('MULTIPLY', m.noise(p, scale=1.6, detail=2), 5.0))  # 줄 간격 · 굽이를 흩는다(고른 평행선은 줄무늬 천)
        line = m.math('ABSOLUTE', m.math('SUBTRACT', m.math('FRACT', ph), 0.5))
        wide = m.math('MULTIPLY', d_w, m.math('ADD', 0.25, m.math('MULTIPLY', m.noise(p, scale=6, detail=2), 1.5)))
        line = m.math('SUBTRACT', 1.0, m.smooth(m.math('DIVIDE', line, wide), 0.75, 1.0))
        run = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(m.mapping(p, scale=(1, 1, 0)), scale=11, detail=1), 0.5), 0.3)
        line = m.math('MULTIPLY', line, m.smooth(m.math('ADD', pz, run), H - 0.15, H - 0.135))
        col = m.mix(m.math('MULTIPLY', line, 0.92), col, d_col)
        rough = m.mixf(line, rough, 0.55)
    if stain:
        col = m.mix(m.math('MULTIPLY', m.smooth(m.attr('stain'), 0.05, 0.7), 0.85), col, stain)
    h_side = m.math('ADD', m.math('MULTIPLY', strata, 0.6), m.math('MULTIPLY', pore, -0.6))
    h_top = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=55, detail=3), 0.4), m.math('MULTIPLY', pit, -0.4))
    h = m.mixf(crust, h_side, h_top)
    # 굽기 노멀이 거의 평평했다(r1 표준편차 2/255) — 거리를 키운다
    return m.out(col, rough, m.bump(h, strength=0.8, distance=0.012))


# ── 덩어리(초콜릿 등) ─────────────────────────────────────────────────────────

def chunk(lib, name, size, rnd, sides=4, height=0.8, flat=0.55):
    """손으로 썬 덩어리 — 밑면 다각형(sides) · 좁고 비낀 윗면 · 아래로 묻힐 뿌리. 국소: 밑면 z=0, 위 +Z"""
    a0 = rnd.uniform(0, TAU)
    base = []
    for k in range(sides):
        a = a0 + TAU * k / sides + rnd.uniform(-0.3, 0.3)
        base.append(Vector((math.cos(a), math.sin(a), 0.0)) * size * rnd.uniform(0.8, 1.15))
    h = size * height * rnd.uniform(0.85, 1.15)
    sh = Vector((rnd.uniform(-0.18, 0.18), rnd.uniform(-0.18, 0.18), 0.0)) * size
    top = [b * flat * rnd.uniform(0.85, 1.1) + sh + Vector((0, 0, h)) for b in base]
    root = [b * 0.9 + Vector((0, 0, -h * 0.9)) for b in base]
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in base + top + root]
    bmesh.ops.convex_hull(bm, input=vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    # 모서리를 둥글린 뒤 한 번 더 매끈하게 — 베벨만(약 100 tri)은 구겨진 비닐처럼 읽혔다(r1)
    md = ob.modifiers.new('bev', 'BEVEL')
    md.width = size * 0.2
    md.segments = 2
    md.limit_method = 'ANGLE'
    md.angle_limit = math.radians(25)
    sd = ob.modifiers.new('sub', 'SUBSURF')
    sd.levels = 1
    lib.apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob, h


def press_into(lib, body, ob, h, at_xy=None, side_hit=None, sink=0.45, tilt=(0.0, 0.0), spin=0.0):
    """덩어리를 몸통 표면에 반쯤 묻는다. at_xy = 윗면 위치(위에서 쏜다) · side_hit = (원점, 방향) 옆면.
    tilt = 표면 법선에서 기울임(라디안 x·y), spin = 법선 축 회전. 몸통 안에 든 면은 지운다"""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    if at_xy is not None:
        loc, nrm, *_ = bvh.ray_cast(Vector((at_xy[0], at_xy[1], 5.0)), Vector((0, 0, -1)))
    else:
        loc, nrm, *_ = bvh.ray_cast(*side_hit)
    n = (Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y') @ nrm).normalized()
    hint = Matrix.Rotation(spin, 3, n) @ (Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0)))
    M = Matrix.Translation(loc - n * h * sink) @ frame(n, hint)
    ob.data.transform(M)
    ob.data.update()

    def buried(c, _n):
        hit = bvh.find_nearest(c)
        return hit[0] is not None and (c - hit[0]).dot(hit[1]) < -0.002

    lib.delete_faces(ob, buried)
    return ob


def chunk_material(lib, name, stops, rough=0.26):
    m = lib.Mat(name)
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=14, detail=3), stops)
    return m.out(col, rough, m.bump(m.noise(p, scale=70, detail=2), strength=0.12, distance=0.002))


# ── 스콘 변형 (scone--*) ─────────────────────────────────────────────────────

def veins(m, p, scale=3.0, width=0.05, warp=2.0):
    """반죽에 말려 든 소용돌이 결 — 잡음의 등고선 한 줄(0.5 근처)만 남긴다"""
    n = m.noise(p, scale=scale, detail=2, rough=0.5, distortion=warp)
    return m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.math('SUBTRACT', n, 0.5)), width * 0.4, width))


def fruit(core, bleed, scale=7.0, cover=0.63, halo=0.07, seed=0.0):
    """반죽에 묻혀 구워진 과육 → extra 함수. 실물은 알이 솟지 않고 터져 납작하게 묻히며 과즙이 번진다
    (동그란 알을 윗면에 올린 초안은 사용자 「징그러워」, 2026-11-15). 3D 잡음 얼룩이라 윗면 · 칼 단면에 함께 비친다.
    core = 과육 색 둘 · bleed = 번진 과즙 · scale 클수록 잘다 · cover = 빈 칸 비율(클수록 드물다)"""
    def extra(m, top_c, side_c, p, crust):
        # 보로노이 칸마다 둥근 얼룩 하나(3D 공을 면이 자르니 크기가 저절로 제각각) — 잡음 등고선은 지렁이 같은 줄무늬가 됐다
        pm = m.mapping(p, loc=(seed, seed * 1.7, seed * 0.3))
        d = m.math('ADD', m.voronoi(pm, scale=scale, randomness=1.0),
                   m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=scale * 1.6, detail=3, distortion=0.5), 0.5), 0.42))
        keep = m.smooth(m.sep(m.voronoi(pm, scale=scale, randomness=1.0, out='Color'))[0], cover, cover + 0.01)
        k = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.26, 0.31)), keep)
        b = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.16, 0.34 + halo * 4)), keep)  # 번짐은 넓고 흐리게(또렷한 고리는 눈알)
        c = m.ramp(m.noise(p, scale=40, detail=2), [(0.3, core[0]), (0.7, core[1])])
        return tuple(m.mix(k, m.mix(m.math('MULTIPLY', b, 0.55), col, bleed), c) for col in (top_c, side_c))
    return extra


def layer(m, p, side_c, col, z, thick, wave=None, vary=0.0):
    """옆면을 가로지르는 속 층 한 줄(시나몬 설탕 · 팥앙금) — 높이 z, 두께 thick, 살짝 물결친다.
    wave = 물결 높이(기본 thick×1.5) · vary = 두께 들쭉날쭉 비율(0이면 고른 띠 — 고른 띠는 자로 그은 줄로 읽힌다)"""
    w = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(m.mapping(p, scale=(1, 1, 0)), scale=5, detail=2), 0.5),
               thick * 1.5 if wave is None else wave)
    d = m.math('ABSOLUTE', m.math('SUBTRACT', m.math('ADD', m.sep(p)[2], w), z))
    if vary:
        d = m.math('DIVIDE', d, m.math('ADD', 1.0 - vary, m.math('MULTIPLY', m.noise(m.mapping(p, scale=(1, 1, 0.3)), scale=7, detail=2), 2 * vary)))
    return m.mix(m.math('SUBTRACT', 1.0, m.smooth(d, thick * 0.6, thick)), side_c, col)


def well(m, top_c, p, c, r, cols):
    """윗면 가운데 오목한 데 고인 잼(실물: 엄지로 눌러 잼을 채워 굽는다) — c = (x, y), r = 반지름, cols = 잼 색 둘"""
    px = m.sep(p)
    dx, dy = m.math('SUBTRACT', px[0], c[0]), m.math('SUBTRACT', px[1], c[1])
    d = m.math('SQRT', m.math('ADD', m.math('MULTIPLY', dx, dx), m.math('MULTIPLY', dy, dy)))
    d = m.math('ADD', d, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=5, detail=2), 0.5), 0.12))
    jam = m.ramp(m.noise(p, scale=22, detail=2), [(0.3, cols[0]), (0.7, cols[1])])
    col = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, r, r + 0.035)), 0.6), top_c, cols[0])  # 끓어 넘친 테
    return m.mix(m.math('SUBTRACT', 1.0, m.smooth(d, r - 0.015, r)), col, jam)


def dust(m, top_c, p, col, ang=30.0, amount=0.9):
    """체로 친 가루(슈가파우더 · 말차) — 윗면 한쪽 절반에만, 경계는 흐리다"""
    px = m.sep(p)
    u = m.math('ADD', m.math('MULTIPLY', px[0], math.cos(math.radians(ang))),
               m.math('MULTIPLY', m.math('SUBTRACT', px[1], 0.55), math.sin(math.radians(ang))))
    half = m.smooth(m.math('ADD', u, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=3, detail=2), 0.5), 0.35)), -0.10, 0.22)
    grain = m.smooth(m.noise(p, scale=140, detail=2), 0.22, 0.45)
    return m.mix(m.math('MULTIPLY', m.math('MULTIPLY', half, grain), amount), top_c, col)


def ball(lib, name, size, rnd, squash=0.85, jit=0.06):
    """베리 한 알 — 살짝 눌린 공(원점 = 가운데). → (ob, size)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=size)
    for v in bm.verts:
        v.co *= 1 + rnd.uniform(-jit, jit)
        v.co.z *= squash
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me)), size


def dried(lib, name, size, rnd, long=1.5, squash=0.6, wrinkle=0.14):
    """말린 과일 한 알(건포도 · 크랜베리) — 길쭉하고 눌린 공에 굵은 주름. 각진 이십면체 판은 보석 · 돌조각으로 읽혔다. → (ob, 높이)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=size)
    s0 = rnd.uniform(0, 100)
    for v in bm.verts:
        u = v.co / size
        w = 1 + wrinkle * (lib.n3(u.x * 2.2, u.y * 2.2, u.z * 2.2, s0) + 0.6 * lib.n3(u.x * 5, u.y * 5, u.z * 5, s0 + 3)
                           + 0.45 * lib.n3(u.x * 10, u.y * 10, u.z * 10, s0 + 7))  # 고운 주름 — 매끈한 알은 젤리 · 핏방울로 읽혔다
        v.co = Vector((v.co.x * long, v.co.y, v.co.z * squash)) * w
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me)), size * squash


def coin(lib, name, size, rnd, thick=0.3):
    """둥글게 썬 조각(바나나) — 모서리 둥근 원반, 밑면 z=0. → (ob, 두께)"""
    h = size * thick
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=size, radius2=size * 0.96, depth=h * 2,
                          matrix=Matrix.Diagonal((1.0, rnd.uniform(0.86, 0.96), 1.0, 1.0)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    md = ob.modifiers.new('bev', 'BEVEL')
    md.width = h * 0.35
    md.segments = 2
    md.limit_method = 'ANGLE'
    lib.apply_modifiers(ob)
    for f in ob.data.polygons:
        f.use_smooth = True
    return ob, h


def build_scone(lib, seed, top=None, side=None, tones=None, H=0.43, half=34.0, bits=(), stain=None, stain_r=0.09,
                side_stains=0, extra=None, glaze=None, drizzle=None, gloss=0.78, tip=-4, opts=None):
    """스콘 쐐기 + 박힌 것. bits = [dict(make=(lib, name, size, rnd) → (ob, h), mat, n, size=(a, b), sink=0.4,
    gap=0.0, at=[(x, y)…](자리 지정), mark=True(stain 번짐))]. 금 · 반각 · 높이는 seed 로 조금씩 달라진다. → (parts, opts)"""
    import random
    rnd = random.Random(seed)  # lib.reset(seed)는 빌더가 재질을 만들기 전에 부른다(reset이 재질을 지운다)
    hr = math.radians(half)
    top = top or ('#E4922E', '#F0AA44', '#FAC262')
    side = side or ('#F5D49C', '#FCE0AE', '#F8D8A4')
    mat = scone_material(lib, H, [(0.25, top[0]), (0.50, top[1]), (0.75, top[2])],
                         [(0.30, side[0]), (0.50, side[1]), (0.72, side[2])], tones=tones, stain=stain, extra=extra,
                         glaze=glaze, drizzle=drizzle, gloss=gloss)
    cracks = []
    for r in sorted(rnd.uniform(0.28, 0.76) for _ in range(rnd.choice((3, 4)))):
        a = rnd.uniform(-hr * 0.85, hr * 0.2)
        cracks.append(('arc', r, a, min(hr * 0.85, a + rnd.uniform(0.25, 0.6))))
    body, _, _ = build_wedge(lib, mat, H=H, half=hr, seed=seed * 0.7, cracks=cracks, tris=11000)
    parts, marks, taken = [body], [], []
    for bi, b in enumerate(bits):
        for k in range(b['n']):
            size = rnd.uniform(*b['size'])
            if 'at' in b:
                x, y = b['at'][k]
            else:
                for _ in range(80):
                    r, phi = math.sqrt(rnd.uniform(0.24 ** 2, 0.88 ** 2)), rnd.uniform(-hr, hr)
                    x, y = r * math.sin(phi), r * math.cos(phi)
                    if r * math.sin(hr - abs(phi)) > size + 0.035 and \
                            all(math.hypot(x - a, y - c) > size + q + b.get('gap', 0.0) for a, c, q in taken):
                        break
                else:
                    continue
            taken.append((x, y, size))
            ob, h = b['make'](lib, f'bit{bi}_{k}', size, rnd)
            press_into(lib, body, ob, h, at_xy=(x, y), sink=b.get('sink', 0.4),
                       tilt=(rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12)), spin=rnd.uniform(0, TAU))
            parts.append(lib.assign(ob, b['mat']))
            if b.get('mark', True):
                marks.append((Vector((x, y, H)), size + stain_r))
    for k in range(side_stains):  # 칼 단면에 비친 과육 — 형상 없이 색만(단면 조각은 혹으로 읽혔다)
        sgn = -1 if k % 2 else 1
        u = rnd.uniform(0.25, 0.85)
        marks.append((Vector((sgn * math.sin(hr) * u, math.cos(hr) * u, H * rnd.uniform(0.25, 0.7))),
                      stain_r * rnd.uniform(0.6, 1.0)))
    if stain:
        lib.point_attr(body, 'stain', [max([1 - (v.co - c).length / r for c, r in marks] + [0.0])
                                       for v in body.data.vertices])
    place_all(parts, tip_alpha=tip)
    print(f'  body {lib.tri_count(body)} tri · total {sum(lib.tri_count(q) for q in parts)}')
    return parts, dict(dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.5},
                            uv_weight={'crumb': 1.0, 'bit': 1.5}), **(opts or {}))
