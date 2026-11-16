"""식빵 계열 공용 — loaf · loaf--* 가 함께 쓴다 (docs/BREADS.md §Blender).

식빵 형상 · 껍질(아래 「식빵」 절)은 breads/loaf.py 에서 옮겼다 — 기본 인자로 부르면 옛 loaf 와 바이트까지 같다.
「형상 무관 도우미」 절은 호밀빵 · 바게트 변형도 쓴다: 닫힌 메시를 평면으로 썰어 단면을 덮는 slice_cap,
단면 재질 crumb_material(속살 · 기공 · 테 · 소용돌이), 몸통에 반쯤 묻는 bury.
국소 좌표: 길이 X(−0.5..0.5) · 폭 Y · 바닥 z=0. 배치(ANGLE 회전)는 build_loaf 끝에서 모든 파트에 같이 건다 —
짧은 끝면(−X)이 화면 왼쪽, 옆면(−Y)이 오른쪽 앞.
"""
import math
import random

import bmesh
import bpy
from long_loaf import loft
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

SEED = 9
ANGLE = 140  # 길이축 방위 — 짧은 끝면이 화면 왼쪽(레퍼런스 3/4)
HY = 0.30  # 옆벽 반폭(위 테)
HS = 0.50  # 팬 테 높이 = 뚜껑 시작
HT = 0.72  # 돔 꼭대기
RB = 0.045  # 아래 모서리 반경
NTH = 112


# ── 식빵 형상 ────────────────────────────────────────────────────────────────

def half_section():
    """반단면 (y, z) — 바닥 가운데 → 옆벽 → 뚜껑 → 꼭대기 가운데. 촘촘한 폴리라인"""
    yb = HY - 0.012  # 팬 바닥 쪽이 살짝 좁다
    pts = [((yb - RB) * k / 12, 0.0) for k in range(12)]
    pts += [(yb - RB + RB * math.sin(a), RB - RB * math.cos(a)) for a in (math.pi / 2 * k / 10 for k in range(1, 11))]
    for k in range(1, 21):  # 옆벽 — 위로 갈수록 HY까지 벌어진다
        u = k / 20
        pts.append((yb + (HY - yb) * u, RB + (HS - 0.012 - RB) * u))
    # 뚜껑 어깨 — 테 위로 살짝 부풀었다가(+0.014) 둥글게 돌아 돔으로
    cy, cz, r = HY + 0.014 - 0.075, HS + 0.03, 0.075
    for k in range(0, 15):
        a = -math.pi / 2 + 0.55 + (math.pi / 2 + 0.25 - 0.55) * k / 14
        pts.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    y0, z0 = pts[-1]
    for k in range(1, 25):  # 돔 — 어깨 끝에서 꼭대기까지 타원 호
        u = k / 24
        y = y0 * (1 - u)
        pts.append((y, z0 + (HT - z0) * (1 - (y / y0) ** 2) ** 0.75))
    return pts


def resample(lib):
    """닫힌 단면을 NTH점으로 — 굽은 데(모서리·어깨)에 점을 더 준다. th 0 = +Y 옆벽 가운데쯤에서 시작"""
    half = half_section()
    loop = [(y, z) for y, z in half] + [(-y, z) for y, z in reversed(half[1:-1])]
    n = len(loop)
    w = [0.0]
    for i in range(1, n + 1):
        a, b, c = loop[i - 2], loop[i - 1], loop[i % n]
        seg = math.hypot(b[0] - c[0], b[1] - c[1])
        t1 = math.atan2(b[1] - a[1], b[0] - a[0])
        t2 = math.atan2(c[1] - b[1], c[0] - b[0])
        turn = abs((t2 - t1 + math.pi) % math.tau - math.pi)
        w.append(w[-1] + seg + 0.035 * turn)
    total, out, j = w[-1], [], 0
    for k in range(NTH):
        tgt = total * k / NTH
        while w[j + 1] < tgt:
            j += 1
        t = (tgt - w[j]) / (w[j + 1] - w[j])
        a, b = loop[j], loop[(j + 1) % n]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def smoothed(sec, it=40):
    """끝면용 단면 — 어깨 부풂을 HY로 펴고 꺾인 데를 라플라스로 둥글린다"""
    pts = [(math.copysign(min(abs(y), HY), y), z) for y, z in sec]
    n = len(pts)
    for _ in range(it):
        pts = [((pts[i - 1][0] + 2 * pts[i][0] + pts[(i + 1) % n][0]) / 4,
                (pts[i - 1][1] + 2 * pts[i][1] + pts[(i + 1) % n][1]) / 4) for i in range(n)]
    return pts


