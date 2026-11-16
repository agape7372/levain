"""깜빠뉴 계열 조립 — campagne · campagne--* 가 부르고, 통밀 깜빠뉴 변형도 shape · disp · crust 만 바꿔 부른다.

build_campagne_variant(lib, seed, …) → (parts, opts):
  둥근 불(boule.boule_mesh) → 단면(cut: 쐐기 · 앞 뚜껑, 불리언) → 껍질에 박거나 얹는 조각(bits).
단면 속살(crumb_material)은 3D 위치 식이라 두 단면 · 껍질 테가 어긋나지 않는다(딸기 스월 깜빠뉴의 수법을 일반화).
재질 · 조각 재질은 lib.reset 뒤에 지어야 하므로 전부 함수(lib → 재질)로 받는다.
"""
import math
import random

import bmesh
import bpy
import wedge
from boule import Score, Shape, boule_mesh, campagne_crust, drop_base
from lib import TAU, az, horiz
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SHAPE = Shape()
SCORE = Score([az(45), az(-45)])  # 깜빠뉴 X 칼집


# ── 단면 ─────────────────────────────────────────────────────────────────────

def cutter(lib, shape, cut, mat):
    """덜어낼 기둥. cut = ('wedge', 왼쪽°, 오른쪽°) 축을 꼭짓점으로 한 쐐기(카메라 기준 각, + = 화면 오른쪽) |
    ('cap', 방위°, 축 거리) 그 방위 쪽 평면 너머를 덜어 카메라를 보는 둥근 단면 하나"""
    if cut[0] == 'wedge':
        a0, a1 = az(cut[1]), az(cut[2])
        apex = -horiz((a0 + a1) / 2) * 0.004  # 꼭짓점은 축 바로 뒤(축 위면 극 정점과 겹쳐 불리언이 흔들린다)
        ring = [apex] + [horiz(a0 + (a1 - a0) * k / 12) * 0.9 for k in range(13)]
    else:
        n = horiz(az(cut[1]))
        t = Vector((-n.y, n.x, 0.0))
        ring = [n * cut[2] - t * 0.9, n * 0.9 - t * 0.9, n * 0.9 + t * 0.9, n * cut[2] + t * 0.9]
    bm = bmesh.new()
    lo = [bm.verts.new((v.x, v.y, -0.05)) for v in ring]
    hi = [bm.verts.new((v.x, v.y, shape.H + 0.1)) for v in ring]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('cutter')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False  # 단면은 평평하게
    return lib.assign(lib.link(bpy.data.objects.new('cutter', me)), mat)


def _noisy_dist(m, p, pm, scale, jag):
    """보로노이 F1 거리 + 잡음 — 칸마다 일그러진 덩이 모양"""
    return m.math('ADD', m.voronoi(pm, scale=scale, randomness=1.0),
                  m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=scale * 1.6, detail=3, distortion=0.5), 0.5), jag))


