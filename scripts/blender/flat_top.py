"""판빵 변형 공용 — focaccia--* · flatbread · flatbread--* (docs/BREADS.md §Blender).

포카치아 변형 = slab.build_focaccia(판 · 딤플 · 기름 · 올리브 · 로즈마리 · 소금)를 지금 인자 그대로 부르고 그 위에
토핑을 얹는다(build_focaccia_top). 토핑 난수는 따로 만든 Random 이라 판 쪽 난수 순서는 그대로다.
플랫브레드 = 얇은 타원 판 · 부푼 물집 · 탄 자국(build_flatbread — 베이스 flatbread 와 변형이 함께 부른다).
토핑 형상: 반쪽 딸기(단면 그림 berry_cut) · 둥근 슬라이스(레몬) · 고리(올리브) · 깍둑(치즈 · 초콜릿은 wedge.chunk).
판빵은 윗면이 정체성이라 토핑은 윗면 딤플에 눌러 앉히고, 묻힌 면은 지운다(put(..., bury=True)).
"""
import math
import random

import bmesh
import bpy
import slab
from berry_cut import X0, X1, Z0, Z1, paint
from mathutils import Matrix, Vector

TAU = math.tau


# ── 얹기 ─────────────────────────────────────────────────────────────────────

def placer(lib, body, parts, rnd):
    """put(obs, mat, x, y, lift=0, lean=15, yaw=None, pre=None, bury=True) → 판 윗면 (x, y)에 앉힘(판 밖이면 False).
    obs = 오브젝트 또는 목록(mat=None 이면 이미 재질이 있다) · pre = 국소 → 앉힘 전 변환 · bury = 판에 묻힌 면 지우기"""
    surf = slab.surface(body)

    def put(obs, mat, x, y, lift=0.0, lean=15, yaw=None, pre=None, bury=True):
        obs = obs if isinstance(obs, list) else [obs]
        hit = surf(x, y)
        if hit is None:
            for q in obs:
                bpy.data.objects.remove(q)
            return False
        yaw = rnd.uniform(0, TAU) if yaw is None else yaw
        R = slab.tilt_frame(hit[1], yaw, math.radians(rnd.uniform(0, lean)), rnd.uniform(0, TAU))
        M = Matrix.Translation((x, y, hit[0] + lift)) @ R @ (pre or Matrix.Identity(4))
        for q in obs:
            if bury:
                def under(c, _n):
                    w = M @ c
                    h = surf(w.x, w.y)
                    return h is not None and w.z < h[0] - 0.004
                lib.delete_faces(q, under)
            q.matrix_world = M
            parts.append(lib.assign(q, mat) if mat else q)
        return True
    put.surf, put.parts = surf, parts  # 표면을 따라 눕는 토핑(꿀 줄기)은 높이를 직접 읽고 world 좌표로 짓는다
    return put


def _merge_opts(o, extra):
    for k, v in (extra or {}).items():
        o[k] = dict(o.get(k, {}), **v) if isinstance(v, dict) else v
    return o


# ── 포카치아 변형 ────────────────────────────────────────────────────────────