def section(lib):
    sec = resample(lib)
    soft = smoothed(sec)
    zc = sum(z for _, z in sec) / len(sec)

    def fn(x, th):
        t = min(1.0, abs(x) / 0.5)
        s = (1 - t ** 10) ** 0.1  # 끝면 = 평평한 둥근 모서리
        k = round(th / math.tau * NTH) % NTH
        # 끝(t 0.84→0.95)에선 둥글린 단면으로 — 꺾인 단면(어깨·팬 테)을 무게중심 쪽으로 줄이면
        # 꺾인 점들이 끝면에 모서리 → 가운데로 가는 V자 금을 그었다(r2~r4)
        b = min(1.0, max(0.0, (t - 0.84) / 0.11))
        y = sec[k][0] + (soft[k][0] - sec[k][0]) * b
        z = sec[k][1] + (soft[k][1] - sec[k][1]) * b
        if z > HS:  # 돔은 길이 방향으로도 끝으로 갈수록 낮다(레퍼런스 정면도)
            z = HS + (z - HS) * (1 - 0.3 * t ** 2.2)
        wob = 0.0015 * lib.n3(x * 3, y * 3, z * 3, 4.2)
        return (y * s) * (1 + wob), zc + (z - zc) * s + wob * 0.2
    return fn


# ── 식빵 껍질 ────────────────────────────────────────────────────────────────

LOAF_PAL = dict(crust=('#CE762A', '#D98536', '#E3933E'), ridge='#B5621F', shoulder='#E8A458', blister='#A0501A',
                side=('#FFE9BA', '#FFEFCA'), kiss='#E3B26A', shred='#FBEAC6', pore='#D9B37A')