def _piece(m, p, q):
    """속에 박힌 조각 한 종류 → (덮임 k, 색, 거칠기, 번짐 b). q = dict(
    scale, cover(클수록 드물다), r=0.26, cols=(둘), cols2=None(칸 절반은 이 색), edge=None, rough=0.4, seed=0, stretch,
    jag=0.42(가장자리 들쭉날쭉), size_var=0(칸마다 크기 차), ring=None(안 반지름 비 — 올리브 고리),
    half=0(반달로 자를 칸 비율), veins=None((잡음 배율, 색) 주름), halo=None((색, 농도) 옅게 밴 물))"""
    r0, sd = q.get('r', 0.26), q.get('seed', 0.0)
    pm = m.mapping(p, loc=(sd, sd * 1.7, sd * 0.3), scale=q.get('stretch', (1, 1, 1)))
    rnd = m.sep(m.voronoi(pm, scale=q['scale'], randomness=1.0, out='Color'))
    dd = _noisy_dist(m, p, pm, q['scale'], q.get('jag', 0.42))
    sv = q.get('size_var', 0.0)
    if sv:
        dd = m.math('DIVIDE', dd, m.math('ADD', 1 - sv / 2, m.math('MULTIPLY', rnd[1], sv)))
    keep = m.smooth(rnd[0], q['cover'], q['cover'] + 0.01)
    k = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(dd, r0, r0 + 0.03)), keep)
    b = None
    if q.get('halo'):
        b = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(dd, r0, r0 + 0.14)), keep)
    if q.get('ring'):  # 씨 빠진 구멍 — 속살이 비친다
        k = m.math('MULTIPLY', k, m.smooth(dd, r0 * q['ring'], r0 * q['ring'] + 0.025))
    if q.get('half'):  # 칸 일부는 반달 — 칸 중심에서 무작위 방향 반쪽만
        off = m.vmath('SUBTRACT', pm, m.voronoi(pm, scale=q['scale'], randomness=1.0, out='Position'))
        dirv = m.vmath('SUBTRACT', m.voronoi(pm, scale=q['scale'], randomness=1.0, out='Color'), (0.5, 0.5, 0.5))
        side = m.smooth(m.vmath('DOT_PRODUCT', off, dirv), -0.001, 0.001)
        sel = m.smooth(rnd[2], 1 - q['half'], 1.01 - q['half'])
        k = m.math('MULTIPLY', k, m.mixf(sel, 1.0, side))
    pc = m.ramp(m.noise(p, scale=40, detail=2), [(0.3, q['cols'][0]), (0.7, q['cols'][1])])
    if q.get('cols2'):
        pc2 = m.ramp(m.noise(p, scale=40, detail=2), [(0.3, q['cols2'][0]), (0.7, q['cols2'][1])])
        pc = m.mix(m.smooth(rnd[2], 0.48, 0.5), pc, pc2)
    if q.get('veins'):
        v = m.noise(p, scale=q['veins'][0], detail=2, rough=0.5, distortion=1.5)
        v = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.math('SUBTRACT', v, 0.5)), 0.03, 0.08))
        pc = m.mix(m.math('MULTIPLY', v, 0.8), pc, q['veins'][1])
    if q.get('seeds'):  # (배율, 색) 조각 속 잔 씨(무화과) — 조각 안에서만이라 속살 위 점이 되지 않는다
        sdist = m.voronoi(p, scale=q['seeds'][0], randomness=1.0)
        pc = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(sdist, 0.12, 0.2)), 0.9), pc, q['seeds'][1])
    if q.get('edge'):  # 조각 가장자리 한 겹(껍질)
        pc = m.mix(m.smooth(dd, r0 - 0.06, r0 - 0.02), pc, q['edge'])
    return k, pc, q.get('rough', 0.4), b


def _holes(m, p, holes):
    """기공 두 단(큰 길쭉한 것 드문드문 · 중간) → (구멍 1, 깊은 속 1)"""
    hole, deep = None, None
    # 단면 폭 ≈ 0.4 — 배율 5(첫 판)는 칸이 넷뿐이라 구멍이 한둘이었다. 큰 것 11 · 중간 24로 수십 개
    for sc, r, keep, st, w in ((11.0, 0.33, 0.4, (1.4, 1.4, 0.6), 1.0), (24.0, 0.28, 0.35, (1.2, 1.2, 0.75), 0.5)):
        pm = m.mapping(p, loc=(sc * 0.37, sc * 0.11, 0.0), scale=st)
        d = _noisy_dist(m, p, pm, sc / holes, 0.55)
        hl = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, r - 0.05, r)), w)
        hl = m.math('MULTIPLY', hl, m.smooth(m.sep(m.voronoi(pm, scale=sc / holes, randomness=1.0, out='Color'))[0],
                                             keep, keep + 0.02))
        dp = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, r - 0.2, r - 0.06)), hl if w == 1.0 else 0.0)
        hole = hl if hole is None else m.math('MAXIMUM', hole, hl)
        deep = dp if deep is None else m.math('MAXIMUM', deep, dp)
    return hole, deep