def focaccia_crust(lib, T, extra, top=('#EBA238', '#F7BC50', '#FCCB62'), brown='#C47420', dimple='#B07510',
                   side=('#EBC98A', '#F2D49C'), pore='#C29A55', bump=0.35, rough_top=0.74):
    """slab.focaccia_crust 와 같은 껍질 + extra(m, top_c, side_c, p, nz, dim) → (top_c, side_c) 무늬 고리
    (씨 덮개 · 반죽 결). slab.py 는 다른 담당 파일이라 고리를 못 달아 여기 옮겨 적었다 — 바탕 식은 같게 둔다"""
    m = lib.Mat('crust')
    p = m.lpos()
    nz = m.sep(m.lnrm())[2]
    z = m.sep(p)[2]
    blot = m.noise(p, scale=7, detail=6, rough=0.62, distortion=0.3)
    top_c = m.ramp(blot, [(0.3, top[0]), (0.5, top[1]), (0.7, top[2])])
    top_c = m.mix(m.math('MULTIPLY', m.smooth(m.noise(p, scale=40, detail=3), 0.55, 0.75), 0.35), top_c, brown)
    top_c = m.mix(m.math('MULTIPLY', m.attr('brown'), 0.8), top_c, brown)
    dim = m.smooth(m.attr('dimp'), 0.1, 0.55)
    top_c = m.mix(dim, top_c, dimple)
    crust = m.smooth(m.math('ADD', nz, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.08)), 0.35, 0.6)
    side_c = m.ramp(m.noise(p, scale=11, detail=3), [(0.35, side[0]), (0.65, side[1])])
    pores = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 1.6)), scale=55), 0.06, 0.14))
    pores = m.math('MULTIPLY', pores, m.smooth(m.noise(p, scale=9, detail=2), 0.42, 0.55))
    band = m.smooth(m.math('ADD', z, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.03 * T / 0.12)),
                    T * 0.42, T * 0.72)
    pores = m.math('MULTIPLY', pores, m.math('SUBTRACT', 1.0, band))
    side_c = m.mix(pores, side_c, pore)
    side_c = m.mix(band, side_c, m.mix(0.5, top_c, brown))
    top_c, side_c = extra(m, top_c, side_c, p, nz, dim)
    col = m.mix(crust, side_c, top_c)
    rough = m.mixf(crust, 0.85, m.mixf(dim, rough_top, 0.3))
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=80, detail=2), 0.3), m.math('MULTIPLY', pores, -0.8))
    h = m.math('ADD', h, m.math('MULTIPLY', blot, 0.4))
    return m.out(col, rough, m.bump(h, strength=bump, distance=0.003))


def build_focaccia_top(lib, seed, seats=(), top=None, pool=None, opts=None, crust=None, **kw):
    """slab.build_focaccia 위에 토핑. seats = 토핑이 앉을 딤플 자리(oil 앞에 끼워 딤플만 파고 기름 웅덩이는 걷는다 —
    소금이 이 자리를 피한다). kw = build_focaccia 인자 그대로(L · W · T · RC · oil · olives · oil_r …).
    pool = 남은 웅덩이 재질(None = 올리브유) · top(put, rnd, seats) 가 토핑을 얹는다 ·
    crust = 껍질 무늬 고리(focaccia_crust 의 extra — 주면 판 재질을 바꿔 단다). → (parts, opts)"""
    seats = list(seats)
    parts, o = slab.build_focaccia(lib, seed, oil=seats + list(kw.pop('oil', [])), **kw)
    if crust:
        parts[0].data.materials[0].name = 'crust_plain'  # 새 재질이 'crust' 이름을 갖도록(opts 키)
        lib.assign(parts[0], focaccia_crust(lib, kw['T'], crust, **(kw.get('crust_kw') or {})))
    for p in [p for p in parts if p.name.startswith('oil')]:
        if int(p.name[3:]) < len(seats):
            parts.remove(p)
            bpy.data.objects.remove(p)
        elif pool:
            lib.assign(p, pool)
    if top:
        top(placer(lib, parts[0], parts, random.Random(seed * 7 + 3)), random.Random(seed * 7 + 3), seats)
    print(f'  total {sum(lib.tri_count(p) for p in parts)} tri')
    return parts, _merge_opts(o, opts)


def sprigs(lib, put, rnd, n, length, avoid, L, W, pairs=3):
    """로즈마리 잔가지를 avoid=[(x, y, r)] 밖에 눕힌다(build_focaccia 의 잔가지는 토핑 자리를 모른다)"""
    mat, k = slab.rosemary_material(lib), 0
    for _ in range(n * 30):
        if k == n:
            break
        ln = rnd.uniform(*length)
        x, y = rnd.uniform(-L / 2 + 0.08, L / 2 - 0.08), rnd.uniform(-W / 2 + 0.08, W / 2 - 0.08)
        if any(math.hypot(x - a, y - b) < r + ln / 2 for a, b, r in avoid):
            continue
        yaw = rnd.uniform(0, TAU)
        pre = Matrix.Translation((-ln / 2, 0, 0))  # 잔가지 가운데를 자리에
        put(slab.rosemary(lib, f'twig{k}', ln, rnd, n_pairs=pairs), mat, x, y, lift=0.002, lean=0, yaw=yaw, pre=pre,
            bury=False)
        avoid.append((x, y, ln / 2))
        k += 1


# ── 반쪽 딸기 ────────────────────────────────────────────────────────────────

