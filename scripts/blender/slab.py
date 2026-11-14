"""납작한 빵 공용 — focaccia · focaccia--olive-flesh · cracker · flatbread 가 함께 쓴다 (docs/BREADS.md §Blender).

형상: 바닥 윤곽(둥근 사각·원) → 각기둥 → 위·아래 테 베벨 → 복셀 리메시(고른 격자라 딤플·기포를 밀어 넣기 좋다)
      → shape()로 정점 밀기 → finish()로 바닥 지우고 목표 삼각형까지 줄이기. 토핑은 surface()로 표면 높이를 재서 앉힌다.
재질: 포카치아 계열 토핑(올리브·로즈마리·소금·기름)과 껍질. 단위: 가장 긴 변 ≈ 1, 바닥 z=0, 정면 = −Y.
"""
import math
import random

import bmesh
import bpy
from lib import frame
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

TAU = math.tau


# ── 윤곽 ─────────────────────────────────────────────────────────────────────

def rect_outline(lib, L, W, rc, wob=0.0, seed=0.0, n_side=24, n_corner=8):
    """둥근 사각 윤곽(반시계) — 가로 L · 세로 W · 모서리 반경 rc. wob = 가장자리 출렁임(바깥 법선 방향)"""
    hx, hy = L / 2 - rc, W / 2 - rc
    pts = []
    corners = [(hx, hy, 0.0), (-hx, hy, math.pi / 2), (-hx, -hy, math.pi), (hx, -hy, 1.5 * math.pi)]
    for k, (cx, cy, a0) in enumerate(corners):
        for i in range(n_corner + 1):
            a = a0 + math.pi / 2 * i / n_corner
            pts.append((cx + rc * math.cos(a), cy + rc * math.sin(a), a))
        nx, ny, a1 = corners[(k + 1) % 4]
        for i in range(1, n_side):  # 다음 모서리까지 곧은 변
            t = i / n_side
            a = a0 + math.pi / 2
            pts.append((cx + (nx - cx) * t + rc * math.cos(a), cy + (ny - cy) * t + rc * math.sin(a), a))
    return [(x + wob * lib.n3(x * 3, y * 3, 0, seed) * math.cos(a), y + wob * lib.n3(x * 3, y * 3, 0, seed) * math.sin(a))
            for x, y, a in pts]


def round_outline(lib, R, n=128, wob=0.0, seed=0.0, ell=1.0):
    """원(타원) 윤곽 — wob = 반지름 출렁임 비율, ell = y/x 비"""
    out = []
    for i in range(n):
        a = TAU * i / n
        r = R * (1 + wob * lib.n3(math.cos(a) * 1.3, math.sin(a) * 1.3, 0, seed) + 0.4 * wob * math.sin(3 * a + seed))
        out.append((r * math.cos(a), r * ell * math.sin(a)))
    return out


# ── 판 ───────────────────────────────────────────────────────────────────────