def crumb_material(lib, shape, name='crumb', base=('#EAC48A', '#F4D69E'), pore='#B07432', rim='#8E4512',
                   swirl=None, pieces=None, pore_a=1.0, holes=1.0, deep_col='#7A3E10'):
    """단면 속살 — 크림 베이지 + 사워도우 기공(크고 길쭉한 것 · 중간 · 잔 것 세 단, 그늘 색 + 노멀로 판다) + 껍질 테.
    매끈한 흰 판에 바늘구멍(첫 판)은 스티로폼 · 치즈로 읽혀 그 위 조각이 벌레 · 상처로 보였다(두뇌 검수 2026-11-16).
    swirl = dict(c=(r, z), pitch, R, w, cols=(셋), halo, rough, wob): 축 거리 r · 높이 z 평면의 소용돌이.
    pieces = _piece() 의 dict 또는 그 목록(종류 여럿 — 크랜베리 + 호두). holes = 기공 크기 배율"""
    m = lib.Mat(name)
    p = m.lpos()
    px = m.sep(p)
    col = m.ramp(m.noise(p, scale=7, detail=3), [(0.35, base[0]), (0.65, base[1])])
    rough = 0.86
    h = None
    occ = None  # 조각이 덮은 데 — 기공을 비운다
    if swirl:
        s = swirl
        r = m.vmath('LENGTH', m.combine(px[0], px[1], 0.0))
        qr, qz = m.math('SUBTRACT', r, s['c'][0]), m.math('SUBTRACT', px[2], s['c'][1])
        rho = m.vmath('LENGTH', m.combine(qr, qz, 0.0))
        phase = m.math('ADD', m.math('DIVIDE', rho, s['pitch']), m.math('DIVIDE', m.math('ARCTAN2', qz, qr), TAU))
        wob = s.get('wob', 1.0)  # 손으로 만 결 — 고른 띠는 과녁으로 읽혔다(딸기 스월 r2 · r4)
        phase = m.math('ADD', phase, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=7, detail=3), 0.5), 0.8 * wob))
        d = m.math('ABSOLUTE', m.math('SUBTRACT', m.math('FRACT', phase), 0.5))
        env = m.math('MULTIPLY', m.smooth(rho, 0.004, 0.018), m.math('SUBTRACT', 1.0, m.smooth(rho, s['R'] - 0.02, s['R'])))
        d = m.math('ADD', d, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=9, detail=3), 0.5), 1.2 * wob))
        w = s['w']
        band = m.math('MULTIPLY', m.smooth(d, 0.5 - w / 2 - 0.05, 0.5 - w / 2 + 0.03), env)
        halo = m.math('MULTIPLY', m.smooth(d, 0.5 - w / 2 - 0.09, 0.5 - w / 2), env)
        col = m.mix(m.math('MULTIPLY', halo, 0.55), col, s['halo'])
        sc = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, s['cols'][0]), (0.5, s['cols'][1]), (0.7, s['cols'][2])])
        col = m.mix(band, col, sc)
        rough = m.mixf(band, rough, s.get('rough', 0.8))
        occ = band
    pk = []
    for q in ([pieces] if isinstance(pieces, dict) else (pieces or [])):
        k, pc, pr, b = _piece(m, p, q)
        if b is not None:
            col = m.mix(m.math('MULTIPLY', b, q['halo'][1]), col, q['halo'][0])
        pk.append((k, pc, pr))
        occ = k if occ is None else m.math('MAXIMUM', occ, k)
    # 기공 — 큰 것(길쭉, 드문드문) · 중간은 색과 노멀, 잔 것은 노멀만(색으로 두면 고른 잔 점 = 벌레, 2판 검수).
    # 회색 얼룩(2판)은 구멍이 아니라 곰팡이로 읽혔다 — 채도 있는 그늘 + 윗벽 그림자(위로 조금 민 자리와의 차)로 판다
    hole, deep = _holes(m, p, holes)
    up, _ = _holes(m, m.vmath('ADD', p, (0.0, 0.0, 0.012)), holes)
    shade = m.math('MAXIMUM', m.math('SUBTRACT', hole, up), 0.0)  # 구멍 윗벽 그늘
    fine = m.math('SUBTRACT', 1.0, m.smooth(_noisy_dist(m, p, m.mapping(p, scale=(1, 1, 1.4)), 60 / holes, 0.4), 0.2, 0.28))
    if occ is not None:
        free = m.math('SUBTRACT', 1.0, occ)
        hole, deep, shade, fine = (m.math('MULTIPLY', v, free) for v in (hole, deep, shade, fine))
    col = m.mix(m.math('MULTIPLY', hole, 0.7 * pore_a), col, pore)
    col = m.mix(m.math('MULTIPLY', m.math('MAXIMUM', deep, shade), 0.85 * pore_a), col, deep_col)
    rough = m.mixf(hole, rough, 0.62)
    h = m.math('ADD', m.math('MULTIPLY', hole, -1.0), m.math('MULTIPLY', fine, -0.35))
    for k, pc, pr in pk:
        col = m.mix(k, col, pc)
        rough = m.mixf(k, rough, pr)
        h = m.math('ADD', h, m.math('MULTIPLY', k, 0.4))
    if swirl:
        h = m.math('ADD', h, m.math('MULTIPLY', band, 0.25))
    # 껍질 테 — 겉면까지 두께 ≈ 0.02(정규화 반지름 0.95~) · 바닥
    rimm = m.math('MAXIMUM', m.smooth(shape.f_nodes(m, p), 0.935, 0.952),
                  m.math('SUBTRACT', 1.0, m.smooth(px[2], 0.012, 0.022)))
    col = m.mix(rimm, col, rim)
    rough = m.mixf(rimm, rough, 0.86)
    return m.out(col, rough, m.bump(h, strength=0.6, distance=0.006))