def loaf_material(lib, pal=None, fx=None):
    """식빵 껍질 — pal 로 색만 바꾼다(LOAF_PAL 키 + rough = 뚜껑 거칠기, 기본 0.86). 뚜껑 = 팬 테(HS) 위 구운 돔 · 옆 = 옅은 크림 옆벽.
    fx(m, p, cap, col, rough, h) → (col, rough, h) — 뚜껑에 덧칠(씨 · 윤기 · 글레이즈). 없으면 옛 그래프 그대로"""
    c = dict(LOAF_PAL, **(pal or {}))
    m = lib.Mat('loaf')
    p = m.lpos()
    px = m.sep(p)
    nz = m.sep(m.lnrm())[2]
    blot = m.noise(p, scale=5, detail=5, rough=0.6, distortion=0.25)
    # 뚜껑 = 팬 테(HS) 위. 경계는 얼룩으로 살짝 흔들고 위를 보는 면이면 낮아도 껍질
    edge = m.math('ADD', px[2], m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.02))
    cap = m.math('MAXIMUM', m.smooth(edge, HS - 0.004, HS + 0.012), m.smooth(nz, 0.75, 0.9))

    # 돔: 가운데 마루가 더 구워지고 어깨 쪽은 밝은 금빛
    ridge = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', px[1]), 0.0, HY))
    crust = m.ramp(blot, [(0.3, c['crust'][0]), (0.5, c['crust'][1]), (0.7, c['crust'][2])])
    crust = m.mix(m.math('MULTIPLY', ridge, 0.3), crust, c['ridge'])
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(nz, 0.3, 0.8)), 0.6), crust, c['shoulder'])
    blister = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=60, randomness=0.9), 0.05, 0.12))
    blister = m.math('MULTIPLY', blister, m.smooth(m.noise(p, scale=9, detail=2), 0.5, 0.62))
    crust = m.mix(m.math('MULTIPLY', blister, 0.15), crust, c['blister'])

    # 옆면: 옅은 크림 + 팬에 닿아 살짝 구운 기운(아래·모서리 쪽 금빛)
    side = m.ramp(m.noise(p, scale=14, detail=4), [(0.3, c['side'][0]), (0.7, c['side'][1])])
    kiss = m.math('ADD', m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(px[2], 0.0, 0.2)), 0.6),
                  m.math('MULTIPLY', m.smooth(blot, 0.55, 0.75), 0.12))  # 0.35는 옆면이 누런 얼룩으로 읽혔다(r10)
    side = m.mix(m.math('MULTIPLY', kiss, 0.6), side, c['kiss'])
    # 테 바로 밑 — 오븐에서 부풀며 찢긴 결(밝은 띠)
    shred = m.math('MULTIPLY', m.smooth(px[2], HS - 0.05, HS - 0.01),
                   m.math('SUBTRACT', 1.0, m.smooth(px[2], HS - 0.006, HS)))
    side = m.mix(m.math('MULTIPLY', shred, 0.5), side, c['shred'])
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=160, randomness=0.9), 0.05, 0.14))
    side = m.mix(m.math('MULTIPLY', pore, 0.25), side, c['pore'])

    col = m.mix(cap, side, crust)
    rough = m.mixf(cap, 0.88, c.get('rough', 0.86))  # 0.76은 방 반사가 뚜껑 채도를 뺐다
    h = m.mixf(cap, m.math('MULTIPLY', pore, -0.5),
               m.math('ADD', m.math('MULTIPLY', blot, 0.4), m.math('MULTIPLY', blister, -0.4)))
    h = m.math('ADD', h, m.math('MULTIPLY', m.noise(p, scale=80, detail=2), 0.15))
    if fx:
        col, rough, h = fx(m, p, cap, col, rough, h)
    return m.out(col, rough, m.bump(h, strength=0.4, distance=0.003))


# ── 식빵 조립 ────────────────────────────────────────────────────────────────

def top_z(body, x, y):
    """몸통 국소 (x, y) 위에서 내려쏜 윗면 높이 · 법선 (빗나가면 None)"""
    hit = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get()).ray_cast(Vector((x, y, 5.0)), Vector((0, 0, -1)))
    return None if hit[0] is None else (hit[0].z, hit[1])


def build_loaf(lib, seed=SEED, pal=None, cut=None, crumb=None, top=None, opts=None, fx=None, cut_no=(-1, 0, 0), slab=None):
    """식빵 + 변형. pal = 껍질 색(LOAF_PAL 키) · fx = 뚜껑 덧칠(loaf_material) · cut = 끝(−X)을 썰어낼 x(예 −0.40) ·
    cut_no = 썬 면 법선(비스듬히 썰기 = (−1, 0.4, 0) 등) · slab = dict(t, lean) 이면 썰어 낸 한 장을 끝면에 기대 세운다(cut_slab) ·
    crumb(lib) → 단면 재질(cut 이 있을 때) · top(lib, body, rnd, x0) → 얹은 파트 목록(몸통 국소 좌표, x0 = 빵 왼끝).
    → (parts, opts)"""
    lib.reset(seed)
    mat = loaf_material(lib, pal, fx)
    # 정거장 — 가운데는 성기게(길이 방향으로 평평), 끝 둥근 모서리는 촘촘하게. 줄이기(decimate)는 쓰지 않는다:
    # 끝 모서리 고리가 옆벽까지 긴 바늘 삼각형으로 뭉개져 옆면에 세로 줄무늬가 생겼다(r4·r5)
    end = [0.42 + 0.08 * math.sin(math.pi / 2 * k / 16) for k in range(1, 17)]
    mid = [-0.42 + 0.84 * k / 22 for k in range(23)]
    xs = [-e for e in reversed(end)] + mid + end
    ob = loft(lib, 'loaf', xs, section(lib), nth=NTH)
    parts = [ob]
    lib.assign(ob, mat)
    if cut is not None:
        cm = crumb(lib)
        if slab:
            parts.append(cut_slab(lib, ob, cut, cm, **slab))
        slice_cap(lib, ob, (cut, 0, 0), cut_no, cm)
    if top:
        parts += top(lib, ob, random.Random(seed), -0.5 if cut is None else cut)
    for p in parts:
        lib.place(p, rot=(0, 0, lib.az(ANGLE)))
    if len(parts) == 1:
        print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    else:
        print(f'  body {lib.tri_count(ob)} tri · total {sum(lib.tri_count(q) for q in parts)}')
    return parts, dict(dict(size=1024, rough_size=512, ao_samples=48, ao_strength=0.25), **(opts or {}))