# 단면(r, z) 끝(0) → 꼭지 — pancake--strawberry-fresh 의 BERRY 와 같은 윤곽(berry_cut.paint 의 타일 범위가 이 윤곽 기준)
BERRY = [(0, 0), (0.018, 0.008), (0.042, 0.030), (0.066, 0.064), (0.088, 0.104), (0.105, 0.146),
         (0.117, 0.186), (0.123, 0.218), (0.121, 0.242), (0.108, 0.264), (0.082, 0.280),
         (0.047, 0.289), (0.018, 0.287), (0, 0.282)]


def berry_half(lib, name, s, flip, tile, skin_mat, cut_mat):
    """세로로 가른 반쪽(국소: 끝 원점 · 축 +Z · 껍질 +Y · 단면 y=0 이 −Y). → [껍질, 단면]. HALF_UP 으로 단면이 위"""
    def rfn(th, z):  # 단면 가장자리(θ = 0 · π)는 요철 0 — 그림의 붉은 테가 윤곽에 꼭 맞는다
        return 1 + math.sin(th) ** 2 * (0.03 * math.sin(3 * th + s) + 0.018 * lib.n3(math.cos(th) * 1.5, math.sin(th) * 1.5, z * 7, s))
    skin = lib.lathe(name, BERRY, segs=12, rfn=rfn, theta0=0.0, theta1=math.pi)
    lib.orient_faces(skin, lambda c: c - Vector((0, 0, 0.16)))
    bm, rows, S = bmesh.new(), [], 6
    for r, z in BERRY:
        rows.append([bm.verts.new((0.0, 0.0, z))] if r <= 1e-9 else
                    [bm.verts.new(((-1 + 2 * k / S) * r, 0.0, z)) for k in range(S + 1)])
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
    lib.point_attr(cut, 'cflip', [flip] * len(me.vertices))
    lib.point_attr(cut, 'ctile', [tile] * len(me.vertices))
    return [lib.assign(skin, skin_mat), lib.assign(cut, cut_mat)]


def half_up(scale, flat=1.0):
    """반쪽 국소 → 단면이 위(+Z), 축이 +Y, 가운데가 원점. flat < 1 = 구워 쪼그라든 두께(껍질 쪽만 눌린다)"""
    return (Matrix.Diagonal((scale, scale, scale * flat, 1.0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
            @ Matrix.Translation((0, 0, -0.145)))


def berry_skin_mat(lib, stops=('#7E0E1E', '#9A1826', '#B02430'), rough=0.34):
    """구운 딸기 껍질 — 졸아 검붉고 잼처럼 윤이 난다. 씨는 그리지 않는다(눕힌 반쪽은 껍질이 거의 묻힌다)"""
    m = lib.Mat('berry')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=9, detail=3), [(0.3, stops[0]), (0.5, stops[1]), (0.7, stops[2])])
    return m.out(col, rough, m.bump(m.noise(p, scale=60, detail=2), strength=0.3, distance=0.002))