# ── 껍질 조각 ────────────────────────────────────────────────────────────────

def flake(lib, name, sx, sy, t, rnd, n=9):
    """귀리 · 플레이크 한 장 — 가장자리 흔들린 납작한 원반(국소: 밑면 z≈0, 위 +Z, 18 tri) → (ob, 두께).
    slab.pebble(80 tri)로는 정수리를 덮을 만큼 못 얹는다(삼각형 예산)"""
    bm = bmesh.new()
    top, bot = bm.verts.new((0, 0, t)), bm.verts.new((0, 0, -t * 0.3))
    ring = []
    for i in range(n):
        a = TAU * i / n
        k = 1 + rnd.uniform(-0.15, 0.15)
        ring.append(bm.verts.new((sx / 2 * k * math.cos(a), sy / 2 * k * math.sin(a), t * 0.25)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top, ring[i], ring[j]))
        bm.faces.new((bot, ring[j], ring[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me)), t


def stud(lib, body, shape, bits, rnd, avoid=None):
    """껍질에 박거나 얹는 조각 → 파트 목록. bits = [dict(make=(lib, name, size, rnd) → (ob, h), mat(lib) → 재질, n,
    size=(a, b), zone=(φ0, φ1) 정수리에서 잰 각(rad, 적도 = π/2), bias=1(클수록 정수리에 몰린다), sink=0.45, gap=0.0)].
    자리는 넓이 고르게 뽑고 avoid(co) 가 참인 데(칼집 홈)와 이웃 조각 곁은 건너뛴다"""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    c = Vector((0.0, 0.0, shape.zc))
    parts, taken = [], []
    for bi, b in enumerate(bits):
        mat = b['mat'](lib)
        c0, c1 = math.cos(b['zone'][0]), math.cos(b['zone'][1])
        for k in range(b['n']):
            size = rnd.uniform(*b['size'])
            for _ in range(80):
                cphi = c0 + (c1 - c0) * rnd.random() ** b.get('bias', 1.0)
                th = rnd.uniform(0, TAU)
                sphi = math.sqrt(max(0.0, 1 - cphi * cphi))
                d = Vector((sphi * math.cos(th), sphi * math.sin(th), cphi))
                loc = bvh.ray_cast(c + d * 2.0, -d)[0]
                if loc is None or loc.z < 0.04:
                    continue
                if avoid and any(avoid(loc + Vector((ox, oy, 0.0))) for ox, oy in
                                 ((0, 0), (size, 0), (-size, 0), (0, size), (0, -size))):
                    continue
                if b.get('where') and not b['where'](loc):
                    continue
                if all((loc - q).length > (size + s) * 0.9 + b.get('gap', 0.0) for q, s in taken):
                    break
            else:
                continue
            taken.append((loc, size))
            ob, h = b['make'](lib, f'bit{bi}_{k}', size, rnd)
            if isinstance(ob, list):
                ob = join(lib, ob)
            wedge.press_into(lib, body, ob, h, side_hit=(c + d * 2.0, -d), sink=b.get('sink', 0.45),
                             tilt=(rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15)), spin=rnd.uniform(0, TAU))
            parts.append(lib.assign(ob, mat))
    return parts


def join(lib, obs):
    """여러 조각(로즈마리 줄기 + 잎)을 한 오브젝트로 — 한 번에 표면에 앉힌다"""
    bm = bmesh.new()
    for o in obs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        bpy.data.objects.remove(o)
    me = bpy.data.meshes.new('joined')
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    return lib.link(bpy.data.objects.new('joined', me))


def in_score(score, margin=0.003):
    """칼집 홈 안이면 참 — stud(avoid=…)에 넘긴다(조각이 홈을 메우면 X가 지워진다)"""
    return lambda co: score.disp(co) < -margin


# ── 껍질 덧입힘(campagne_crust extra=) ───────────────────────────────────────

def glaze(cols, a=0.85, rough=0.32, z0=0.36, drip=0.05):
    """윗면을 덮고 들쭉날쭉 흘러내린 글레이즈(꿀 · 아이싱) — 높이 z0 위, 칼집 홈에도 고인다"""
    def extra(m, col, r, p, nz, cut):
        pz = m.sep(p)[2]
        run = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(m.mapping(p, scale=(1, 1, 0)), scale=8, detail=1), 0.5), drip * 2)
        g = m.math('MAXIMUM', m.smooth(m.math('ADD', pz, run), z0 - 0.012, z0 + 0.012), m.math('MULTIPLY', cut, 0.8))
        gc = m.ramp(m.noise(p, scale=12, detail=2), [(0.35, cols[0]), (0.65, cols[1])])
        return m.mix(m.math('MULTIPLY', g, a), col, gc), m.mixf(g, r, rough)
    return extra