# ── 형상 무관 도우미 (호밀빵 · 바게트 변형도 쓴다) ────────────────────────────

def slice_cap(lib, ob, co, no, mat, grid=0.03):
    """닫힌 메시 ob 를 평면(co, no)으로 썰어 no 쪽을 버리고 단면을 덮는다(테 + 안쪽 두 줄 + grid 간격 점의 제약 들로네) → 단면 면 수.
    덮개는 따로 떨어진 섬(평평한 음영 — 몸통 끝 고리 법선이 꺾이지 않게)이고 재질 mat 을 칸으로 더한다.
    정점 속성 rim = 단면 테에서 안쪽으로 잰 거리(몸통은 0) — crumb_material 이 껍질 테를 그린다.
    단면 테는 고리 하나여야 한다(구멍 · 여러 조각 단면은 못 덮는다)."""
    co, no = Vector(co), Vector(no).normalized()
    me = ob.data
    me.materials.append(mat)
    mi = len(me.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no,
                           clear_outer=True, dist=1e-6)
    # 이 평면 위 테만 — 앞서 덮은 단면(따로 떨어진 섬)의 테는 고리에서 뺀다(한 장 썰기 = 두 번 덮기)
    bnd = [e for e in bm.edges if e.is_boundary and all(abs((v.co - co).dot(no)) < 1e-5 for v in e.verts)]
    nb = {}
    for e in bnd:
        a, b = e.verts
        nb.setdefault(a, []).append(b)
        nb.setdefault(b, []).append(a)
    loop, prev = [bnd[0].verts[0]], None
    while True:
        nxt = next(v for v in nb[loop[-1]] if v is not prev)
        if nxt is loop[0]:
            break
        prev = loop[-1]
        loop.append(nxt)
    assert len(loop) == len(bnd), f'단면 테가 고리 하나가 아니다({len(loop)}/{len(bnd)})'
    raw = [v.co.copy() for v in loop]
    n = len(raw)
    segs = [(raw[i], raw[(i + 1) % n]) for i in range(n)]
    # 테를 호 길이로 고르게 다시 찍는다 — 썬 자리에 몰린 점(간격 1e-3 밑)은 바늘 삼각형이 된다
    acc = [0.0]
    for a, b in segs:
        acc.append(acc[-1] + (b - a).length)
    pts, j = [], 0
    for k in range(n):
        s = acc[-1] * k / n
        while acc[j + 1] < s:
            j += 1
        a, b = segs[j]
        pts.append(a.lerp(b, (s - acc[j]) / max(acc[j + 1] - acc[j], 1e-12)))
    # 2D 평면 좌표에서 제약 들로네로 덮는다. 가운데로 줄인 동심 고리는 팬 테 밑으로 말려 든 뚜껑 입술(오목)에서
    # 접혀 겹쳤고, 그 띠가 가운데까지 AO 검은 선 두 줄로 구워졌다(r1)
    U = no.orthogonal().normalized()
    V = no.cross(U)
    poly = [((p - co).dot(U), (p - co).dot(V)) for p in pts]
    S2 = [((a - co).dot(U), (a - co).dot(V), (b - co).dot(U), (b - co).dot(V)) for a, b in segs]

    def rim_d(x, y):
        best = 1e9
        for ax, ay, bx, by in S2:
            dx, dy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / max(dx * dx + dy * dy, 1e-12)))
            best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
        return best

    def inside(x, y):
        hit = False
        for i in range(n):
            (ax, ay), (bx, by) = poly[i], poly[i - 1]
            if (ay > y) != (by > y) and x < ax + (bx - ax) * (y - ay) / (by - ay):
                hit = not hit
        return hit

    xs, ys = [q[0] for q in poly], [q[1] for q in poly]
    inner = []
    for d, step in ((0.006, 0.008), (0.014, 0.011)):  # 테 안쪽 두 줄 — 껍질 테 색이 각지지 않게
        for i in range(n):
            (ax, ay), (bx, by) = poly[i - 1], poly[(i + 1) % n]
            tx, ty = bx - ax, by - ay
            ln = math.hypot(tx, ty) or 1.0
            for sgn in (1, -1):
                q = (poly[i][0] - sgn * ty / ln * d, poly[i][1] + sgn * tx / ln * d)
                if inside(*q) and rim_d(*q) > d * 0.7 and all(math.hypot(q[0] - a, q[1] - b) > step for a, b in inner[-3:]):
                    inner.append(q)
                    break
    g = grid
    for k in range(int((max(xs) - min(xs)) / g) + 1):
        for j in range(int((max(ys) - min(ys)) / g) + 1):
            q = (min(xs) + g * (k + 0.5 * (j % 2)), min(ys) + g * j * 0.87)
            if inside(*q) and rim_d(*q) > 0.02:
                inner.append(q)
    out_v, _, out_f, *_ = delaunay_2d_cdt([Vector(q) for q in poly + inner], [], [list(range(n))], 1, 1e-6)
    lay = bm.verts.layers.float.get('rim') or bm.verts.layers.float.new('rim')
    vs = []
    for q in out_v:
        v = bm.verts.new(co + U * q.x + V * q.y)
        v[lay] = rim_d(q.x, q.y)
        vs.append(v)
    faces = [bm.faces.new([vs[i] for i in f]) for f in out_f]
    for f in faces:
        f.material_index = mi
        f.smooth = False
        f.normal_update()
        if f.normal.dot(no) < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(faces)


