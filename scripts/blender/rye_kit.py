"""호밀빵 계열 공용 — rye · rye--* 가 함께 쓴다 (docs/BREADS.md §Blender).

형상 · 껍질은 breads/rye.py 에서 옮겼다 — 기본 인자로 부르면 옛 rye 와 바이트까지 같다.
변형 조립 build_rye: 껍질 색 · 캐러웨이 끄기 · 덧칠(extra) · 단면(cut) · 얹은 조각(top).
단면 재질은 loaf_kit.crumb_material(axes=(1, 2) — 단면 (y, z)), 조각 무늬는 여기 bits · veined.
국소 좌표: 길이 X(−0.5..0.5) · 폭 Y · 바닥 z=0. 배치는 끝에서 모든 파트에 az(angle) 를 건다:
ANGLE 132 이면 −X 끝이 화면 왼쪽 아래(카메라 쪽), −Y 옆면이 앞.
"""
import math
import random

import bmesh
import bpy
from loaf_kit import slice_cap
from long_loaf import loft, slash_disp, slash_masks, stations
from mathutils import Matrix, Vector

SEED = 5
ANGLE = 132  # 길이축 방위 — 화면 기울기 ≈ 28°
W, H = 0.30, 0.29  # 가운데 반폭 · 높이
SLASHES = [(0.0, -0.06, 6, 0.33, 0.04, 0.03, 0.006)]


def section(lib):
    def fn(x, th):
        t = min(1.0, abs(x) / 0.5)
        s = (1 - t ** 2.2) ** (1 / 2.2)  # 위에서 본 윤곽 — 끝이 뭉툭한 타원
        h = H * (1 - t ** 3.2) ** 0.42  # 옆에서 본 끝도 뭉툭하게(레몬형이 되지 않게)
        c, sn = math.cos(th), math.sin(th)
        wob = 1 + 0.02 * lib.n3(x * 4, c * 1.5, sn * 1.5, 2.1)
        ry = W * s * wob
        zm = 0.4 * h
        y = ry * math.copysign(abs(c) ** (2 / 2.4), c)
        if sn >= 0:
            z = zm + (h * wob - zm) * sn ** (2 / 2.6)  # 윗면은 넓고 완만한 등
        else:
            z = zm * (1 - abs(sn) ** (2 / 2.5))  # 바닥은 좁게 납작 — 옆에서 둥글게 말려 들어간다
        return y, z
    return fn


def half_width(x):
    """위에서 본 반폭(흔들림 뺀 값) — 조각 자리 고르기용"""
    t = min(1.0, abs(x) / 0.5)
    return W * (1 - t ** 2.2) ** (1 / 2.2)


def seeds(m, p, n, scale=30.0):
    """캐러웨이 씨 — (마스크, 높이, 테두리 그늘, 등줄기). 셀마다 무작위 방향(표면 접평면) 길쭉한 타원"""
    vor = m.node('ShaderNodeTexVoronoi', feature='F1', voronoi_dimensions='3D')
    m.link(p, vor.inputs['Vector'])
    vor.inputs['Scale'].default_value = scale
    vor.inputs['Randomness'].default_value = 1.0
    d = m.vmath('SUBTRACT', p, vor.outputs['Position'])
    dn = m.vmath('DOT_PRODUCT', d, n)
    dt = m.vmath('SUBTRACT', d, _scale(m, n, dn))  # 접평면 성분
    rnd = m.vmath('SUBTRACT', vor.outputs['Color'], (0.5, 0.5, 0.5))
    a = m.vmath('SUBTRACT', rnd, _scale(m, n, m.vmath('DOT_PRODUCT', rnd, n)))
    a = m.vmath('NORMALIZE', a)
    along = m.vmath('DOT_PRODUCT', dt, a)
    perp = m.vmath('LENGTH', m.vmath('SUBTRACT', dt, _scale(m, a, along)))
    # 반길이 · 반폭 (셀 크기 비율). 셀에 비해 크면 이웃 셀 경계에 잘려 V자·반쪽 씨가 생긴다(r7)
    L, Wd = 0.55 / scale, 0.23 / scale
    e = m.math('ADD', m.math('POWER', m.math('DIVIDE', m.math('ABSOLUTE', along), L), 2.0),
               m.math('POWER', m.math('DIVIDE', perp, Wd), 2.0))
    keep = m.math('MULTIPLY', m.math('LESS_THAN', m.math('ABSOLUTE', dn), 0.35 / scale),
                  m.math('GREATER_THAN', m.sep(vor.outputs['Color'])[1], 0.3))
    mask = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(e, 0.75, 1.0)), keep)
    height = m.math('MULTIPLY', m.math('SQRT', m.math('MAXIMUM', m.math('SUBTRACT', 1.0, e), 0.0)), keep)
    ring = m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(e, 0.9, 1.05),
                                     m.math('SUBTRACT', 1.0, m.smooth(e, 1.1, 1.8))), keep)
    ridge = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(m.math('DIVIDE', perp, Wd), 0.0, 0.5)), mask)
    return mask, height, ring, ridge