def coat(cols, scale=110, z0=0.3, rough=0.7, keep=0.25, fill=0.55):
    """정수리를 빽빽이 덮은 씨(포피 · 아마씨) — 띄엄띄엄 점이 아니라 씨로 메운 면. 경계는 흔들리고 아래로 성겨진다"""
    def extra(m, col, r, p, nz, cut):
        pz = m.sep(p)[2]
        zone = m.smooth(m.math('ADD', pz, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=4, detail=2), 0.5), 0.12)),
                        z0 - 0.04, z0 + 0.03)
        cell = m.voronoi(m.mapping(p, scale=(1, 1, 1.0)), scale=scale, randomness=1.0)
        rnd = m.sep(m.voronoi(p, scale=scale, randomness=1.0, out='Color'))
        seed = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(cell, 0.3, 0.42)), m.smooth(rnd[0], keep, keep + 0.02))
        sc = m.mix(m.smooth(rnd[1], 0.45, 0.55), cols[0], cols[1])
        k = m.math('MULTIPLY', m.math('MULTIPLY', seed, zone), m.math('SUBTRACT', 1.0, m.math('MULTIPLY', cut, 0.85)))
        base = m.math('MULTIPLY', zone, m.math('SUBTRACT', 1.0, cut))  # 씨 사이 틈도 씨 그늘빛
        col = m.mix(m.math('MULTIPLY', base, fill), col, cols[0])
        return m.mix(k, col, sc), m.mixf(k, r, rough)
    return extra


def sheen(col_top, a=0.3, rough=0.6, cut_rough=0.45):
    """기름 바른 윤기 — 위를 보는 껍질을 금빛으로 살짝, 거칠기를 낮춘다(0.6 밑은 방 반사 회색 막)"""
    def extra(m, col, r, p, nz, cut):
        top = m.smooth(nz, 0.2, 0.7)
        return m.mix(m.math('MULTIPLY', top, a), col, col_top), m.mixf(cut, m.mixf(top, r, rough), cut_rough)
    return extra


# ── 조립 ─────────────────────────────────────────────────────────────────────

def build_campagne_variant(lib, seed, shape=SHAPE, disp=SCORE.disp, crust=None, cut=None, crumb=None, bits=(),
                           avoid=None, tris=13000, mesh_kw=None, opts=None):
    """둥근 불 변형 → (parts, opts).
    shape = boule.Shape · disp(co) = 법선 변위(칼집 · 고리 단) · crust(lib) → 껍질 재질(기본 = 깜빠뉴 X 칼집 껍질) ·
    cut = cutter() 참고 · crumb(lib) → 단면 재질(기본 crumb_material) · bits = stud() 참고 · avoid = 조각을 피할 데 ·
    tris = 몸통 삼각형 · mesh_kw = boule_mesh 덧인자(segs · n · seed — 통밀은 segs=240, n=280, seed=2.0)"""
    lib.reset(seed)
    crust_m = crust(lib) if crust else campagne_crust(lib, shape, SCORE)
    ob = lib.assign(boule_mesh(lib, 'boule', shape, disp, target=tris, **(mesh_kw or {})), crust_m)
    out = dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45})
    if cut:
        cu = cutter(lib, shape, cut, crumb(lib) if crumb else crumb_material(lib, shape))
        md = ob.modifiers.new('cut', 'BOOLEAN')
        md.operation, md.solver, md.object = 'DIFFERENCE', 'EXACT', cu
        md.material_mode = 'TRANSFER'
        lib.apply_modifiers(ob)
        bpy.data.objects.remove(cu)
        out['ao_strength']['crumb'] = 0.3
        out['uv_weight'] = {'crust': 1.0, 'crumb': 1.5}
    drop_base(lib, ob)
    parts = [ob]
    if bits:
        parts += stud(lib, ob, shape, bits, random.Random(seed), avoid)
        out.setdefault('uv_weight', {'crust': 1.0})['bit'] = 1.5
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri · total {sum(lib.tri_count(q) for q in parts)}'
          f'  mats={[mt.name for mt in ob.data.materials]}')
    out.update(opts or {})
    return parts, out