def cut_slab(lib, ob, cut, mat, t=0.07, lean=28.0, gap=0.004):
    """ob 의 (cut − t, cut) 사이를 한 장으로 떠서 두 면을 덮고(slice_cap 두 번), 썬 면이 위 · 앞(−X)을 보게
    몸통 끝면(x = cut)에 lean° 기대 세운다 → 파트. lpos 는 세우기 전 좌표로 박아 둔다(단면 무늬 · 껍질 가르기가 그대로)"""
    from mathutils import Matrix
    sl = lib.link(ob.copy())
    sl.data = ob.data.copy()
    slice_cap(lib, sl, (cut, 0, 0), (1, 0, 0), mat)
    slice_cap(lib, sl, (cut - t, 0, 0), (-1, 0, 0), mat)
    lib.tag_local(sl)
    th = math.radians(lean)
    top = max(v.co.z for v in sl.data.vertices)
    sl.data.transform(Matrix.Translation((cut - top * math.sin(th) - gap, 0, 0)) @ Matrix.Rotation(th, 4, 'Y')
                      @ Matrix.Translation((-cut, 0, 0)))
    sl.data.update()
    return sl


def crumb_material(lib, name='crumb', crumb=('#EED29C', '#F6DFB0'), pore='#CFA468', rim=('#E2BE84', 0.012),
                   rim_top=None, axes=(1, 2), fills=()):
    """썬 단면 재질(slice_cap 덮개용) — 속살 얼룩 · 기공 · 껍질 테(정점 속성 rim) · 속 재료(fills).
    무늬 좌표 (u, v) = lpos 의 axes 두 성분(단면 평면). rim = (색, 두께) · rim_top = (높이 z, 색): 이 높이 위 테는 구운 뚜껑 색.
    fills = [dict(mask=swirl(…)|marble(…)|pieces(…), col=(짙은, 옅은), halo=(색, 세기)|None, gloss=거칠기)] — 차례로 덧칠"""
    m = lib.Mat(name)
    p = m.lpos()
    px = m.sep(p)
    u, v = px[axes[0]], px[axes[1]]
    col = m.ramp(m.noise(p, scale=9, detail=3), [(0.35, crumb[0]), (0.65, crumb[1])])
    # 기공 — 세로로 늘어난 성긴 구멍, 색은 옅게(밝은 면에 짙은 점이 여럿이면 벌레 · 구멍으로 읽힌다)
    pd = m.voronoi(m.mapping(p, scale=(1, 1, 0.75)), scale=36, randomness=0.95)
    pores = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(pd, 0.10, 0.26)), m.smooth(m.noise(p, scale=11, detail=2), 0.35, 0.6))
    col = m.mix(m.math('MULTIPLY', pores, 0.45), col, pore)
    rough = 0.9
    h = m.math('MULTIPLY', pores, -1.0)
    for f in fills:
        band, halo = f['mask'](m, u, v, p)
        if f.get('halo') and halo is not None:
            col = m.mix(m.math('MULTIPLY', halo, f['halo'][1]), col, f['halo'][0])
        fill = m.ramp(m.noise(p, scale=26, detail=3), [(0.3, f['col'][0]), (0.7, f['col'][1])])
        col = m.mix(band, col, fill)
        rough = m.mixf(band, rough, f.get('gloss', 0.6))
        h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, band)), m.math('MULTIPLY', band, 0.2))
    # 껍질 테 — 정점 속성 rim(단면 테까지 거리). 테 두께는 얼룩으로 살짝 흔든다
    rd = m.math('ADD', m.attr('rim'), m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=20, detail=2), 0.5), rim[1] * 0.5))
    ring = m.math('SUBTRACT', 1.0, m.smooth(rd, rim[1] * 0.6, rim[1]))
    rc = rim[0] if rim_top is None else m.mix(m.smooth(px[2], rim_top[0] - 0.01, rim_top[0] + 0.01), rim[0], rim_top[1])
    col = m.mix(ring, col, rc)
    return m.out(col, rough, m.bump(h, strength=0.3, distance=0.003))