def berry_cut_mat(lib, name='berry_cut', tint=('#B81E30', 0.3), rough=0.42):
    """반쪽 단면 — berry_cut.paint 그림을 국소 x · z로 붙인다(반쪽마다 ctile 타일 · cflip 좌우).
    tint = 구운 과육 쪽으로 섞는 색 · 비율(심은 덜 하얗고 속살은 잼빛). 거칠기 0.42 = 하늘 보는 단면이 허옇게 안 뜨는 값"""
    px = paint(BERRY)
    img = bpy.data.images.new(name + '_paint', px.shape[1], px.shape[0], alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.update()
    m = lib.Mat(name)
    p = m.lpos()
    s = m.sep(p)
    u = m.math('DIVIDE', m.math('SUBTRACT', m.math('MULTIPLY', s[0], m.attr('cflip')), X0), X1 - X0)
    u = m.math('MULTIPLY', m.math('ADD', u, m.attr('ctile')), 0.5)
    v = m.math('DIVIDE', m.math('SUBTRACT', s[2], Z0), Z1 - Z0)
    tex = m.node('ShaderNodeTexImage', image=img, extension='EXTEND')
    m.link(m.combine(u, v), tex.inputs['Vector'])
    col = m.mix(tint[1], tex.outputs['Color'], tint[0]) if tint else tex.outputs['Color']
    return m.out(col, rough, m.bump(m.math('MULTIPLY', m.noise(p, scale=45, detail=2), 0.25), strength=0.45, distance=0.003))


# ── 반쪽 무화과 · 흑마늘 쪽 · 줄기 ────────────────────────────────────────────

# 단면(r, z) 밑(0) → 꼭지 — 아래가 불룩하고 위로 목이 좁아지는 물방울
FIG = [(0, 0), (0.05, 0.006), (0.085, 0.025), (0.105, 0.055), (0.113, 0.09), (0.108, 0.13), (0.09, 0.17),
       (0.066, 0.205), (0.045, 0.24), (0.03, 0.27), (0.022, 0.29), (0, 0.297)]


def fig_half(lib, name, s, skin_mat, cut_mat, S=10):
    """세로로 가른 무화과 반쪽(berry_half 와 같은 놓임 — half_up(…, z0=0.15)로 단면이 위).
    단면 정점에 cd = 가장자리 가까움(0 가운데 → 1 껍질)을 적어 재질이 테 · 속껍질 · 과육을 나눈다"""
    skin = lib.lathe(name, FIG, segs=12, theta0=0.0, theta1=math.pi,
                     rfn=lambda th, z: 1 + math.sin(th) ** 2 * 0.03 * lib.n3(math.cos(th), math.sin(th), z * 6, s))
    lib.orient_faces(skin, lambda c: c - Vector((0, 0, 0.12)))
    bm, rows, cd = bmesh.new(), [], []
    zt = FIG[-1][1]
    for r, z in FIG:
        if r <= 1e-9:
            rows.append([bm.verts.new((0.0, 0.0, z))])
            cd.append(1.0)
            continue
        rows.append([bm.verts.new(((-1 + 2 * k / S) * r, 0.0, z)) for k in range(S + 1)])
        ze = min(z / 0.05, (zt - z) / 0.03, 1.0)  # 밑 · 꼭지 쪽 끝도 껍질
        cd += [max(abs(-1 + 2 * k / S), 1 - ze) for k in range(S + 1)]
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
    lib.point_attr(cut, 'cd', [cd[v.index] for v in me.vertices])
    return [lib.assign(skin, skin_mat), lib.assign(cut, cut_mat)]


def fig_cut_mat(lib, rough=0.4):
    """무화과 단면 — 보라 껍질 선 · 크림빛 속껍질 테 · 분홍 과육 속에 붉은 결과 옅은 씨"""
    m = lib.Mat('fig_cut')
    p = m.lpos()
    cd = m.math('ADD', m.attr('cd'), m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=30, detail=2), 0.5), 0.12))
    flesh = m.ramp(m.noise(p, scale=26, detail=3, distortion=1.5), [(0.35, '#B8283C'), (0.65, '#D84A5A')])
    seeds = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=160), 0.05, 0.12))
    flesh = m.mix(m.math('MULTIPLY', seeds, m.smooth(cd, 0.75, 0.3)), flesh, '#F0D8A0')
    col = m.mix(m.smooth(cd, 0.6, 0.72), flesh, '#F2E4C4')  # 속껍질 테
    col = m.mix(m.smooth(cd, 0.9, 0.97), col, '#5A2A4A')  # 껍질 선
    return m.out(col, rough, m.bump(m.math('MULTIPLY', seeds, 0.6), strength=0.3, distance=0.002))


def clove(lib, name, rnd, bend=0.12, flat=0.7):
    """마늘 한 쪽(국소: 길이 1, 축 +X, 밑면 z≈0) — 물방울 몸통 · 한쪽이 눌리고 등이 휜 초승달"""
    prof = [(0, 0), (0.22, 0.04), (0.36, 0.16), (0.4, 0.34), (0.36, 0.56), (0.24, 0.78), (0.1, 0.94), (0, 1.0)]
    ob = lib.lathe(name, prof, segs=16)
    for v in ob.data.vertices:
        z = v.co.z
        v.co = Vector((z - 0.5, v.co.y, v.co.x * flat + bend * (1 - (2 * z - 1) ** 2) + 0.4 * flat))
    ob.data.update()
    lib.displace_normal(ob, lambda co: 0.015 * lib.n3(co.x * 4, co.y * 4, co.z * 4, rnd.uniform(0, 9)))
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def drizzle(lib, name, surf, pts, width=0.016, thick=0.006, lift=0.004):
    """판 위를 따라 흐르는 줄기(꿀 · 시럽) — pts = [(x, y)] 경로, 단면은 납작한 타원. 판 밖 점은 버린다"""
    prof = lib.profile_curve(name + '_prof', [(width / 2 * math.cos(a), thick / 2 * math.sin(a))
                                              for a in (TAU * k / 10 for k in range(10))])
    path = []
    for x, y in pts:
        h = surf(x, y)
        if h is not None:
            path.append((x, y, h[0] + lift))
    return lib.curve_tube(name, path, [1.0] * len(path), profile_obj=prof)


