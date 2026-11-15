"""팬케이크 변형 새 설계 공용(2026-11-15) — 메뉴 이름만 듣고 지었다. 레퍼런스 그림 · 프롬프트 JSON ·
pancake_stack.py 를 쓰지 않는다. 도구(lib.py)만 같이 쓴다.

Cake  = 팬케이크 한 장(수치 + 메시). 흘러내림 경로가 같은 수치를 읽는다.
flow  = 윗면에 고였다가 옆으로 흘러내리는 소스 한 장(꿀 · 콩포트 · 글레이즈).
berry = 꼭지 왕관이 있는 둥근 열매.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import lib

TAU = math.tau
_TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')


# ── 팬케이크 한 장 ────────────────────────────────────────────────────────────

class Cake:
    def __init__(self, R, H, z0=0.0, cx=0.0, cy=0.0, seed=0, n=3.4, dome=0.012, droop=0.0, steps=18, wob=0.02,
                 pleat=0.0):
        rnd = random.Random(seed)
        self.R, self.H, self.z0, self.cx, self.cy, self.droop = R, H, z0, cx, cy, droop
        self.pleat = (pleat, rnd.uniform(0, TAU), rnd.uniform(0, TAU))  # 수플레 옆구리의 세로 주름
        self.prof = lib.superellipse_profile(R, H, n=n, steps=steps, dome=dome)
        self.ph = [(k, wob * a, rnd.uniform(0, TAU)) for k, a in ((2, 1.0), (3, 0.7), (5, 0.4), (7, 0.22))]
        self.tilt = (rnd.uniform(0, TAU), rnd.uniform(0.003, 0.008))

    @property
    def top(self):
        return self.z0 + self.prof[-1][1]

    def rf(self, th):
        return 1.0 + sum(a * math.sin(k * th + p) for k, a, p in self.ph)

    def zf(self, th, r):
        u = r / self.R
        return -self.droop * u ** 3 + self.tilt[1] * u * math.cos(th - self.tilt[0])

    def build(self, name, segs=64):
        a, p1, p2 = self.pleat

        def rfn(th, z):
            w = math.sin(math.pi * min(1.0, max(0.0, z / self.H))) ** 0.7
            return self.rf(th) + a * w * (math.sin(11 * th + p1) + 0.6 * math.sin(17 * th + p2 + 6.0 * z / self.H))

        ob = lib.lathe(name, self.prof, segs=segs, rfn=rfn if a else (lambda th, z: self.rf(th)), zfn=self.zf)
        return lib.place(ob, (self.cx, self.cy, self.z0))

    def ext(self, th, z, cx, cy):
        """(cx, cy)에서 th 방향으로 본 높이 z의 바깥 반지름(치우침이 작다고 보고 근사)"""
        r = lib.prof_r(self.prof, z - self.z0)
        if r <= 0.0:
            return 0.0
        return r * self.rf(th) + (self.cx - cx) * math.cos(th) + (self.cy - cy) * math.sin(th)


def sss(m, weight, radius, scale=0.03):
    """표면하 산란 — 빛 굽기에서 속으로 스민 빛이 그늘을 따뜻하게 밝힌다. 열린 한 겹 면에도 되는 BURLEY"""
    b = m.bsdf
    b.subsurface_method = 'BURLEY'
    b.inputs['Subsurface Weight'].default_value = weight
    b.inputs['Subsurface Radius'].default_value = radius
    b.inputs['Subsurface Scale'].default_value = scale


def sugar(m, col, center, radius, amount=0.7, color='#FCF9F1', grain_w=0.75, even=0.0):
    """체로 친 가루(슈가파우더 · 말차) — center 둘레 radius 안, 위를 보는 면에 얼룩지게. (섞은 색, 덮인 정도)"""
    g = m.node('ShaderNodeNewGeometry')  # 합친 뒤 굽는다 → 월드 좌표 · 법선
    P, N = g.outputs['Position'], g.outputs['Normal']
    up = m.smooth(m.sep(N)[2], 0.10, 0.80)
    near = m.math('SUBTRACT', 1.0, m.smooth(m.vmath('DISTANCE', P, center), radius * 0.35, radius))
    grain = m.smooth(m.noise(P, scale=75.0, detail=2.0, rough=0.7), 0.42, 0.62)
    veil = m.smooth(m.noise(P, scale=9.0, detail=2.0), 0.30, 0.70)
    w = m.math('MULTIPLY', m.math('MULTIPLY', up, near),
               m.math('ADD', m.math('MULTIPLY', grain, grain_w), m.math('MULTIPLY', veil, 1.2 - grain_w)), clamp=True)
    if even:  # 얼룩 없이 고르게 덮고 가장자리만 성기게(말차 가루 — 얼룩지면 곰팡이로 읽힌다)
        w = m.mixf(even, w, m.math('MULTIPLY', m.math('MULTIPLY', up, near), m.mixf(near, grain, 1.0)))
    w = m.math('MULTIPLY', w, amount, clamp=True)
    return m.mix(w, col, color), w


def grain(m, P, scale=3.2):
    """사진(CC0 케이크 속살)에서 뽑은 결 0..1(평균 0.5) — 절차 무늬만으로는 못 내는 불규칙함"""
    img = bpy.data.images.load(os.path.join(_TEX, 'crumb.png'), check_existing=True)
    img.colorspace_settings.name = 'Non-Color'
    t = m.node('ShaderNodeTexImage', image=img, projection='BOX', projection_blend=0.35)
    m.link(m.mapping(P, scale=(scale, scale, scale)), t.inputs['Vector'])
    return t.outputs['Color']


def cake_mat(name, R, top=('#D2923A', '#AB6820', '#804614'), side=('#F4E2B8', '#E7CD98'), pit='#CDA466',
             pore_scale=46.0, rough=0.88, dust=None, mottle=0.3, ring_w=1.0, brand=None, gold_w=0.85):
    """구운 면(위 · 아래) = 고른 갈색 + 잔 반점 + 테 안쪽 옅은 고리, 옆 띠 = 크림색 속살(사진 결)"""
    m = lib.Mat(name)
    P, N = m.lpos(), m.lnrm()
    nz = m.math('ABSOLUTE', m.sep(N)[2])
    fine = m.noise(P, scale=38.0, detail=2.0)
    big = m.noise(P, scale=3.4 / R * 0.46, detail=3.0, rough=0.55)
    g = grain(m, P)
    gd = m.math('SUBTRACT', g, 0.5)
    face = m.smooth(m.math('ADD', nz, m.math('MULTIPLY', m.math('SUBTRACT', fine, 0.5), 0.12)), 0.72, 0.92)

    xy = m.vmath('MULTIPLY', P, (1, 1, 0))
    rr = m.math('DIVIDE', m.vmath('LENGTH', xy), R)
    # 테 바로 안쪽에 좁고 옅은 고리(반죽이 늦게 닿은 데), 맨 끝 모서리는 다시 짙다
    ring = m.math('SUBTRACT', m.math('MULTIPLY', m.smooth(rr, 0.93, 1.0), 0.22),
                  m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(rr, 0.76, 0.88), m.math('SUBTRACT', 1.0, m.smooth(rr, 0.90, 0.96))), 0.30))
    speck = m.noise(P, scale=150.0, detail=2.0, rough=0.7)
    tone = m.math('ADD', m.math('ADD', m.math('MULTIPLY', m.math('SUBTRACT', big, 0.5), 1.5 * mottle), 0.5),
                  m.math('ADD', m.math('ADD', m.math('MULTIPLY', gd, 1.1), m.math('MULTIPLY', m.math('SUBTRACT', speck, 0.5), 0.4)),
                         m.math('MULTIPLY', ring, ring_w)))
    crust = m.ramp(tone, [(0.18, top[0]), (0.50, top[1]), (0.82, top[2])])
    pin = m.smooth(m.voronoi(m.mapping(P, scale=(1, 1, 0.2)), scale=34.0), 0.04, 0.075)  # 드문 바늘구멍(터진 기포)
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, pin), 0.6), crust, top[0])

    if brand:  # 인두로 지진 꽃 도장(윗면만): (x, y, 크기) — 꽃잎 다섯 윤곽선 + 가운데 점
        bx, by, bs = brand
        px, py, _ = m.sep(P)
        dx, dy = m.math('SUBTRACT', px, bx), m.math('SUBTRACT', py, by)
        d = m.math('SQRT', m.math('ADD', m.math('MULTIPLY', dx, dx), m.math('MULTIPLY', dy, dy)))
        petal = m.math('ADD', m.math('MULTIPLY', m.math('ABSOLUTE', m.math('COSINE', m.math(
            'MULTIPLY', m.math('ARCTAN2', dy, dx), 2.5))), 0.38 * bs), 0.62 * bs)
        stroke = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.math('SUBTRACT', d, petal)), bs * 0.07, bs * 0.13))
        dot = m.math('SUBTRACT', 1.0, m.smooth(d, bs * 0.14, bs * 0.20))
        up = m.smooth(m.sep(N)[2], 0.3, 0.6)
        crust = m.mix(m.math('MULTIPLY', m.math('MULTIPLY', m.math('MAXIMUM', stroke, dot), up), 0.8), crust, '#4E260C')

    # 기공: 가로로 넓적한 구멍이 드문드문(지름 ≈ 장 두께의 4~5% — 더 잘면 굽기에서 사라진다) + 사진 결의 어두운 데
    pore = m.voronoi(m.mapping(P, scale=(1, 1, 1.8)), scale=pore_scale)
    some = m.smooth(m.noise(P, scale=pore_scale * 0.45, detail=1.0), 0.46, 0.56)
    hole = m.math('MAXIMUM', m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(pore, 0.09, 0.19)), some),
                  m.math('SUBTRACT', 1.0, m.smooth(g, 0.30, 0.44)))
    crumb = m.mix(m.noise(P, scale=11.0, detail=2.0), side[0], side[1])
    crumb = m.mix(m.math('MULTIPLY', hole, 0.6), crumb, pit)
    # 구운 색은 모서리를 감고 내려오며 옅어진다(갈색 → 황금 → 속살). 두 색뿐이면 뚜껑 덮은 지점토로 읽혔다
    gold = m.smooth(m.math('ADD', nz, m.math('ADD', m.math('MULTIPLY', m.math('SUBTRACT', big, 0.5), 0.25),
                                             m.math('MULTIPLY', m.math('SUBTRACT', fine, 0.5), 0.15))), 0.34, 0.74)
    col = m.mix(m.math('MULTIPLY', gold, gold_w), crumb, m.mix(0.45, top[0], side[1]))
    col = m.mix(face, col, crust)
    sss(m, 0.12, (1.0, 0.8, 0.6), 0.02)
    r = m.mixf(face, rough, rough - 0.22)  # 구운 면은 버터 기름으로 살짝 반들거린다
    if dust:
        col, w = sugar(m, col, *dust)
        r = m.mixf(w, r, 0.95)

    side_w = m.math('SUBTRACT', 1.0, face)
    height = m.math('ADD', m.math('ADD', m.math('MULTIPLY', fine, 0.2), m.math('MULTIPLY', g, 0.6)),
                    m.math('MULTIPLY', m.math('MULTIPLY', hole, side_w), -1.0))
    return m.out(color=col, rough=r, normal=m.bump(height, strength=0.45, distance=0.006))


# ── 흘러내리는 소스 ───────────────────────────────────────────────────────────

def _flow_path(cakes, th, gap=0.05, step=0.008, ground=0.4, plate=0.0):
    """맨 위 장 가운데 → 가장자리 → 더미 옆(골은 건너뜀) → 바닥. lib.with_normals 경로"""
    top = cakes[-1]
    i_eq = max(range(len(top.prof)), key=lambda i: top.prof[i][0])
    pts = [(r * top.rf(th), top.z0 + z + top.zf(th, r)) for r, z in reversed(top.prof[i_eq:])]
    env = lambda z: max(c.ext(th, z, top.cx, top.cy) for c in cakes)  # noqa: E731
    z_hold = cakes[0].z0 + cakes[0].H * 0.42  # 맨 아래 장 모서리 밑으로는 곧게 떨어진다(밑으로 말려 들지 않게)
    r_hold = env(z_hold)
    col, z = [], pts[-1][1] - step
    while z > 0.006:
        r = lib.bridged(env, z, gap)
        col.append([max(r, r_hold) if z < z_hold else r, z])
        z -= step
    for _ in range(2):  # 장 사이 계단을 누그러뜨린다
        rs = [c[0] for c in col]
        for i in range(1, len(col) - 1):
            col[i][0] = (rs[i - 1] + 2 * rs[i] + rs[i + 1]) / 4
    pts += [tuple(c) for c in col]
    r0 = pts[-1][0]
    zg = (lambda r: plate_z(plate, r) + 0.003) if plate else (lambda r: 0.004)  # noqa: E731
    n_g = 40 if plate else 10
    pts += [(r0 + 0.012 + ground * k / n_g, zg(r0 + 0.012 + ground * k / n_g)) for k in range(n_g + 1)]
    return lib.with_normals(pts)


def puddle(front, reach=0.03, back=0.08, wig=0.03, ph=0.0):
    """한쪽(front)으로 쏠려 부은 웅덩이 → pool(th, s_rim). 앞은 테를 reach 만큼 넘고, 뒤는 가운데에서 back 만큼만 간다.
    치우친 원이라 옆 · 뒤로는 구운 면이 넉넉히 남고, 테를 넘는 건 앞쪽 호뿐이다 — 줄기는 그 호 안에만 둔다.
    윗면을 다 덮으면 뚜껑을 씌운 것처럼 부자연스럽고, 가운데 덩이에서 가는 줄이 윗면을 가로지르면 거미 다리로 읽혔다"""
    def pool(th, s_rim):
        rho = (s_rim + reach + back) / 2
        e, a = rho - back, th - front
        edge = e * math.cos(a) + math.sqrt(max(rho * rho - (e * math.sin(a)) ** 2, 1e-6))
        # 가장자리는 잡음 세 옥타브로 울퉁불퉁하게 — 고른 사인 물결은 꽃잎 · 해파리 갓으로 읽혔다
        c, s_ = math.cos(a), math.sin(a)
        return edge + wig * (1.6 * lib.n3(1.1 * c, 1.1 * s_, 0.0, ph) + 0.9 * lib.n3(2.6 * c, 2.6 * s_, 0.0, ph + 7.0)
                             + 0.4 * lib.n3(6.0 * c, 6.0 * s_, 0.0, ph + 13.0))
    return pool


def _smin(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25


def sauce(name, cakes, pool, runs, mat, w=0.026, plate=0.0, thick=0.022, embed=0.005, ds=0.026, segs=48,
          lump=0.0, lump_scale=13.0, seed=0.0, riv=None, fillet=0.05, across=13, fine=0.008, **_):
    """고인 소스 + 줄기를 한 장으로 → [오브젝트]. pool = puddle(...) — (방위, 테 호 길이) → 고인 가장자리 호 길이.
    runs = [(방위, 턱 넘어 흐른 길이, 굵기 배율)].
    모양 = 거리장: 고인 데와 줄기(가는 줄 + 눈물방울 머리)를 부드러운 합집합으로 잇는다 — 줄기가 고인 데서
    오목하게 좁아지며 흘러나온다. 따로 지은 줄기를 겹쳐 놓으면 만나는 자리에 꺾인 홈이 서고 붙여 놓은 덩이로 읽혔다.
    두께 = 윤곽선까지 깊이로 정한다(가장자리가 둥글게 말린다). 소스가 없는 데는 표면 밑으로 묻힌다.
    정점 속성 thin(0 두꺼움 → 1 얇은 가장자리). 면은 한 겹(밑면 없음)."""
    top = cakes[-1]
    head = (riv or {}).get('head', 1.5)
    ew, r_eq = thick * 1.5, top.R
    # 테 = 표면이 45° 로 꺾여 내려가는 어깨. 웅덩이 모양은 puddle 이 테 기준으로 정한다
    s_rim = next(q[4] for q in _flow_path(cakes, 0.0, plate=plate) if q[2] > 0.7)
    over, pool = pool, lambda th: over(th, s_rim)  # noqa: E731

    rs = []  # (방위, 시작, 머리 가운데, 줄 반폭, 머리 반지름)
    for th, d, k in runs:
        path = _flow_path(cakes, th, plate=plate)
        s_gnd = next(q[4] for q in path if q[1] < 0.035 and q[4] > 0.1)
        s1, wr, hd = pool(th) + d, w * k, head
        if s1 > s_gnd - 0.05:  # 바닥에 닿으면 접시에 둥글게 퍼진다
            s1, hd = s_gnd + 0.07 + wr, head * 1.45
        else:
            while lib.at(path, s1)[3] < -0.1:  # 머리는 밑면(오버행)에서 못 멈춘다 → 바로 앞 턱까지 밀려간다
                s1 += 0.01
        s1 = min(s1, path[-1][4] - 0.02)
        L = wr * hd
        rs.append((th, pool(th) - 0.03, max(s1 - L, pool(th)), wr, L))

    def field(th, s):  # (거리: 안쪽 음수, 머리 부풂 0..1)
        d, bead = s - pool(th), 0.0
        for th0, s0, sc, wr, L in rs:
            q = min(max(s, s0), sc)
            ph = th0 * 7.3 + seed
            # 줄기는 살짝 휘며 내려간다(빵 겉의 요철) — 곧고 나란한 줄은 해파리 다리로 읽혔다
            x = r_eq * ((th - th0 + math.pi) % TAU - math.pi) - 0.4 * wr * math.sin(ph + (13.0 + 9.0 * math.sin(ph * 3.1)) * (q - s0)) \
                * min(1.0, (q - s0) / 0.05)
            if abs(x) > 0.3:
                continue
            u = min(1.0, 2.2 * (q - s0) / max(sc - s0, 1e-3))
            neck = wr * (1.3 - 0.7 * u * u * (3 - 2 * u))  # 뿌리는 넓고 내려가며 가는 목으로 졸아든다
            t = min(1.0, max(0.0, (q - (sc - 3.0 * L)) / (3.0 * L)))  # 머리 앞 3L 에 걸쳐 눈물방울로 굵어진다
            t = t * t * (3 - 2 * t)
            d = _smin(d, math.hypot(x, s - q) - (neck + (L - neck) * t), fillet)
            bead = max(bead, math.exp(-(math.hypot(x, s - sc) / (0.9 * L)) ** 2))
        return d, bead

    ths = [TAU * i / segs for i in range(segs)]
    for th0, _s0, _sc, _wr, L in rs:
        span = 1.7 * L / r_eq
        ths += [th0 + span * (2 * i / (across - 1) - 1) for i in range(across)]
    ths = sorted(t % TAU for t in ths)
    ths = [t for i, t in enumerate(ths) if i == 0 or t - ths[i - 1] > 0.006]
    n = len(ths)
    i_lip = max(range(len(top.prof)), key=lambda i: top.prof[i][0])
    n_top = len(top.prof) - i_lip  # 경로에서 윗면 구간의 점 수(턱 = 그 끝)

    bm = bmesh.new()
    thin_l, d_l = [0.0], [-1.0]
    pole = bm.verts.new((top.cx, top.cy, top.top + thick - embed))
    cols = []
    for th in ths:
        path = _flow_path(cakes, th, plate=plate)
        s_end, s_lip = path[-1][4], path[n_top - 1][4]
        scan = [fine * k for k in range(3, int(s_end / fine))]
        ins = [q for q in scan if field(th, q)[0] < 0.012]
        s_ext = ins[-1]
        ss = [ds * k for k in range(1, int(s_ext / ds) + 1) if field(th, ds * k)[0] < -ew]  # 속은 성기게
        ss += [q for q in ins if field(th, q)[0] > -ew * 1.2]  # 윤곽 둘레 · 줄기는 촘촘히
        ss += [s_lip + 0.013 * k for k in range(-5, 5) if 0 < s_lip + 0.013 * k < s_ext]  # 턱을 도는 자리
        ss = sorted(ss)
        ss = [q for i, q in enumerate(ss) if i == 0 or q - ss[i - 1] > 0.004]
        c, s_ = math.cos(th), math.sin(th)
        col = []
        for q in ss:
            r, z, nr, nz = lib.at(path, q)
            d, bead = field(th, q)
            dn = min(max(-d, 0.0) / ew, 1.0)
            t = thick * (1.0 - (1.0 - dn) ** 2) ** 0.5 * (1.0 + 0.45 * bead)
            x, y = top.cx + c * r, top.cy + s_ * r
            if lump:
                t *= 1.0 + lump * max(0.0, lib.n3(x * lump_scale, y * lump_scale, z * lump_scale, seed)) * dn
            e = t - embed
            col.append(bm.verts.new((x + c * nr * e, y + s_ * nr * e, max(z + nz * e, 0.001))))
            thin_l.append(min(1.0, max(0.0, 1.0 - t / thick)))
            d_l.append(d)
        cols.append((ss, col))
    for j in range(n):
        (sa, a), (sb, b) = cols[j], cols[(j + 1) % n]
        bm.faces.new((pole, a[0], b[0]))
        i = k = 0
        while i < len(a) - 1 or k < len(b) - 1:  # 지퍼: 호 길이가 덜 나간 쪽을 한 칸 올린다
            if k == len(b) - 1 or (i < len(a) - 1 and sa[i + 1] <= sb[k + 1]):
                bm.faces.new((a[i], a[i + 1], b[k]))
                i += 1
            else:
                bm.faces.new((a[i], b[k + 1], b[k]))
                k += 1
    bm.verts.index_update()
    # 소스 밖에 묻힌 면은 지운다: 장 사이 골 · 접시 위에서 드러나고, 비치는 재질이면 검은 유리로 보였다
    lay = bm.verts.layers.float.new('thin')  # 지우면 정점 번호가 밀린다 — 값은 정점에 실어 둔다
    for v in bm.verts:
        v[lay] = thin_l[v.index]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(d_l[v.index] > 0.004 for v in f.verts)], context='FACES')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    mid = Vector((top.cx, top.cy, top.top * 0.45))
    lib.orient_faces(ob, lambda c: c - mid)
    print(f'sauce {name}: {len(me.polygons)} tri')
    return [lib.assign(ob, mat)]


def sauce_mat(name, thick_col, thin_col, rough=0.3, lump_bump=0.0, edge=(0.35, 0.97), melt=None,
              glow=(1.0, 0.5, 0.15), side_col=None, depth=0.04):
    """두꺼운 데는 짙고 얇은 가장자리는 맑게(비치는 소스 흉내 — 재질은 불투명 한 장).
    side_col = 옆으로 흘러내린 얇은 데 색(밑의 크림색 속살이 비친 색). 윗면의 얇은 데(thin_col)는 구운 면이 비친 색.
    melt = (중심, 반지름, 색): 그 둘레로 녹아 번진 것(버터)을 섞는다"""
    m = lib.Mat(name)
    P = m.coords('Object')
    thin = m.smooth(m.attr('thin'), *edge)
    cloud = m.noise(P, scale=9.0, detail=2.0)
    if side_col:
        wall = m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', m.sep(m.lnrm())[2]), 0.30, 0.75))
        thin_col = m.mix(wall, thin_col, side_col)
        thick_col = m.mix(m.math('MULTIPLY', wall, 0.55), thick_col, side_col)  # 흘러내린 줄기는 얇아서 속살이 비친다
    col = m.mix(m.math('MULTIPLY', m.math('ADD', thin, m.math('MULTIPLY', m.math('SUBTRACT', cloud, 0.5), 0.25)), 1.0,
                       clamp=True), thick_col, thin_col)
    if melt:
        center, radius, mcol = melt
        d = m.math('ADD', m.vmath('DISTANCE', P, center), m.math('MULTIPLY', m.math('SUBTRACT', cloud, 0.5), radius * 0.5))
        col = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, radius * 0.55, radius)), 0.8), col, mcol)
    if side_col:  # 맑은 소스: 밑에 깔린 구운 면의 결이 비친다
        col = m.mix(m.math('MULTIPLY', m.smooth(grain(m, P), 0.25, 0.75), 0.45), col, thin_col)
    sss(m, 0.25 if side_col else 0.5, glow, depth)  # depth = 산란 깊이. 깊으면 얹은 흰 것(경단) 속까지 번져 곁에 뿌연 얼룩이 앉는다
    normal = None
    if lump_bump:
        normal = m.bump(m.noise(P, scale=34.0, detail=3.0), strength=lump_bump, distance=0.008)
    return m.out(color=col, rough=rough, normal=normal)


# ── 열매 ──────────────────────────────────────────────────────────────────────

def berry(name, b=0.058, segs=15, squash=0.9):
    """블루베리 — 살짝 눌린 공 + 꼭지 자리의 별 모양 왕관(국소 +Z)"""
    prof = [(0.0, -squash * b)]
    for deg in (-68, -46, -24, 0, 22, 42, 57):
        a = math.radians(deg)
        prof.append((b * math.cos(a), squash * b * math.sin(a)))
    z_rim = 0.78 * b
    prof += [(0.38 * b, 0.835 * b), (0.30 * b, 0.80 * b), (0.16 * b, 0.755 * b), (0.0, 0.75 * b)]
    return lib.lathe(name, prof, segs=segs,
                     rfn=lambda th, z: 1.0 + (0.10 * math.cos(5 * th) if z > z_rim else 0.0))


def berry_mat(name, b=0.058, skin=('#211D3D', '#3A4272', '#6C7DB0'), crown="#1B1733", dust=None):
    """짙은 남색 껍질 위에 뿌연 과분(블룸)이 얼룩으로 앉는다. 문질러진 데는 윤이 난다"""
    m = lib.Mat(name)
    P = m.lpos()
    x, y, z = m.sep(P)
    bloom = m.noise(P, scale=1.6 / b, detail=3.0, rough=0.6)
    col = m.ramp(bloom, [(0.30, skin[0]), (0.52, skin[1]), (0.74, skin[2])])
    rr = m.vmath('LENGTH', m.vmath('MULTIPLY', P, (1, 1, 0)))
    in_crown = m.math('MULTIPLY', m.smooth(z, 0.72 * b, 0.79 * b),
                      m.math('SUBTRACT', 1.0, m.smooth(rr, 0.24 * b, 0.34 * b)))
    col = m.mix(in_crown, col, crown)
    rough = m.mixf(m.smooth(bloom, 0.35, 0.65), 0.30, 0.62)
    if dust:
        col, w = sugar(m, col, *dust)
        rough = m.mixf(w, rough, 0.95)
    return m.out(color=col, rough=rough)


# ── 잎 ────────────────────────────────────────────────────────────────────────

def leaf(name, L=0.11, W=0.034, nu=10, nv=6, cup=0.35, arch=0.22):
    """민트 잎 — 국소 +X로 뻗는다(잎자루 = 원점). 가장자리는 잔 톱니, 가운데 맥은 골, 잎은 살짝 오목"""
    bm = bmesh.new()
    grid = []
    for i in range(nu + 1):
        u = i / nu
        w = W * math.sin(math.pi * u ** 0.75) ** 0.8 + 0.0015
        row = []
        for j in range(nv + 1):
            v = 2 * j / nv - 1
            saw = 1.0 + 0.10 * abs(v) ** 3 * math.sin(u * 46.0)
            y = v * w * saw
            z = cup * w * v * v - arch * L * u * u + 0.004 * math.sin(u * 23.0 + v * 4.0) * abs(v)
            z -= 0.10 * w * math.exp(-(v / 0.22) ** 2)
            row.append(bm.verts.new((u * L, y, z)))
        grid.append(row)
    for a, b in zip(grid, grid[1:]):
        for j in range(nv):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.orient_faces(ob, lambda c: Vector((0, 0, 1)))
    return ob


def leaf_mat(name, L=0.11, W=0.034, cols=('#2F6B27', '#4F9438', '#8DBF5E')):
    """짙은 초록 바탕 + 옅은 잎맥(가운데 맥 + 비스듬한 곁맥) + 올록볼록한 결"""
    m = lib.Mat(name)
    P = m.lpos()
    x, y, _ = m.sep(P)
    ay = m.math('ABSOLUTE', y)
    mid = m.math('SUBTRACT', 1.0, m.smooth(ay, 0.0, W * 0.10))
    side = m.math('SINE', m.math('MULTIPLY', m.math('SUBTRACT', x, m.math('MULTIPLY', ay, 1.3)), TAU * 5.5 / L))
    side = m.math('MULTIPLY', m.smooth(side, 0.86, 0.99), m.smooth(ay, 0.0, W * 0.2))
    vein = m.math('MAXIMUM', mid, m.math('MULTIPLY', side, 0.7))
    base = m.mix(m.noise(P, scale=30.0, detail=2.0), cols[0], cols[1])
    col = m.mix(m.math('MULTIPLY', vein, 0.8), base, cols[2])
    bump = m.bump(m.math('SUBTRACT', m.noise(P, scale=60.0, detail=1.0), vein), strength=0.5, distance=0.004)
    return m.out(color=col, rough=0.55, normal=bump)


def scatter_rot(rnd, up_bias=0.0):
    """아무 방향(오일러). up_bias 1이면 꼭지가 위를 보는 쪽으로 치우친다"""
    tilt = math.acos(max(-1.0, min(1.0, 1 - 2 * rnd.random() * (1 - up_bias * 0.75))))
    return (tilt * math.cos(a := rnd.uniform(0, TAU)), tilt * math.sin(a), rnd.uniform(0, TAU))


# ── 버터 조각 ─────────────────────────────────────────────────────────────────

def butter(name, a=0.13, h=0.046, seed=0.0):
    """네모 버터 한 조각 — 모서리가 둥글고, 아래쪽은 녹아서 치마처럼 퍼진다"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=6, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co * 2.0  # −1..1
        k = 6.0  # 초타원으로 모서리를 굴린다
        n = (abs(x) ** k + abs(y) ** k + abs(z) ** k) ** (1.0 / k)
        x, y, z = x / n, y / n, z / n
        melt = max(0.0, -z) ** 2.0  # 아래로 갈수록 퍼지고 내려앉는다
        sag = 1.0 + 0.16 * melt + 0.03 * lib.n3(x * 2.1, y * 2.1, z * 2.1, seed)
        v.co = Vector((x * a / 2 * sag, y * a / 2 * sag, (z + 1.0) * h / 2 * (1.0 - 0.10 * (1 - abs(z)) * abs(x * y))))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return lib.link(bpy.data.objects.new(name, me))