def swirl(c, pitch=0.07, r=0.24, w=0.42, wob=0.8, wscale=7.0, aspect=1.0):
    """말아 넣은 소용돌이 띠(잼 깜빠뉴 식) — c = 단면 (u, v) 가운데, pitch = 감김 간격, r = 바깥 반지름, w = 띠 비율,
    wob · wscale = 위상을 흔드는 잡음 세기 · 크기(고른 띠는 과녁으로 읽혔다), aspect = u 늘임"""
    def mask(m, u, v, p):
        qu = m.math('MULTIPLY', m.math('SUBTRACT', u, c[0]), aspect)
        qv = m.math('SUBTRACT', v, c[1])
        rho = m.vmath('LENGTH', m.combine(qu, qv, 0.0))
        phase = m.math('ADD', m.math('DIVIDE', rho, pitch), m.math('DIVIDE', m.math('ARCTAN2', qv, qu), math.tau))
        phase = m.math('ADD', phase, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=wscale, detail=3), 0.5), wob))
        d = m.math('ABSOLUTE', m.math('SUBTRACT', m.math('FRACT', phase), 0.5))
        d = m.math('ADD', d, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=9, detail=3), 0.5), 1.0))
        env = m.math('MULTIPLY', m.smooth(rho, 0.004, 0.02), m.math('SUBTRACT', 1.0, m.smooth(rho, r - 0.03, r)))
        band = m.math('MULTIPLY', m.smooth(d, 0.5 - w / 2 - 0.04, 0.5 - w / 2 + 0.03), env)
        halo = m.math('MULTIPLY', m.smooth(d, 0.5 - w / 2 - 0.10, 0.5 - w / 2), env)
        return band, halo
    return mask