# ── 슬라이스 · 고리 · 깍둑 ───────────────────────────────────────────────────

def disc(lib, name, thick=0.08, hole=0.0, segs=28, ell=1.0):
    """반지름 1 원반(국소: 가운데 원점, 밑면 z=0) — hole > 0 이면 가운데 구멍 난 고리(올리브 슬라이스).
    모서리는 둥글게(옆면 = 껍질). 크기는 put(pre=Scale)로 — 재질이 국소 반지름(lpos)을 그대로 읽는다"""
    h = thick
    prof = [(1.0 - h * 0.5 + h * 0.5 * math.cos(a), h * 0.5 + h * 0.5 * math.sin(a))
            for a in (-math.pi / 2 + math.pi * k / 6 for k in range(7))]  # 바깥 테 반원(아래 → 위)
    prof = [(hole, 0.0)] + prof + [(hole, h)] + ([(hole, 0.0)] if hole else [])  # 구멍 벽은 처음 고리로 돌아와 닫는다
    ob = lib.lathe(name, prof, segs=segs)
    if hole:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
    if ell != 1.0:
        ob.data.transform(Matrix.Diagonal((1.0, ell, 1.0, 1.0)))
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def lemon_mat(lib, n_seg=9, roast=0.5):
    """레몬 슬라이스(국소 반지름 1) — 노란 껍질 테 · 흰 속껍질 · 흰 막으로 나뉜 과육 칸 · 하얀 심.
    roast = 구워진 정도(껍질 테 · 과육 가장자리가 갈색으로 캐러멜화)"""
    m = lib.Mat('lemon')
    p = m.lpos()
    s = m.sep(p)
    r = m.vmath('LENGTH', m.combine(s[0], s[1]))
    ang = m.math('ARCTAN2', s[1], s[0])
    wob = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=4, detail=2), 0.5), 0.25)
    seg = m.math('ABSOLUTE', m.math('SUBTRACT', m.math('FRACT', m.math('ADD', m.math('MULTIPLY', ang, n_seg / TAU), wob)), 0.5))
    memb = m.smooth(m.math('MULTIPLY', m.math('SUBTRACT', 0.5, seg), m.math('MAXIMUM', r, 0.15)), 0.022, 0.008)  # 막 = 칸 경계
    juice = m.noise(m.combine(m.math('MULTIPLY', r, 14), m.math('MULTIPLY', ang, 2.5), 0.0), scale=1.0, detail=3)
    # 색상 60° 언저리로 잡는다 — lib.food_grade 가 따뜻한 밝은 색(5~60°)을 황금 갈색 32° 쪽으로 당겨 50°대 노랑은 오렌지로 구워졌다
    flesh = m.ramp(juice, [(0.3, '#E8DE40'), (0.55, '#F0E85C'), (0.75, '#F4EE84')])
    col = m.mix(m.math('MULTIPLY', memb, 0.8), flesh, '#FAEFC4')
    col = m.mix(m.math('SUBTRACT', 1.0, m.smooth(r, 0.06, 0.12)), col, '#F6E8B8')  # 가운데 심
    col = m.mix(m.smooth(r, 0.78, 0.81), col, '#F8EBC0')  # 흰 속껍질
    rind = m.ramp(m.noise(p, scale=30, detail=2), [(0.35, '#E2D414'), (0.65, '#ECE02C')])
    side = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.sep(m.lnrm())[2]), 0.5, 0.8))
    col = m.mix(m.math('MAXIMUM', m.smooth(r, 0.86, 0.89), side), col, rind)
    if roast:  # 테 둘레 · 얼룩진 자리만 캐러멜 갈색
        burn = m.math('MULTIPLY', m.smooth(r, 0.72, 1.0), m.smooth(m.noise(p, scale=5, detail=3), 0.4, 0.7))
        col = m.mix(m.math('MULTIPLY', burn, roast), col, '#B8701E')
    h = m.math('ADD', m.math('MULTIPLY', memb, 0.5), m.math('MULTIPLY', juice, 0.4))
    return m.out(col, m.mixf(m.smooth(r, 0.85, 0.9), 0.36, 0.5), m.bump(h, strength=0.35, distance=0.002))