def slab(lib, name, outline, T, top_bevel, bot_bevel, voxel=0.008):
    """윤곽 각기둥(두께 T) → 위 테 top_bevel · 아래 테 bot_bevel 둥글림 → 복셀 리메시(고른 사각 격자)"""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in outline]
    hi = [bm.verts.new((x, y, T)) for x, y in outline]
    n = len(outline)
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.normal_update()
    bm.edges.ensure_lookup_table()
    top_e = [e for e in bm.edges if all(v.co.z > T - 1e-6 for v in e.verts)]
    bot_e = [e for e in bm.edges if all(v.co.z < 1e-6 for v in e.verts)]
    for edges, off, seg in ((top_e, top_bevel, 5), (bot_e, bot_bevel, 3)):
        if off > 0:
            bmesh.ops.bevel(bm, geom=edges, offset=off, offset_type='OFFSET', profile_type='SUPERELLIPSE',
                            segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
            bm.edges.ensure_lookup_table()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    md = ob.modifiers.new('rm', 'REMESH')
    md.mode = 'VOXEL'
    md.voxel_size = voxel
    md.use_smooth_shade = True
    lib.apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def shape(ob, fn):
    """정점마다 fn(co, normal) → 더할 벡터(또는 None). 법선은 미기 전 값 — 다 민 뒤 다시 계산"""
    me = ob.data
    me.update()
    moves = []
    for v in me.vertices:
        d = fn(v.co.copy(), v.normal.copy())
        if d is not None:
            moves.append((v.index, d))
    for i, d in moves:
        me.vertices[i].co += d
    me.update()


def finish(lib, ob, tris, floor=0.004):
    """안 보이는 바닥면을 지우고 목표 삼각형까지 줄인다(접기 축소 — 평평한 곳부터 성겨진다)"""
    lib.delete_faces(ob, lambda c, n: c.z < floor and n.z < -0.5)
    lib.decimate(ob, min(1.0, tris / max(1, lib.tri_count(ob))))
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def surface(ob):
    """(x, y) → (윗면 높이, 법선). 판 바깥이면 None"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()

    def at(x, y):
        hit = tree.ray_cast(Vector((x, y, 2.0)), Vector((0, 0, -1)))
        return None if hit[0] is None else (hit[0].z, hit[1])
    return at


def bowl(d, depth, rim=0.0):
    """딤플 단면 — d = 중심 거리 / 반지름. 매끈한 사발 + 가장자리 밀려 오른 테"""
    out = -depth * (1 - d * d) ** 2 if d < 1 else 0.0
    if rim:
        out += rim * math.exp(-((d - 1.05) / 0.3) ** 2)
    return out


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def jitter_grid(cols, rows, L, W, rnd, jit):
    """판 위 격자 중심(가로 L · 세로 W 안) — (i, j, x, y)"""
    out = []
    for j in range(rows):
        for i in range(cols):
            x = -L / 2 + L * (i + 0.5) / cols + rnd.uniform(-jit, jit)
            y = -W / 2 + W * (j + 0.5) / rows + rnd.uniform(-jit, jit)
            out.append((i, j, x, y))
    return out


# ── 토핑 형상 ────────────────────────────────────────────────────────────────

def olive(lib, name, length, dia, hole=0.3, segs=14, half=False, mouth=70):
    """씨 뺀 통올리브(국소: 바닥 극 원점, 축 +Z, 위 극에 씨 구멍). hole = 구멍 반지름 / 몸 반지름.
    어깨가 구멍 테까지 곧장 닫힌다 — 테가 솟은 첫 판은 꼭지 달린 종으로 읽혔다(r2)"""
    R = dia / 2
    prof = []
    for k in range(9):  # 아래 극 → 어깨(mouth°, 70이면 반지름 0.34R = 구멍 테)
        t = -math.pi / 2 + math.radians(90 + mouth) * k / 8
        prof.append((R * math.cos(t) if k else 0.0, length / 2 * (1 + math.sin(t))))
    zt = prof[-1][1]
    prof += [(R * hole, zt - 0.08 * length), (R * hole * 0.8, zt - 0.24 * length), (0.0, zt - 0.3 * length)]
    def rfn(th, z):
        return 1 + 0.03 * math.sin(2 * th + length * 90) + 0.02 * math.sin(3 * th)

    if not half:
        return lib.lathe(name, prof, segs=segs, rfn=rfn)
    # 세로로 가른 반쪽(y ≥ 0) — 반 바퀴 껍질 + 단면(씨 자리 홈이 파인 평면, 법선 −Y)을 따로 붙인 섬.
    # 통올리브를 bisect로 가른 판은 단면이 겹치고 납작한 삼각형이 끼어 회색 부채꼴로 떴다(r8)
    ob = lib.lathe(name, prof, segs=segs, rfn=rfn, theta0=0.0, theta1=math.pi)
    lib.orient_faces(ob, lambda c: c - Vector((0, 0, length / 2)))
    mid = prof[1:-1]
    pts = ([(0.0, prof[0][1])] + [(r * rfn(0.0, z), z) for r, z in mid] + [(0.0, prof[-1][1])]
           + [(-r * rfn(math.pi, z), z) for r, z in reversed(mid)])
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    face = bm.faces.new([bm.verts.new((x, 0.0, z)) for x, z in pts])
    face.normal_update()
    if face.normal.y > 0:
        face.normal_flip()
    bmesh.ops.triangulate(bm, faces=[face], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def salt(lib, name, size, rnd):
    """굵은 소금 알 — 찌그러진 이십면체(각진 결정면). 정육면체는 각설탕으로 읽혔다(r2)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.5)
    sx, sy, sz = rnd.uniform(0.8, 1.2), rnd.uniform(0.8, 1.2), rnd.uniform(0.5, 0.7)
    for v in bm.verts:
        j = rnd.uniform(0.75, 1.15)
        v.co = Vector((v.co.x * sx * j, v.co.y * sy * j, v.co.z * sz * j)) * size
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return lib.link(bpy.data.objects.new(name, me))