def marble(scale=2.6, width=0.06, warp=2.0, stretch=(1.0, 1.0, 1.0), seed=0.0):
    """반죽에 접혀 든 결(바브카 · 마블) — 잡음 등고선 한 줄, 굵기는 다른 잡음으로 0.6~1.4배 흔든다.
    stretch 로 결을 한 방향으로 눕힌다(접어 민 켜). 굵기를 0.3~1.7배로 흔든 판은 얼룩소 무늬였다(r2)"""
    def mask(m, u, v, p):
        q = m.mapping(p, loc=(seed, seed * 1.3, seed * 0.7), scale=stretch)
        n = m.noise(q, scale=scale, detail=2, rough=0.5, distortion=warp)
        wd = m.math('MULTIPLY', width, m.math('ADD', 0.6, m.math('MULTIPLY', m.noise(q, scale=scale * 2.2, detail=1), 0.8)))
        d = m.math('DIVIDE', m.math('ABSOLUTE', m.math('SUBTRACT', n, 0.5)), wd)
        return m.math('SUBTRACT', 1.0, m.smooth(d, 0.7, 1.0)), m.math('SUBTRACT', 1.0, m.smooth(d, 0.8, 2.2))
    return mask


def pieces(at, warp=0.35, box=False, wscale=40):
    """단면에 박힌 조각(건과 · 덩어리)을 자리 지정으로 — at = [(u, v, 반지름, 각°, 길쭉함)].
    윤곽은 잡음으로 찌그러뜨린다(wscale = 잡음 크기, 작을수록 크게 일렁인다). box = 네모 조각(깍둑썰기).
    보로노이로 흩은 판은 조각이 테에만 몰리고 가운데가 비었다(r2) — 크기 · 방향 · 간격을 손으로 흩어 「고르게 뿌린 점」을 피한다"""
    def mask(m, u, v, p):
        wob = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=wscale, detail=2), 0.5), warp)
        band = halo = None
        for cu, cv, r, ang, el in at:
            c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            du, dv = m.math('SUBTRACT', u, cu), m.math('SUBTRACT', v, cv)
            a = m.math('DIVIDE', m.math('ADD', m.math('MULTIPLY', du, c), m.math('MULTIPLY', dv, s)), r * el)
            b = m.math('DIVIDE', m.math('SUBTRACT', m.math('MULTIPLY', dv, c), m.math('MULTIPLY', du, s)), r)
            if box:
                d = m.math('ADD', m.math('MAXIMUM', m.math('ABSOLUTE', a), m.math('ABSOLUTE', b)), wob)
            else:
                d = m.math('ADD', m.vmath('LENGTH', m.combine(a, b, 0.0)), wob)
            k, h = m.math('SUBTRACT', 1.0, m.smooth(d, 0.85, 1.0)), m.math('SUBTRACT', 1.0, m.smooth(d, 1.0, 1.6))
            band = k if band is None else m.math('MAXIMUM', band, k)
            halo = h if halo is None else m.math('MAXIMUM', halo, h)
        return band, halo
    return mask


def stud(lib, body, pts, make, mat, rnd, sink=0.3, tilt=0.15, name='bit'):
    """몸통 윗면 (x, y) 자리마다 make(lib, 이름, rnd) → (ob, h) 조각을 반쯤 묻어 앉힌다(wedge.press_into) → 파트 목록"""
    from wedge import press_into
    out = []
    for k, (x, y) in enumerate(pts):
        ob, h = make(lib, f'{name}{k}', rnd)
        press_into(lib, body, ob, h, at_xy=(x, y), sink=rnd.uniform(*sink) if isinstance(sink, tuple) else sink, tilt=(rnd.uniform(-tilt, tilt), rnd.uniform(-tilt, tilt)),
                   spin=rnd.uniform(0, math.tau))
        if len(ob.data.polygons):
            out.append(lib.assign(ob, mat))
    return out