def olive_ring_mat(lib, name, skin, cut, rough=0.3):
    """올리브 고리(국소 반지름 1) — 위아래 단면 = 과육색(cut 둘), 바깥 · 구멍 벽 = 껍질색(skin 둘)"""
    m = lib.Mat(name)
    p = m.lpos()
    face = m.smooth(m.math('ABSOLUTE', m.sep(m.lnrm())[2]), 0.6, 0.85)
    s = m.sep(p)
    r = m.vmath('LENGTH', m.combine(s[0], s[1]))
    sk = m.ramp(m.noise(p, scale=12, detail=3), [(0.3, skin[0]), (0.7, skin[1])])
    ct = m.ramp(m.noise(p, scale=9, detail=3), [(0.3, cut[0]), (0.7, cut[1])])
    ct = m.mix(m.math('MULTIPLY', m.smooth(r, 0.82, 0.95), 0.8), ct, skin[0])  # 단면 바깥 테 = 껍질 선
    col = m.mix(face, sk, ct)
    return m.out(col, m.mixf(face, rough, rough + 0.2), m.bump(m.noise(p, scale=40, detail=2), strength=0.2, distance=0.002))


def dollop(lib, name, rnd, n=4, flat=0.4, lumpy=0.1):
    """숟가락으로 떠 펴 바른 퓌레 한 덩이 · 녹아 퍼진 웅덩이(국소: 바닥 가운데 원점, 반지름 ≈ 1) —
    납작한 타원체 n개를 비켜 겹친 메타볼. lumpy = 으깬 결 변위(녹은 웅덩이는 작게)"""
    els = []
    for k in range(n):
        a, d = rnd.uniform(0, TAU), (0.0 if k == 0 else rnd.uniform(0.35, 0.6))
        r = rnd.uniform(0.5, 0.7) if k else 0.75
        els.append(dict(type='ELLIPSOID', co=(d * math.cos(a), d * math.sin(a), 0.0), radius=r / 0.6,
                        size=(1.0, rnd.uniform(0.7, 1.0), flat * rnd.uniform(0.8, 1.2))))
    ob = lib.metaballs(name, els, resolution=0.08)
    lib.delete_faces(ob, lambda c, _n: c.z < -0.05)
    s = rnd.uniform(0, 50)  # 으깬 결 — 매끈한 덩이는 콩 · 아몬드로 읽혔다
    lib.displace_normal(ob, lambda co: lumpy * lib.n3(co.x * 2.5, co.y * 2.5, co.z * 2.5, s))
    lib.decimate(ob, min(1.0, 700 / max(1, lib.tri_count(ob))))
    return ob


def melt_mat(lib, name, body, edge, rough=0.6, width=(0.55, 0.95)):
    """녹아 퍼진 웅덩이(dollop 국소 반지름 1) — 가운데 body 색, 가장자리로 갈수록 edge 색(그을린 테)"""
    m = lib.Mat(name)
    p = m.lpos()
    s = m.sep(p)
    r = m.math('ADD', m.vmath('LENGTH', m.combine(s[0], s[1])),
               m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=3, detail=3), 0.5), 0.35))
    col = m.ramp(m.noise(p, scale=6, detail=2), [(0.3, body[0]), (0.7, body[1])])
    col = m.mix(m.smooth(r, *width), col, edge)
    return m.out(col, rough, m.bump(m.noise(p, scale=12, detail=2), strength=0.25, distance=0.002))


