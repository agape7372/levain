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

def scone_material(lib, H, top_stops, side_stops, name='crumb', ledge=0.10):
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
    top_c = m.mix(m.math('MULTIPLY', edge, 0.35), top_c, '#D08A35')  # 0.55·#C9802F는 테가 #BE833E 흙빛(r4)
    # 금 = 형상 골(build_wedge가 판다) + 골 바닥 색. 셰이더로만 그린 금은 분필·바느질 선으로 읽혔다(r1~r3)
    groove = m.attr('crack')
    top_c = m.mix(m.math('MULTIPLY', groove, 0.7), top_c, '#B0661F')
    pit = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=48), 0.04, 0.10))
    top_c = m.mix(m.math('MULTIPLY', pit, 0.25), top_c, '#C27A2C')
    # 옆 = 크림 속살: 가로 켜(세로로 눌린 노이즈) + 가로로 길쭉한 기공
    strata = m.noise(m.mapping(p, scale=(4, 4, 20)), scale=1.0, detail=4, rough=0.55)
    side_c = m.ramp(strata, side_stops)
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 2.2)), scale=42), 0.05, 0.13))
    pore = m.math('MULTIPLY', pore, m.smooth(m.noise(p, scale=9, detail=2), 0.45, 0.6))
    side_c = m.mix(m.math('MULTIPLY', pore, 0.5), side_c, '#D9B176')
    bot = m.math('SUBTRACT', 1.0, m.smooth(pz, 0.0, 0.045))  # 팬에 닿은 바닥 모서리 — 옅은 금빛
    side_c = m.mix(m.math('MULTIPLY', bot, 0.6), side_c, '#E2AC62')
    col = m.mix(crust, side_c, top_c)
    rough = m.mixf(crust, 0.88, 0.78)
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