def needle(bm, base, d, side, up, L, w):
    """로즈마리 잎 한 장 — 가운데 골이 선 납작한 마름모 띠(정점 10). d = 잎 방향, side = 잎 폭 방향"""
    rows = []
    for k, (t, hw) in enumerate(((0.0, 0.25), (0.3, 1.0), (0.7, 0.85), (1.0, 0.0))):
        c = base + d * (L * t) + up * (0.0015 * math.sin(math.pi * t))
        if hw == 0.0:
            rows.append([bm.verts.new(c)])
        else:
            rows.append([bm.verts.new(c - side * (w / 2 * hw)), bm.verts.new(c + up * (w * 0.25 * hw)),
                         bm.verts.new(c + side * (w / 2 * hw))])
    for a, b in zip(rows, rows[1:]):
        if len(b) == 1:
            bm.faces.new((a[0], a[1], b[0]))
            bm.faces.new((a[1], a[2], b[0]))
        else:
            bm.faces.new((a[0], a[1], b[1], b[0]))
            bm.faces.new((a[1], a[2], b[2], b[1]))


def rosemary(lib, name, length, rnd, n_pairs=3):
    """로즈마리 잔가지(국소: 바닥에 눕힘, 줄기 +X, 원점 = 줄기 밑동) — 줄기 관 + 어긋나게 붙은 바늘잎"""
    if n_pairs == 0:  # 낱 바늘잎 한 장
        bm = bmesh.new()
        needle(bm, Vector((0, 0, 0)), Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)), length, length * 0.13)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = lib.link(bpy.data.objects.new(name, me))
        for p in me.polygons:
            p.use_smooth = True
        lib.solidify(ob, 0.0015)
        return [ob]
    bend = rnd.uniform(-0.25, 0.25)
    stem = [(length * t, bend * length * t * t * 0.5, 0.0) for t in (0, 0.33, 0.66, 1.0)]
    parts = [lib.curve_tube(name + '_s', stem, [1.0, 0.95, 0.8, 0.55], bevel_depth=0.0022)]
    bm = bmesh.new()
    up = Vector((0, 0, 1))
    for k in range(n_pairs * 2):
        t = 0.12 + 0.86 * (k // 2 + 0.5 * (k % 2)) / n_pairs
        base = Vector((length * t, bend * length * t * t * 0.5, 0.0))
        tang = Vector((1.0, bend * t, 0.0)).normalized()
        sgn = 1 if k % 2 else -1
        ang = math.radians(rnd.uniform(30, 48))
        d = (tang * math.cos(ang) + up.cross(tang) * (sgn * math.sin(ang))).normalized()
        L = length * rnd.uniform(0.4, 0.5) * (1 - 0.35 * t)
        needle(bm, base, d, up.cross(d), up, L, length * 0.085)
    me = bpy.data.meshes.new(name + '_n')
    bm.to_mesh(me)
    bm.free()
    nd = lib.link(bpy.data.objects.new(name + '_n', me))
    for p in me.polygons:
        p.use_smooth = True
    lib.solidify(nd, 0.0012)
    parts.append(nd)
    return parts


def seat(lib, obs, M):
    for o in obs:
        o.matrix_world = M
    return obs


def tilt_frame(nrm, yaw, lean=0.0, lean_dir=0.0):
    """표면 법선을 따라 세우고 yaw 만큼 돌린 회전 — lean(라디안)만큼 lean_dir 방위로 기울인다"""
    up = (nrm + Vector((math.cos(lean_dir), math.sin(lean_dir), 0.0)) * math.tan(lean)).normalized()
    return frame(up, Vector((math.cos(yaw), math.sin(yaw), 0.0)))


# ── 재질 ─────────────────────────────────────────────────────────────────────

def olive_material(lib, skin=('#241A20', '#35252D', '#47323C'), hole='#0E0A0C', cut=None, rough=0.22):
    """올리브 — 껍질 noise 3단 · 씨 구멍 안 벽(법선이 축을 본다)은 hole 색 · 반쪽이면 단면(국소 −Y) cut 색"""
    m = lib.Mat('olive')
    p = m.lpos()
    px = m.sep(p)
    col = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, skin[0]), (0.5, skin[1]), (0.7, skin[2])])
    radial = m.vmath('NORMALIZE', m.combine(px[0], px[1], 0.0))
    inner = m.smooth(m.math('MULTIPLY', m.vmath('DOT_PRODUCT', m.lnrm(), radial), -1.0), 0.1, 0.5)
    if cut:
        face = m.smooth(m.math('MULTIPLY', m.sep(m.lnrm())[1], -1.0), 0.85, 0.95)
        col = m.mix(face, col, m.ramp(m.noise(p, scale=70, detail=3), [(0.3, cut[0]), (0.7, cut[1])]))
        rough = m.mixf(face, rough, 0.8)  # 단면이 방 반사로 회색·흰 원반처럼 떴다(r5 · 뒤쪽 턴테이블 r8)
    col = m.mix(inner, col, hole)
    return m.out(col, rough, m.bump(m.noise(p, scale=120, detail=2), strength=0.08, distance=0.001))