def toast_mat(lib, name, body, toast, rough=0.8, amount=0.75):
    """깍둑 치즈 · 퓌레 — 옆면 body 색, 윗면 · 솟은 곳은 구워진 toast 색 얼룩.
    거칠기 0.4~0.6은 방 반사가 회색 막을 씌워 치즈는 두부, 고구마는 모래색으로 읽혔다 — 0.8 위"""
    m = lib.Mat(name)
    p = m.lpos()
    nz = m.sep(m.lnrm())[2]
    col = m.ramp(m.noise(p, scale=30, detail=2), [(0.3, body[0]), (0.7, body[1])])
    # 그을림은 윗면에 넓은 얼룩으로 — 잔 잡음(55)은 글씨 낙서처럼 읽혔다
    brown = m.math('MULTIPLY', m.smooth(nz, 0.35, 0.85), m.smooth(m.noise(p, scale=18, detail=3, distortion=0.3), 0.35, 0.6))
    col = m.mix(m.math('MULTIPLY', brown, amount), col, toast)
    return m.out(col, rough, m.bump(m.noise(p, scale=90, detail=2), strength=0.2, distance=0.002))


# ── 플랫브레드 (flatbread · flatbread--*) ────────────────────────────────────

FLAT_PAL = dict(ramp=('#EEAA4C', '#F7BE60', '#FBCB70'), fine='#D99540', edge='#D08A38', side='#D9984A')


def flat_crust(lib, pal=None, extra=None):
    """플랫브레드 껍질 — pal 로 바탕색만 바꾼다. extra(m, col, p, nz) → col 로 무늬(퓌레 결 등)를 탄 자국 아래에 덧입힌다"""
    c = dict(FLAT_PAL, **(pal or {}))
    m = lib.Mat('crust')
    p = m.lpos()
    nz = m.sep(m.lnrm())[2]
    blot = m.noise(p, scale=8, detail=5, rough=0.6, distortion=0.3)
    # 레퍼런스 실측 바탕 #F4C06B~#E9AE56 · 탄 가운데 #573F2F · 번짐 #BD7433 → 노출 되짚은 값
    col = m.ramp(blot, [(0.3, c['ramp'][0]), (0.5, c['ramp'][1]), (0.7, c['ramp'][2])])
    col = m.mix(m.math('MULTIPLY', m.smooth(m.noise(p, scale=30, detail=3), 0.58, 0.72), 0.5), col, c['fine'])  # 잔 구움
    col = m.mix(m.math('MULTIPLY', m.attr('edge'), 0.6), col, c['edge'])
    if extra:
        col = extra(m, col, p, nz)
    # 탄 자국 — 정점 속성 char(가운데 1)에 얼룩을 곱해 들쭉날쭉하게. 가운데 검정 · 테 갈색
    burn = m.math('MULTIPLY', m.attr('char'),
                  m.math('ADD', 0.65, m.math('MULTIPLY', m.noise(p, scale=45, detail=4, distortion=0.4), 0.7)))
    char = m.ramp(burn, [(0.12, '#F4C06B'), (0.28, '#DE9440'), (0.45, '#B8682A'), (0.65, '#7A4220'),
                         (0.88, '#3A2214')])  # 번짐을 주황 갈색으로 — 회갈색 판은 그을음 얼룩으로 읽혔다(r2)
    col = m.mix(m.smooth(burn, 0.1, 0.25), col, char)
    side = m.math('SUBTRACT', 1.0, m.smooth(nz, 0.35, 0.7))
    col = m.mix(m.math('MULTIPLY', side, 0.5), col, c['side'])
    rough = m.mixf(m.smooth(burn, 0.4, 0.8), 0.88, 0.92)  # 0.8은 방 반사 회색 막(본세션 교훈 11-14)
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=70, detail=3), 0.35), m.math('MULTIPLY', blot, 0.3))
    h = m.math('ADD', h, m.math('MULTIPLY', m.smooth(burn, 0.5, 0.9), -0.25))
    return m.out(col, rough, m.bump(h, strength=0.35, distance=0.003))


def _spots(rnd, R, ell, n, rmin, rmax, keep, gap):
    """타원 판 안에 겹치지 않게 (x, y, r) n개"""
    out = []
    for _ in range(4000):
        if len(out) == n:
            break
        r = rnd.uniform(rmin, rmax)
        a, d = rnd.uniform(0, math.tau), math.sqrt(rnd.random()) * (R - 0.05 - r)
        x, y = d * math.cos(a), d * math.sin(a) * ell
        if all(math.hypot(x - q[0], y - q[1]) > r + q[2] + gap for q in keep + out):
            out.append((x, y, r))
    return out