def blob_chain(lib, name, elems, tris=4000, resolution=0.008):
    """녹아 흐른 덩어리(치즈 · 크림) — elems = [(중심 (x,y,z), 반지름, (sx, sy, sz))] 메타볼 타원을 한 면으로 → 목표 삼각형까지"""
    ob = lib.metaballs(name, [dict(type='ELLIPSOID', co=c, radius=r, size=s) for c, r, s in elems], resolution=resolution)
    lib.decimate(ob, min(1.0, tris / max(1, lib.tri_count(ob))))
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def bury(lib, body, ob, eps=0.002):
    """ob 에서 body 안에 묻힌 면을 지운다(같은 국소 좌표일 때) — 녹아 흐른 치즈 · 반쯤 박힌 조각"""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())

    def buried(c, _n):
        hit = bvh.find_nearest(c)
        return hit[0] is not None and (c - hit[0]).dot(hit[1]) < -eps

    lib.delete_faces(ob, buried)
    return ob


def flake(lib, name, L, W, T, rnd, n=10, jit=0.18, taper=0.0, curl=0.0):
    """얇은 조각 한 장(귀리 · 씨 · 아몬드 슬라이스 · 코코넛 채) — 찌그러진 n각 판, 윗면 가운데가 살짝 솟는다(4n tri).
    taper > 0 이면 +X 끝이 뾰족(씨), curl = 길이 방향으로 휜 정도(채). → (ob, T/2)"""
    s0 = rnd.uniform(0, 100)
    ring = []
    for k in range(n):
        a = math.tau * k / n
        x, y = math.cos(a), math.sin(a)
        j = 1 + jit * lib.n3(x * 1.3, y * 1.3, 0, s0)
        ring.append((x * L / 2 * j, y * W / 2 * j * (1 - taper * (x + 1) / 2)))
    bm = bmesh.new()
    lift = lambda x: curl * (2 * x / L) ** 2 * L
    top = [bm.verts.new((x, y, T / 2 + lift(x))) for x, y in ring]
    bot = [bm.verts.new((x, y, -T / 2 + lift(x))) for x, y in ring]
    ct, cb = bm.verts.new((0, 0, T * 0.8)), bm.verts.new((0, 0, -T * 0.6))
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((ct, top[k], top[j]))
        bm.faces.new((cb, bot[j], bot[k]))
        bm.faces.new((top[k], bot[k], bot[j], top[j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me)), T / 2


def cover_pts(lib, rnd, x0, n, gap, x1=0.46, edge=0.27, fade=0.08, seed=0.0, holes=0.0):
    """뚜껑 위를 거의 덮는 자리 n개(가까이 붙음 · 겹침 허용 = gap 이 조각보다 작다) — |y| 가 edge − fade 를 넘으면
    어깨로 갈수록 성기다. holes > 0 이면 잡음으로 군데군데 덜 덮인 자리를 둔다(고르게 깐 판 피하기)"""
    pts = []
    for _ in range(n * 60):
        x, y = rnd.uniform(x0 + 0.03, x1), rnd.uniform(-edge, edge)
        keep = min(1.0, max(0.0, (edge - abs(y)) / fade)) * min(1.0, max(0.0, (x1 - x) / 0.06 + 0.3))
        if holes:
            keep *= 1 - holes * max(0.0, lib.n3(x * 6, y * 6, 0, seed))
        if rnd.random() > keep:
            continue
        if all((x - a) ** 2 + (y - b) ** 2 > gap * gap for a, b in pts):
            pts.append((x, y))
            if len(pts) == n:
                break
    return pts