def rosemary_material(lib):
    m = lib.Mat('rosemary')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=60, detail=2), [(0.3, '#77A252'), (0.7, '#9CC070')])
    return m.out(col, 0.5)


def salt_material(lib):
    m = lib.Mat('salt')
    col = m.ramp(m.noise(m.lpos(), scale=200, detail=2), [(0.3, '#EFE4CE'), (0.7, '#FCF6EA')])
    return m.out(col, 0.3)


def oil_material(lib, a='#A86A00', b='#C28A10'):
    """딤플에 고인 올리브유 — 진한 호박색, 거울 윤기(0.08)"""
    m = lib.Mat('oil')
    col = m.ramp(m.noise(m.lpos(), scale=25, detail=2), [(0.3, a), (0.7, b)])
    return m.out(col, 0.08)


def oil_pool(lib, name, r, segs=20):
    """기름 웅덩이 원반(국소: 가운데 원점, 위 +Z) — 딤플 안 수평면. 딤플 벽 밖으로 나간 테는 반죽에 묻힌다"""
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0))
    ring = [bm.verts.new((r * math.cos(TAU * i / segs), r * math.sin(TAU * i / segs), -0.15 * r))
            for i in range(segs)]
    mid = [bm.verts.new((0.6 * r * math.cos(TAU * i / segs), 0.6 * r * math.sin(TAU * i / segs), 0.0))
           for i in range(segs)]
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((c, mid[i], mid[j]))
        bm.faces.new((mid[i], ring[i], ring[j], mid[j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.orient_faces(ob, lambda q: Vector((0, 0, 1)))
    for p in me.polygons:
        p.use_smooth = True
    return ob


def rect_sdf(x, y, L, W, rc):
    """둥근 사각 부호 거리(안 = 음수)"""
    qx, qy = abs(x) - (L / 2 - rc), abs(y) - (W / 2 - rc)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - rc


def attrs(lib, ob, fns):
    """정점 속성 여러 개 — fns = {이름: fn(co, normal) → 실수}. 재질에서 Mat.attr(이름)로 읽는다"""
    me = ob.data
    me.update()
    for name, fn in fns.items():
        lib.point_attr(ob, name, [fn(v.co, v.normal) for v in me.vertices])


def focaccia_crust(lib, T, top=('#EBA238', '#F7BC50', '#FCCB62'), brown='#C47420', dimple='#B07510',
                   side=('#EBC98A', '#F2D49C'), pore='#C29A55', bump=0.35, rough_top=0.74):
    """포카치아 껍질 — 윗면 금빛 얼룩 · 테·솟은 곳 구운 갈색(속성 brown) · 딤플 속 기름 밴 호박색(속성 dimp) ·
    옆면 위쪽은 기름에 튀겨진 금빛 띠, 아래는 기공 보이는 속살빛. 거칠기: 껍질 0.75 · 옆면 0.85 · 딤플 0.3(기름)"""
    m = lib.Mat('crust')
    p = m.lpos()
    nz = m.sep(m.lnrm())[2]
    z = m.sep(p)[2]
    blot = m.noise(p, scale=7, detail=6, rough=0.62, distortion=0.3)
    top_c = m.ramp(blot, [(0.3, top[0]), (0.5, top[1]), (0.7, top[2])])
    fine = m.noise(p, scale=40, detail=3)
    top_c = m.mix(m.math('MULTIPLY', m.smooth(fine, 0.55, 0.75), 0.35), top_c, brown)  # 잔 구움 반점
    top_c = m.mix(m.math('MULTIPLY', m.attr('brown'), 0.8), top_c, brown)
    dim = m.smooth(m.attr('dimp'), 0.1, 0.55)
    top_c = m.mix(dim, top_c, dimple)
    crust = m.smooth(m.math('ADD', nz, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.08)), 0.35, 0.6)
    side_c = m.ramp(m.noise(p, scale=11, detail=3), [(0.35, side[0]), (0.65, side[1])])
    pores = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 1.6)), scale=55), 0.06, 0.14))
    pores = m.math('MULTIPLY', pores, m.smooth(m.noise(p, scale=9, detail=2), 0.42, 0.55))
    band = m.smooth(m.math('ADD', z, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.03 * T / 0.12)),
                    T * 0.42, T * 0.72)  # 옆면 위쪽 금빛 띠
    pores = m.math('MULTIPLY', pores, m.math('SUBTRACT', 1.0, band))
    side_c = m.mix(pores, side_c, pore)
    side_c = m.mix(band, side_c, m.mix(0.5, top_c, brown))
    col = m.mix(crust, side_c, top_c)
    rough = m.mixf(crust, 0.85, m.mixf(dim, rough_top, 0.3))
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=80, detail=2), 0.3), m.math('MULTIPLY', pores, -0.8))
    h = m.math('ADD', h, m.math('MULTIPLY', blot, 0.4))
    return m.out(col, rough, m.bump(h, strength=bump, distance=0.003))