def butter_mat(name, h=0.046, cols=('#FBE9A2', '#F3D36E')):
    """윗부분은 뽀얗고 무광, 녹는 아랫부분은 짙고 윤이 난다"""
    m = lib.Mat(name)
    z = m.sep(m.lpos())[2]
    wet = m.math('SUBTRACT', 1.0, m.smooth(z, h * 0.10, h * 0.55))
    sss(m, 0.5, (1.0, 0.8, 0.4), 0.03)
    return m.out(color=m.mix(wet, cols[0], cols[1]), rough=m.mixf(wet, 0.55, 0.22))


# ── 벌집 ──────────────────────────────────────────────────────────────────────

def honeycomb(name, cols=9, rows=6, a=0.017, depth=0.012, slab=0.050, seed=0):
    """벌집 한 덩이 — 육각 방이 위아래 두 면에 뚫렸다(국소 XY에 눕는다, 두께 = Z).
    가장자리는 뜯긴 듯 들쭉날쭉. 정점 속성 cell(0 밀랍 벽 → 1 꿀 찬 바닥) · cap(1 = 밀랍으로 덮인 방)"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    cell_l, cap_l = [], []
    dx, dy = a * math.sqrt(3), a * 1.5

    def vert(co, cell, cap):
        cell_l.append(cell)
        cap_l.append(cap)
        return bm.verts.new(co)

    for r in range(rows):
        for c in range(cols):
            x = (c - (cols - 1) / 2 + (0.5 if r % 2 else 0.0)) * dx
            y = (r - (rows - 1) / 2) * dy
            # 뜯긴 윤곽: 타원 + 노이즈 밖의 방은 버린다
            if (x / (cols * dx * 0.5)) ** 2 + (y / (rows * dy * 0.52)) ** 2 > 0.80 + 0.35 * lib.n3(x * 9, y * 9, 0, seed):
                continue
            capped = rnd.random() < 0.22
            dep = 0.0015 if capped else depth * rnd.uniform(0.75, 1.0)
            hexa = [(math.cos(TAU * k / 6 + TAU / 12), math.sin(TAU * k / 6 + TAU / 12)) for k in range(6)]
            for sgn in (1.0, -1.0):
                zt = sgn * slab / 2
                o = [vert((x + hx * a, y + hy * a, zt), 0.0, 0.0) for hx, hy in hexa]
                # 밀랍 벽은 얇고 방은 깊다 — 벽이 두껍고 얕으면 플라스틱 격자 장난감으로 읽혔다
                i = [vert((x + hx * a * 0.90, y + hy * a * 0.90, zt), 0.0, float(capped)) for hx, hy in hexa]
                f = [vert((x + hx * a * 0.80, y + hy * a * 0.80, zt - sgn * dep), 1.0, float(capped)) for hx, hy in hexa]
                ce = vert((x, y, zt - sgn * dep * (0.8 if capped else 1.15)), 1.0, float(capped))
                for k in range(6):
                    j = (k + 1) % 6
                    for quad in ((o[k], o[j], i[j], i[k]), (i[k], i[j], f[j], f[k])):
                        bm.faces.new(quad if sgn > 0 else quad[::-1])
                    bm.faces.new((f[k], f[j], ce) if sgn > 0 else (ce, f[j], f[k]))
                if sgn > 0:
                    top_ring = o
            for k in range(6):  # 옆벽(이웃 방에 가리는 벽도 그냥 둔다 — 방 수가 적다)
                j = (k + 1) % 6
                bm.faces.new((top_ring[j], top_ring[k], o[k], o[j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.point_attr(ob, 'cell', cell_l)
    lib.point_attr(ob, 'cap', cap_l)
    return ob


def comb_mat(name, wax=('#F8E29A', '#EBC258'), honey=('#D29A12', '#A87206')):
    """밀랍 벽은 뽀얀 노랑 · 무광, 방 바닥은 꿀이 차서 짙은 호박색 · 윤기. 덮인 방은 밀랍색 뚜껑"""
    m = lib.Mat(name)
    P = m.lpos()
    cell = m.math('MULTIPLY', m.smooth(m.attr('cell'), 0.25, 0.75), m.math('SUBTRACT', 1.0, m.attr('cap')))
    n = m.noise(P, scale=40.0, detail=2.0)
    col = m.mix(cell, m.mix(n, wax[0], wax[1]), m.mix(n, honey[0], honey[1]))
    return m.out(color=col, rough=m.mixf(cell, 0.6, 0.2))


# ── 짜 올린 크림 ──────────────────────────────────────────────────────────────

def rosette(name, r0=0.105, height=0.21, tiers=3.2, tube=0.034, ridges=3, segs=56, rings=56, soft=0.0):
    """별 깍지로 짜 올린 휘핑크림 — 원뿔을 나선으로 부풀린다(감긴 줄 하나 + 줄을 따라 도는 깍지 골).
    국소 원점 = 바닥 가운데. 곡선 관(별 단면을 나선에 태움)은 날개처럼 꼬여 리본으로 읽혔다.
    soft = 손으로 짠 맛: 줄 굵기가 고르지 않고, 몸이 한쪽으로 기울고, 끝이 꺾여 늘어진다.
    0 이면 자로 잰 소프트아이스크림 원뿔 — 인위적으로 읽혔다.
    정점 속성 groove(0 마루 → 1 골)."""
    pitch = height / tiers

    def base(z):
        t = min(1.0, max(0.0, z / height))
        return r0 * (1.0 - t ** 1.25) ** 0.85 + 0.002

    def shape(th, z):
        """(줄의 볼록 0..1, 깍지 골 −1..1) — 위상 = 방위 − 높이(한 층에 한 바퀴)"""
        ph = (th / TAU - z / pitch) % 1.0
        coil = (1.0 - (2.0 * ph - 1.0) ** 2) ** 0.5
        return coil, math.cos(TAU * ridges * ph) * coil

    def amp(z):  # 위로 갈수록 줄이 가늘어진다
        return tube * (1.0 - 0.75 * min(1.0, z / height) ** 1.4)

    def rfn(th, z):
        b = base(z)
        coil, star = shape(th, z)
        a = amp(z) * (1.0 + 0.35 * soft * lib.n3(math.cos(th) * 1.5, math.sin(th) * 1.5, z * 9.0, 5.0))
        return (b + a * (coil - 0.35 + 0.2 * star)) / b

    zs = [height * (k / rings) ** 0.95 for k in range(rings + 1)]
    prof = [(0.0, 0.0)] + [(base(z), z) for z in zs[:-1]] + [(0.0, height + tube * 0.5)]
    ob = lib.lathe(name, prof, segs=segs, rfn=rfn)
    groove = []
    for v in ob.data.vertices:
        coil, star = shape(math.atan2(v.co.y, v.co.x), v.co.z)
        groove.append(min(1.0, max(0.0, 1.0 - coil) * 1.2 + 0.25 * (0.5 - 0.5 * star)))
    lib.point_attr(ob, 'groove', groove)
    if soft:
        for v in ob.data.vertices:
            t = min(1.0, v.co.z / height)
            k = max(0.0, (t - 0.6) / 0.4)  # 끝 40% 가 옆으로 꺾이며 처진다
            wob = 0.014 * soft * min(1.0, t * 3.0)
            v.co.x += soft * height * (0.10 * t ** 1.5 + 0.24 * k * k) + wob * lib.n3(0.0, 0.0, v.co.z * 14.0, 3.0)
            v.co.y += wob * lib.n3(5.0, 0.0, v.co.z * 14.0, 3.0)
            v.co.z -= soft * height * 0.17 * k * k
    return ob


def cream_mat(name, cols=('#FFFAF0', '#F3E6CC'), dust=None):
    """휘핑크림 — 따뜻한 흰색, 골은 조금 짙게(굽기 AO가 더한다)"""
    m = lib.Mat(name)
    P = m.coords('Object')
    col = m.mix(m.noise(P, scale=14.0, detail=2.0), cols[0], cols[1])
    # 골(오목한 데)을 조금 짙게 — 흰 크림은 앱의 고른 빛에서 깍지 골이 사라진다
    col = m.mix(m.math('MULTIPLY', m.smooth(m.attr('groove'), 0.25, 0.95), 0.4), col, '#E8D8BA')
    rough = 0.6
    sss(m, 0.4, (1.0, 0.9, 0.8), 0.03)
    if dust:
        col, w = sugar(m, col, *dust)
        rough = m.mixf(w, 0.6, 0.95)
    return m.out(color=col, rough=rough)


# ── 접시 · 얹는 것 ────────────────────────────────────────────────────────────

PLATE_H = 0.030  # 접시 굽 높이. 우묵한 바닥이 z=0 이라 케이크 수치를 그대로 쓰고, 다 지은 뒤 lift 로 올린다


_PLATE = ((0.0, 0.0), (0.60, 0.0), (0.84, 0.003), (0.93, 0.014), (0.985, 0.031))  # 접시 윗면 (r/R, z)


def plate_z(R, r):
    """반지름 R 접시의 윗면 높이(lift 전 좌표 — 우묵한 바닥이 0)"""
    u = r / R
    for (u0, z0), (u1, z1) in zip(_PLATE, _PLATE[1:]):
        if u <= u1:
            return z0 + (z1 - z0) * max(0.0, (u - u0) / (u1 - u0))
    return _PLATE[-1][1]


def plate(name, R, segs=44):
    """얕은 접시 — 바닥은 평평하고 가장자리만 살짝 들린다"""
    p = [(0.0, -0.030), (R * 0.52, -0.030), (R * 0.56, -0.024), (R * 0.62, -0.019), (R * 0.90, -0.006),
         (R * 0.985, 0.020), (R, 0.026)] + [(R * u, z) for u, z in reversed(_PLATE)]
    return lib.lathe(name, p, segs=segs)


def plate_mat(name, col='#FAF6EE', rough=0.42):
    """유약 바른 도자기 — 색은 메뉴마다(소스 색을 받쳐 주는 쪽), 유약이 고인 얼룩만 옅게"""
    m = lib.Mat(name)
    return m.out(color=m.mix(m.math('MULTIPLY', m.noise(m.lpos(), scale=6.0, detail=2.0), 0.12), col, '#8A8478'), rough=rough)


def lift(parts, dz=PLATE_H):
    for ob in parts:
        ob.location.z += dz
    return parts


def anko_mat(name='anko', cols=('#3A1418', '#5E2226', '#803634'), bump=0.7):
    """통팥 소 — 뭉개진 알이 엉긴 덩어리. 알 크기 칸마다 봉긋하고 칸 사이 골은 짙은 앙금.
    고운 노이즈만 넣은 판은 매끈한 자주색 판에 구슬(팥알)이 박힌 것으로 읽혔다"""
    m = lib.Mat(name)
    A = m.lpos()
    cell = m.voronoi(A, scale=34.0)  # 칸 ≈ 팥알 한 알(0.03)
    grit = m.noise(A, scale=90.0, detail=2.0, rough=0.7)
    col = m.ramp(m.noise(A, scale=13.0, detail=2.0), [(0.3, cols[0]), (0.55, cols[1]), (0.8, cols[2])])
    gap = m.smooth(cell, 0.20, 0.44)
    col = m.mix(m.math('MULTIPLY', gap, 0.6), col, '#2A0C10')
    height = m.math('ADD', m.math('SUBTRACT', 1.0, m.smooth(cell, 0.0, 0.46)), m.math('MULTIPLY', grit, 0.25))
    return m.out(color=col, rough=m.mixf(gap, 0.56, 0.78), normal=m.bump(height, strength=bump, distance=0.012))


def bean_mat(name='bean'):
    """삶은 통팥 — 윤은 나되 구슬처럼 번쩍이지 않는다(거칠기 0.26은 쇠구슬로 읽혔다)"""
    m = lib.Mat(name)
    return m.out(color=m.mix(m.noise(m.lpos(), scale=40.0), '#4A1418', '#7A2A2A'), rough=0.42)


def bean(name):
    """길쭉한 팥알(긴 축 = 국소 Z, 원점 = 가운데)"""
    ob = lib.lathe(name, lib.superellipse_profile(0.018, 0.046, n=2.1, steps=8), segs=10)
    ob.data.transform(Matrix.Translation((0.0, 0.0, -0.023)))
    return ob


def scoop(name, r=0.085, h=0.13, seed=0.0):
    """숟가락으로 뜬 한 덩이 — 울퉁불퉁한 알(아래 절반은 묻어서 쓴다)"""
    return lib.lathe(name, lib.superellipse_profile(r, h, n=2.0, steps=14), segs=28,
                     rfn=lambda th, z: 1.0 + 0.10 * lib.n3(3 * math.cos(th), 3 * math.sin(th), z * 30, seed)
                     + 0.05 * lib.n3(9 * math.cos(th), 9 * math.sin(th), z * 80, seed + 1.0))


def dango(name, r=0.05):
    """경단 한 알 — 살짝 눌린 공"""
    return lib.lathe(name, lib.superellipse_profile(r, r * 1.5, n=2.2, steps=10), segs=20)


def dango_mat(name='dango'):
    m = lib.Mat(name)
    sss(m, 0.5, (1.0, 0.9, 0.8), 0.03)
    return m.out(color=m.mix(m.noise(m.lpos(), scale=20.0), '#FCF8EF', '#F1E9D8'), rough=0.3)