def _scale(m, v, s):
    nd = m.node('ShaderNodeVectorMath', operation='SCALE')
    m.link(v, nd.inputs[0])
    m.link(s, nd.inputs['Scale'])
    return nd.outputs['Vector']


# 껍질 색 — crust 셋(얼룩 램프) · dark(잔얼룩) · ear(귀) · cut/pore/shade(칼집 속)
PAL = dict(crust=('#5A2806', '#6C3408', '#804210'), dark='#441E04', ear='#9C6236',
           cut=('#BC7232', '#D28C48'), pore='#7A4320', shade='#3E200C')


def crust_material(lib, pal=None, caraway=True, extra=None, slashes=SLASHES):
    """호밀 껍질. pal = PAL 키 덮어쓰기 · caraway=False 면 씨 무늬를 뺀다(씨앗 변형) ·
    extra(m, k, col, rough, h) → (col, rough, h): 덧칠(꿀 글레이즈). k = dict(p, n, nz, top, cut)"""
    c = dict(PAL, **(pal or {}))
    m = lib.Mat('crust')
    p = m.lpos()
    n = m.vmath('NORMALIZE', m.lnrm())
    nz = m.sep(n)[2]
    top = m.smooth(nz, 0.2, 0.5)
    cut, ear, shade = slash_masks(m, p, slashes, top)

    blot = m.noise(p, scale=6.5, detail=3, rough=0.5, distortion=0.2)
    fine = m.noise(p, scale=22, detail=4)
    # 고른 짙은 밤색 바탕 + 잔잔한 얼룩 — 크고 센 얼룩은 탄 자국·때로 읽혔다(r7 검수)
    crust = m.ramp(blot, [(0.35, c['crust'][0]), (0.5, c['crust'][1]), (0.65, c['crust'][2])])
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', fine, 0.5), 0.3), crust, c['dark'])
    crust = m.mix(m.math('MULTIPLY', ear, 0.5), crust, c['ear'])

    if caraway:
        smask, sh, ring, ridge = seeds(m, p, n)
        skeep = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, cut), m.smooth(nz, -0.35, 0.0))
        smask, sh, ring, ridge = (m.math('MULTIPLY', v, skeep) for v in (smask, sh, ring, ridge))
        # 씨 = 가장자리 짙고 등줄기 밝게 — 고른 밝은 타원은 쌀알 스티커로 읽혔다(r7)
        seed_c = m.ramp(sh, [(0.0, '#3E1E0A'), (0.5, '#74401A'), (1.0, '#93582A')])
        seed_c = m.mix(m.math('MULTIPLY', ridge, 0.8), seed_c, '#C08A52')
        crust = m.mix(m.math('MULTIPLY', ring, 0.7), crust, '#1E1008')
        crust = m.mix(smask, crust, seed_c)

    crumb = m.ramp(m.noise(p, scale=35, detail=3), [(0.35, c['cut'][0]), (0.65, c['cut'][1])])
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=120, randomness=0.9), 0.06, 0.16))
    crumb = m.mix(m.math('MULTIPLY', pore, 0.5), crumb, c['pore'])
    crumb = m.mix(shade, crumb, c['shade'])  # 먼 쪽 테 밑 그늘 — 골로 읽히게
    col = m.mix(cut, crust, crumb)

    rough = m.mixf(cut, m.mixf(smask, 0.93, 0.8) if caraway else 0.93, 0.92)
    h = m.math('ADD', m.math('MULTIPLY', fine, 0.35), m.math('MULTIPLY', m.noise(p, scale=70, detail=2), 0.25))
    if caraway:
        h = m.math('ADD', h, m.math('MULTIPLY', sh, 2.2))
    h = m.mixf(cut, h, m.math('MULTIPLY', pore, -0.6))
    if extra:
        col, rough, h = extra(m, dict(p=p, n=n, nz=nz, top=top, cut=cut), col, rough, h)
    return m.out(col, rough, m.bump(h, strength=0.5, distance=0.004))