def build_flatbread(lib, seed, R=0.5, ell=0.9, T=0.045, counts=(9, 14, 18), char_k=1.0, pal=None, extra=None, top=None,
                    opts=None):
    """플랫브레드 판 — 크게 부푼 물집 counts[0] · 작은 물집 counts[1] · 납작한 탄 반점 counts[2] · char_k = 탄 자국 세기 배율.
    pal · extra = 껍질 색 · 무늬(flat_crust) · top(put, rnd, big) 가 토핑을 얹는다(난수는 따로). → (parts, opts)"""
    rnd = random.Random(seed)
    big = _spots(rnd, R, ell, counts[0], 0.05, 0.085, [], 0.02)
    mid = _spots(rnd, R, ell, counts[1], 0.022, 0.034, big, 0.015)
    spots = _spots(rnd, R, ell, counts[2], 0.014, 0.026, big + mid, 0.02)  # 28개는 64px에서 초코칩 쿠키로 읽혔다(r3)
    domes = ([(x, y, r, r * rnd.uniform(0.5, 0.75)) for x, y, r in big]
             + [(x, y, r, r * rnd.uniform(0.25, 0.4)) for x, y, r in mid])
    # 탄 자국 — (x, y, 반지름, 세기). 큰 물집은 꼭대기 한쪽으로 비켜 탄다
    chars = [(x + rnd.uniform(-0.25, 0.25) * r, y + rnd.uniform(-0.25, 0.25) * r, r * rnd.uniform(0.95, 1.15),
              rnd.uniform(0.9, 1.0)) for x, y, r in big]
    chars += [(x, y, r * 1.4, rnd.uniform(0.45, 0.8)) for x, y, r in mid]
    chars += [(x, y, r * 1.4, rnd.uniform(0.75, 1.0)) for x, y, r in spots]  # 번짐 테까지(1.0은 잔 점으로 읽혔다, r1)

    ob = slab.slab(lib, 'slab', slab.round_outline(lib, R, wob=0.015, seed=1.5, ell=ell), T, 0.018, 0.008,
                   voxel=0.007)

    def push(co, n):
        w = slab.smoothstep(0.4, 0.85, n.z)
        if w <= 0:
            return None
        dz = 0.004 * lib.n3(co.x * 4, co.y * 4, 0, 1.0) + 0.0015 * lib.n3(co.x * 15, co.y * 15, 0, 2.0)
        for x, y, r, h in domes:
            if abs(co.x - x) < r and abs(co.y - y) < r:
                d = math.hypot(co.x - x, co.y - y) / r
                if d < 1:
                    dz += h * (1 - d * d) ** 1.5  # 둥근 물집 — 테는 반죽에 부드럽게 묻힌다
        for x, y, r in spots:
            d = math.hypot(co.x - x, co.y - y) / r
            if d < 1:
                dz += 0.003 * (1 - d * d) ** 2
        return Vector((0, 0, dz * w))

    slab.shape(ob, push)
    slab.finish(lib, ob, 10000)

    def char(co, n):
        best = 0.0
        for x, y, r, s in chars:
            d = math.hypot(co.x - x, co.y - y) / r
            if d < 1.6:
                best = max(best, s * char_k * math.exp(-1.6 * d * d))
        return best * slab.smoothstep(0.2, 0.6, n.z)

    def edge(co, n):
        q = math.hypot(co.x, co.y / ell) / R  # 타원 반지름 비
        return slab.smoothstep(0.86, 1.0, q)

    slab.attrs(lib, ob, {'char': char, 'edge': edge})
    parts = [lib.assign(ob, flat_crust(lib, pal, extra))]
    print(f'  slab {lib.tri_count(parts[0])} tri')
    if top:
        trnd = random.Random(seed * 7 + 3)
        top(placer(lib, ob, parts, trnd), trnd, big)  # big = 큰 물집 (x, y, r) — 토핑이 피한다(물집 위 고리는 반쯤 묻혔다)
        print(f'  total {sum(lib.tri_count(p) for p in parts)} tri')
    return parts, _merge_opts(dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45}), opts)