# ── 포카치아 조립 ────────────────────────────────────────────────────────────

def build_focaccia(lib, seed, L, W, T, RC, oil, olives, oil_r, oil_d, olive_r, olive_d, pins=(), slab_tris=11000,
                   crust_kw=None, olive_kw=None, olive_len=(0.078, 0.086), olive_dia=(0.068, 0.074),
                   olive_sink=0.3, olive_lean=(5, 20), olive_half=False, olive_face=None, sprigs=9, sprig_len=(0.11, 0.14), sprig_pairs=3,
                   salt_n=36, salt_size=(0.02, 0.03), bevel=(0.04, 0.014), wave=1.0, ao_crust=0.7, olive_oil=0.0):
    """포카치아 판 — 딤플(기름 웅덩이 oil · 올리브 olives · 바늘 자국 pins) · 로즈마리 · 소금. → (parts, opts)
    좌표 목록은 판 위 (x, y). 크기·개수·색만 빵마다 다르다"""
    rnd = random.Random(seed)
    crust = focaccia_crust(lib, T, **(crust_kw or {}))
    olive_m, rose_m = olive_material(lib, **(olive_kw or {})), rosemary_material(lib)
    salt_m, oil_m = salt_material(lib), oil_material(lib)
    holes = ([(x, y, oil_r, oil_d) for x, y in oil] + [(x, y, olive_r, olive_d) for x, y in olives]
             + [(x, y, 0.012, 0.012) for x, y in pins])

    ob = slab(lib, 'slab', rect_outline(lib, L, W, RC, wob=0.008, seed=2.0), T, *bevel)

    def push(co, n):
        w = smoothstep(0.45, 0.9, n.z)
        if w <= 0:
            return None
        dz = wave * (0.008 * lib.n3(co.x * 4, co.y * 4, 0, 1.0) + 0.004 * lib.n3(co.x * 11, co.y * 11, 0, 3.0))
        for x, y, r, d in holes:
            dd = math.hypot(co.x - x, co.y - y) / r
            if dd < 1.6:
                dz += bowl(dd, d, rim=0.12 * d)
        return Vector((0, 0, dz * w))

    shape(ob, push)
    finish(lib, ob, slab_tris)

    def dimp(co, n):
        best = max([1 - math.hypot(co.x - x, co.y - y) / oil_r for x, y in oil]
                   + [olive_oil * (1 - math.hypot(co.x - x, co.y - y) / olive_r) for x, y in olives] + [0.0])
        return best * smoothstep(0.3, 0.7, n.z)

    def brown(co, n):
        edge = 1 - smoothstep(0.0, 0.07, -rect_sdf(co.x, co.y, L, W, RC))
        return edge * smoothstep(0.2, 0.6, n.z) * (0.6 + 0.4 * lib.n3(co.x * 9, co.y * 9, 0, 5.0))

    attrs(lib, ob, {'dimp': dimp, 'brown': brown})
    parts = [lib.assign(ob, crust)]
    surf = surface(ob)

    # 기름 웅덩이 — 딤플 바닥에서 깊이 절반까지 찬 수평면
    for k, (x, y) in enumerate(oil):
        z0, _ = surf(x, y)
        pool = oil_pool(lib, f'oil{k}', oil_r * 0.62)
        pool.matrix_world = Matrix.Translation((x, y, z0 + oil_d * 0.5))
        parts.append(lib.assign(pool, oil_m))

    # 통올리브 — 씨 구멍이 위, 몸 일부를 반죽에 묻는다
    for k, (x, y) in enumerate(olives):
        z0, n = surf(x, y)
        ln = rnd.uniform(*olive_len)
        ol = olive(lib, f'olive{k}', ln, rnd.uniform(*olive_dia), half=olive_half,
                   **(dict(hole=0.48, mouth=56) if olive_half else {}))  # 반쪽은 씨 자리 홈을 넓게
        lean_dir = rnd.uniform(0, TAU) if olive_face is None else olive_face + rnd.uniform(-1.2, 1.2)
        R = tilt_frame(n, rnd.uniform(0, TAU), math.radians(rnd.uniform(*olive_lean)), lean_dir)
        if olive_half:  # 반쪽은 눕혀 단면(국소 −Y)이 위 — 가운데(단면 위 축)를 딤플 바닥 조금 위에
            R = R @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        ol.matrix_world = (Matrix.Translation((x, y, z0 + ln * (0.5 - olive_sink))) @ R
                           @ Matrix.Translation((0, 0, -ln / 2)))  # 몸 가운데를 축으로 기울인다
        parts.append(lib.assign(ol, olive_m))

    taken = [(x, y, olive_r * 0.9) for x, y in olives]

    def free_spot(margin, clear):
        for _ in range(200):
            x = rnd.uniform(-L / 2 + margin, L / 2 - margin)
            y = rnd.uniform(-W / 2 + margin, W / 2 - margin)
            if all(math.hypot(x - a, y - b) > r + clear for a, b, r in taken):
                return x, y
        return None

    # 로즈마리 — 바닥에 눕혀 표면을 따라 앉힌다. 딤플 위를 건너가도 된다(레퍼런스처럼)
    for k in range(sprigs):
        ln = rnd.uniform(*sprig_len)
        spot = free_spot(ln / 2 + 0.04, 0.0)
        if not spot:
            continue
        yaw = rnd.uniform(0, TAU)
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        x, y = spot[0] - d.x * ln / 2, spot[1] - d.y * ln / 2  # 자리 = 잔가지 가운데
        zs = [surf(x + d.x * ln * t, y + d.y * ln * t)[0] for t in (0.0, 0.5, 1.0)]
        pitch = math.atan2(zs[2] - zs[0], ln)
        M = (Matrix.Translation((x, y, max(zs[0], zs[1] - (zs[2] - zs[0]) / 2) + 0.0015))
             @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-pitch, 4, 'Y'))
        for o in rosemary(lib, f'rose{k}', ln, rnd, n_pairs=sprig_pairs):
            o.matrix_world = M
            parts.append(lib.assign(o, rose_m))
        taken.append((spot[0], spot[1], ln / 2))

    # 굵은 소금 — 딤플 밖에만
    taken += [(x, y, oil_r) for x, y in oil]
    for k in range(salt_n):
        spot = free_spot(0.05, 0.012)
        if not spot:
            continue
        x, y = spot
        z0, n = surf(x, y)
        sz = rnd.uniform(*salt_size)
        g = salt(lib, f'salt{k}', sz, rnd)
        R = tilt_frame(n, rnd.uniform(0, TAU), math.radians(rnd.uniform(0, 25)), rnd.uniform(0, TAU))
        g.matrix_world = Matrix.Translation((x, y, z0 + sz * 0.2)) @ R
        parts.append(lib.assign(g, salt_m))
        taken.append((x, y, sz))

    print(f'  slab {lib.tri_count(parts[0])} tri · total {sum(lib.tri_count(p) for p in parts)}')
    return parts, dict(size=1024, rough_size=512, ao_samples=48,
                       ao_strength={'*': 0.6, 'crust': ao_crust, 'salt': 0.3, 'oil': 0.3},
                       uv_weight={'crust': 1.0, 'olive': 1.3, 'rosemary': 1.6, 'salt': 1.2, 'oil': 1.0})