# ── 단면 ─────────────────────────────────────────────────────────────────────

def _copy(lib, ob, name):
    cp = ob.copy()
    cp.data = ob.data.copy()
    cp.name = cp.data.name = name
    return lib.link(cp)


def _cut_hidden(ob, co, no):
    """안 보이는 쪽 단면 — no 쪽을 버리고 구멍만 메운다(slice_cap 은 rim 속성을 한 번만 단다)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no,
                           clear_outer=True, dist=1e-6)
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=[e for e in bm.edges if e.is_boundary])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def _about(pivot, th):
    """세로축(pivot 지나는 Z) 둘레 회전 4×4"""
    P = Vector(pivot)
    return Matrix.Translation(P) @ Matrix.Rotation(th, 4, 'Z') @ Matrix.Translation(-P)


def cut_parts(lib, ob, cut, mat):
    """cut → [(파트, 국소 배치 4×4)]. 파트의 정점은 몸통 국소 좌표 그대로 둔다(껍질 무늬 · 칼집이 어긋나지 않게).
    ('end', x, (nx, ny, nz)) — x 지점을 법선 쪽으로 썰어낸다(기본 (−1, 0, 0) = 왼끝 한 장, 기울이면 비스듬히)
    ('split', x, 왼쪽 각°, 오른쪽 각°, 틈) — x 에서 갈라 두 쪽을 뒤 모서리 축으로 벌린다(책 펼치듯 두 단면이 앞을 본다).
      두 각을 다르게 — 같은 각은 거울 대칭이라 인위적이다
    ('slice', x, 두께, (dx, dy), 각°) — 왼끝을 x 에서 썰고, 썬 한 장을 단면이 위로 가게 앞에 눕힌다"""
    kind = cut[0]
    if kind == 'end':
        slice_cap(lib, ob, (cut[1], 0, 0), cut[2] if len(cut) > 2 else (-1, 0, 0), mat)
        return [(ob, Matrix.Identity(4))]
    if kind == 'split':
        x, tl, tr, gap = cut[1], math.radians(cut[2]), math.radians(cut[3]), cut[4]
        right = _copy(lib, ob, 'rye_r')
        slice_cap(lib, ob, (x, 0, 0), (1, 0, 0), mat)
        slice_cap(lib, right, (x, 0, 0), (-1, 0, 0), mat)
        piv = (x, half_width(x) * 0.85, 0)
        return [(ob, Matrix.Translation((-gap, 0, 0)) @ _about(piv, -tl)),
                (right, Matrix.Translation((gap, 0, 0)) @ _about(piv, tr))]
    if kind == 'slice':
        x, t, (dx, dy), spin = cut[1], cut[2], cut[3], math.radians(cut[4])
        sl = _copy(lib, ob, 'rye_s')
        slice_cap(lib, ob, (x, 0, 0), (-1, 0, 0), mat)
        _cut_hidden(sl, (x - t, 0, 0), (-1, 0, 0))
        slice_cap(lib, sl, (x, 0, 0), (1, 0, 0), mat)
        # 단면(+X)이 위로: Y축 −90° → 등(+Z)이 −X 로 눕는다. 밑면(x − t)이 바닥 z=0 에 닿게
        M = Matrix.Translation((dx, dy, t - x)) @ Matrix.Rotation(spin, 4, 'Z') @ Matrix.Rotation(-math.pi / 2, 4, 'Y')
        return [(ob, Matrix.Identity(4)), (sl, M)]
    raise ValueError(cut)


def crumb(lib, fills=(), **kw):
    """호밀 속살 단면 재질 — 회갈색 · 촘촘 · 짙은 껍질 테. kw 로 crumb · pore · rim 덮어쓰기(반죽색 변형)"""
    from loaf_kit import crumb_material
    # 화면에서 알베도의 ≈1.45배로 밝게 뜬다 — #8C7262 은 분홍빛 회색 판이었다(r1)
    base = dict(crumb=('#66503F', '#76604C'), pore='#3E2C1E', rim=('#5A2C10', 0.009))
    return crumb_material(lib, axes=(1, 2), fills=fills, **dict(base, **kw))


# ── 조각 무늬 (단면 fills 의 mask) ────────────────────────────────────────────

def bits(at, warp=0.35):
    """loaf_kit.pieces + 고리 · 반달 — at = [(u, v, 반지름, 각°, 길쭉함, 구멍 비, 반달)].
    구멍 비 > 0 이면 가운데가 빈 고리(씨 뺀 올리브), 반달 = ±1 이면 그 쪽 절반만"""
    def mask(m, u, v, p):
        wob = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=40, detail=2), 0.5), warp)
        band = halo = None
        for cu, cv, r, ang, el, hole, half in at:
            c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            du, dv = m.math('SUBTRACT', u, cu), m.math('SUBTRACT', v, cv)
            a = m.math('DIVIDE', m.math('ADD', m.math('MULTIPLY', du, c), m.math('MULTIPLY', dv, s)), r * el)
            b = m.math('DIVIDE', m.math('SUBTRACT', m.math('MULTIPLY', dv, c), m.math('MULTIPLY', du, s)), r)
            d = m.math('ADD', m.vmath('LENGTH', m.combine(a, b, 0.0)), wob)
            k, h = m.math('SUBTRACT', 1.0, m.smooth(d, 0.85, 1.0)), m.math('SUBTRACT', 1.0, m.smooth(d, 1.0, 1.6))
            if hole:
                k = m.math('MULTIPLY', k, m.smooth(d, hole, hole + 0.1))
            if half:
                side = m.smooth(m.math('MULTIPLY', b, half), -0.08, 0.08)
                k, h = m.math('MULTIPLY', k, side), m.math('MULTIPLY', h, side)
            band = k if band is None else m.math('MAXIMUM', band, k)
            halo = h if halo is None else m.math('MAXIMUM', halo, h)
        return band, halo
    return mask


def holes(scale=55.0, size=0.2, cover=0.4):
    """또렷한 기공(덧칠 mask) — 고른 반죽색 단면이 햄 · 생고기로 읽힐 때 결을 깬다. cover = 빈 칸 비율"""
    def mask(m, u, v, p):
        pm = m.mapping(p, scale=(1, 1, 0.8))
        d = m.math('ADD', m.voronoi(pm, scale=scale, randomness=1.0),
                   m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=scale * 1.5, detail=2), 0.5), 0.3))
        keep = m.smooth(m.sep(m.voronoi(pm, scale=scale, randomness=1.0, out='Color'))[0], cover, cover + 0.02)
        return m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, size * 0.7, size)), keep), None
    return mask


def veined(inner, scale=60.0, width=0.07, warp=1.5):
    """inner 마스크 안의 주름 줄(호두 결 · 건포도 쭈글함) — 잡음 등고선. 덧칠 fill 의 mask 로 쓴다"""
    def mask(m, u, v, p):
        band, _ = inner(m, u, v, p)
        n = m.noise(p, scale=scale, detail=2, rough=0.5, distortion=warp)
        line = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.math('SUBTRACT', n, 0.5)), width * 0.4, width))
        return m.math('MULTIPLY', band, line), None
    return mask


# ── 껍질 조각 자리 ───────────────────────────────────────────────────────────

def top_pts(rnd, n, gap, xr=(-0.44, 0.44), wf=0.85, keep=None, slash_f=1.6):
    """윗면 (x, y) 자리 n개 — 서로 gap 넘게 · 칼집 렌즈(반폭 비 slash_f) 밖 · keep(x, y, rnd) 가 참인 데만"""
    from long_loaf import _local
    pts = []
    for _ in range(n * 60):
        x = rnd.uniform(*xr)
        hw = half_width(x) * wf
        y = rnd.uniform(-hw, hw)
        if keep and not keep(x, y, rnd):
            continue
        if any(t > 0 and abs(f) < slash_f for t, f in (_local(s, x, y) for s in SLASHES)):
            continue
        if all(math.hypot(x - a, y - b) > gap for a, b in pts):
            pts.append((x, y))
            if len(pts) == n:
                break
    return pts


def sunflower(lib, L, W, T, n=10):
    """해바라기씨(호밀 · 바게트 공용) → (재질, make). 볶은 회베이지 ~ 연갈색, 뾰족한 +X 끝만 노릇.
    흰 씨는 구더기 · 쌀알로 읽혔다(r2). lpos = 씨 자기 좌표(끝 가르기) + z 엇갈림(씨마다 다른 얼룩)"""
    from loaf_kit import flake
    m = lib.Mat('seed')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=30, detail=2), [(0.3, '#8A7A60'), (0.7, '#9C7852')])
    col = m.mix(m.smooth(m.sep(p)[0], L * 0.1, L * 0.45), col, '#BC8630')
    mat = m.out(col, 0.66)

    def make(lib, nm, r):
        s = r.uniform(0.8, 1.2)
        ob, h = flake(lib, nm, L * s, W * s, T, r, n=n, taper=0.45)
        lib.tag_local(ob)  # press_into 가 옮기기 전 — tag_local 은 이미 있으면 건너뛴다
        off = r.uniform(0, 50)
        for d in ob.data.attributes['lpos'].data:
            v = d.vector
            d.vector = (v[0], v[1], v[2] + off)
        return ob, h
    return mat, make


# ── 조립 ─────────────────────────────────────────────────────────────────────

def build_rye(lib, seed=SEED, crust=None, cut=None, crumb=None, top=None, angle=ANGLE, tris=11000, opts=None):
    """호밀빵 + 변형 → (parts, opts). crust = crust_material 덧인자 · cut = cut_parts() 참고 ·
    crumb(lib) → 단면 재질 · top(lib, body, rnd) → 얹은 파트 목록(몸통 국소 좌표) · tris = 몸통 삼각형"""
    lib.reset(seed)
    crust = crust or {}
    mat = crust_material(lib, **crust)
    ob = loft(lib, 'rye', stations(140, 0.6), section(lib), nth=88)
    lib.displace_normal(ob, slash_disp(crust.get('slashes', SLASHES), H * 0.6))
    lib.decimate(ob, min(1.0, tris / max(1, lib.tri_count(ob))))
    lib.assign(ob, mat)
    placed = cut_parts(lib, ob, cut, crumb(lib)) if cut else [(ob, Matrix.Identity(4))]
    if top:
        placed += [(q, Matrix.Identity(4)) for q in top(lib, ob, random.Random(seed))]
    R = Matrix.Rotation(lib.az(angle), 4, 'Z')
    for q, M in placed:
        if cut or top:
            q.matrix_world = R @ M
        else:
            lib.place(q, rot=(0, 0, lib.az(angle)))
    parts = [q for q, _ in placed]
    if len(parts) == 1 and not cut:
        print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    else:
        print(f'  body {lib.tri_count(ob)} tri · total {sum(lib.tri_count(q) for q in parts)}')
    return parts, dict(dict(size=1024, rough_size=512, ao_samples=48, ao_strength=0.45), **(opts or {}))
