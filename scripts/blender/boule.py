"""둥근 불(boule) 계열 공용 — campagne · campagne--strawberry-jam · wholewheat (docs/BREADS.md §Blender).

단위: 지름 1(R 0.5), 바닥 z=0, 정면 = Blender −Y.
형상 = 초타원 단면(위·아래 반쪽 따로) 회전체를 촘촘히 짓고 → 변위(칼집·고리 단) → decimate.
같은 식을 재질 노드에도 쓴다(Shape.f_nodes · Score.u_nodes) — 형상과 무늬가 어긋나지 않게.
"""
import math

from lib import n3


class Shape:
    """단면 = 중심 높이 zc 위는 (r/R)^nt + ((z−zc)/Ht)^nt = 1, 아래는 nb·Hb. z<0은 잘라 납작한 바닥"""

    def __init__(self, R=0.5, zc=0.15, Ht=0.35, Hb=0.27, nt=2.2, nb=2.5):
        self.R, self.zc, self.Ht, self.Hb, self.nt, self.nb = R, zc, Ht, Hb, nt, nb
        self.H = zc + Ht

    def profile(self, n=150, base_weight=0.3):
        """(r, z) 아래 극 → 위 극, 호 길이 고르게 n점(바닥은 base_weight 배로 성기게)"""
        curve = []
        for k in range(4001):
            psi = -math.pi / 2 + math.pi * k / 4000
            c, s = math.cos(psi), math.sin(psi)
            nn, h = (self.nt, self.Ht) if s >= 0 else (self.nb, self.Hb)
            z = self.zc + math.copysign(h * abs(s) ** (2 / nn), s)
            if z >= 0:
                curve.append((self.R * abs(c) ** (2 / nn), z))
        r0 = curve[0][0]
        pts = [(r0 * k / 40, 0.0) for k in range(40)] + curve
        acc = [0.0]
        for (r_a, z_a), (r_b, z_b) in zip(pts, pts[1:]):
            w = base_weight if z_a == 0 and z_b == 0 else 1.0
            acc.append(acc[-1] + w * math.hypot(r_b - r_a, z_b - z_a))
        out, j = [], 0
        for i in range(n):
            target = acc[-1] * i / (n - 1)
            while j < len(acc) - 2 and acc[j + 1] < target:
                j += 1
            t = (target - acc[j]) / max(1e-12, acc[j + 1] - acc[j])
            out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t))
        out[0], out[-1] = (0.0, 0.0), (0.0, self.H)
        return out

    def ring_angle(self, m, p):
        """고리 각(노드) — 정규화 단면에서 정수리 0 → 적도 π/2"""
        px = m.sep(p)
        r = m.vmath('LENGTH', m.combine(px[0], px[1], 0.0))
        return m.math('ARCTAN2', m.math('DIVIDE', r, self.R),
                      m.math('DIVIDE', m.math('SUBTRACT', px[2], self.zc), self.Ht))

    def f_nodes(self, m, p):
        """정규화 반지름(노드) — 겉면 1, 속 <1. 단면 속살의 껍질 테 두께를 잴 때"""
        px = m.sep(p)
        r = m.math('DIVIDE', m.vmath('LENGTH', m.combine(px[0], px[1], 0.0)), self.R)
        dz = m.math('SUBTRACT', px[2], self.zc)

        def half(n, h, sign):
            v = m.math('DIVIDE', m.math('MAXIMUM', m.math('MULTIPLY', dz, sign), 0.0), h)
            return m.math('POWER', m.math('ADD', m.math('POWER', r, n), m.math('POWER', v, n)), 1 / n)

        up = m.math('GREATER_THAN', dz, 0.0)
        return m.mixf(up, half(self.nb, self.Hb, -1.0), half(self.nt, self.Ht, 1.0))


class Score:
    """칼집 — 중심을 지나는 직선들(세계 방위 bearings). 평면 좌표 식 하나를 변위와 재질 노드가 함께 쓴다.
    선마다 t = 선 방향 거리, s = 옆 거리, 반폭 w(t)는 잎 모양(가운데 w0·중간 최대·끝 0), u = |s|/w.
    u<1 = 벌어진 홈(속살), 1<u<1+lip = 귀(껍질 입술이 들린다 — side>0 쪽이 더 높다)"""

    def __init__(self, bearings, L=0.46, W=0.075, D=0.10, E=0.032, lip=0.6, w0=0.35, sharp=0.7, low_side=0.45,
                 z0=0.20, z1=0.27):
        self.bearings, self.L, self.W, self.D, self.E = bearings, L, W, D, E
        self.lip, self.w0, self.sharp, self.low_side = lip, w0, sharp, low_side
        self.z0, self.z1 = z0, z1  # 이 높이 아래는 칼집 없음(평면 식이라 바닥에도 X가 찍혔다, r2)

    def _w(self, q):
        return self.W * (max(0.0, math.sin(math.pi * q)) ** self.sharp + self.w0 * (1 - q))

    def disp(self, co):
        cut, ear = None, 0.0
        for b in self.bearings:
            dx, dy = math.cos(b), math.sin(b)
            t, s = abs(co.x * dx + co.y * dy), -co.x * dy + co.y * dx
            q = min(t / self.L, 1.0)
            w = self._w(q)
            if w < 1e-4:
                continue
            # 끝으로 갈수록 얕게, 홈 → 귀는 이어지게(끊긴 벼랑은 decimate 뒤 팔 끝이 가시로 튀었다, r3)
            u, k = abs(s) / w, min(1.0, 1.6 * w / self.W) ** 0.7
            side = 1.0 if s > 0 else self.low_side
            # 홈 = u<0.7 안으로 꺼진 속살(바닥 u<0.35 평평), 귀 = u≈0.9 둔덕(껍질이 말려 오른 입술).
            # 귀 안쪽 비탈까지 속살색을 칠한 판(u<1)은 솟은 연노랑 꽃잎으로 읽혔다(r8 검수) — 색 경계 = 높이 0 선
            crest = self.E * k * side * math.exp(-((u - 0.9) / 0.28) ** 2)
            if u < 0.7:
                x = min(1.0, max(0.0, (u - 0.35) / 0.35))
                g = -self.D * k * (1 - x * x * (3 - 2 * x)) + crest
                cut = g if cut is None else min(cut, g)
            else:
                ear = max(ear, crest)
        k = min(1.0, max(0.0, (co.z - self.z0) / (self.z1 - self.z0)))
        return k * (cut if cut is not None else ear)

    def u_nodes(self, m, p):
        """선마다 (u, s) 노드"""
        out = []
        for b in self.bearings:
            dx, dy = math.cos(b), math.sin(b)
            t = m.math('ABSOLUTE', m.vmath('DOT_PRODUCT', p, (dx, dy, 0.0)))
            s = m.vmath('DOT_PRODUCT', p, (-dy, dx, 0.0))
            q = m.math('MINIMUM', m.math('DIVIDE', t, self.L), 1.0)
            leaf = m.math('POWER', m.math('MAXIMUM', m.math('SINE', m.math('MULTIPLY', q, math.pi)), 0.0), self.sharp)
            w = m.math('MULTIPLY', m.math('ADD', leaf, m.math('MULTIPLY', m.math('SUBTRACT', 1.0, q), self.w0)), self.W)
            out.append((m.math('DIVIDE', m.math('ABSOLUTE', s), m.math('MAXIMUM', w, 1e-4)), s))
        return out

    def masks(self, m, p):
        """(홈 속살 1, 귀 1, 홈 안 u, 그을린 입술 1) 노드 — disp와 같은 경계(u 0.6 = 높이 0)"""
        cut, ear, umin = None, None, None
        for u, s in self.u_nodes(m, p):
            c = m.math('SUBTRACT', 1.0, m.smooth(u, 0.52, 0.64))
            side = m.mixf(m.math('GREATER_THAN', s, 0.0), self.low_side, 1.0)
            e = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(u, 0.85, 1.45)), side)
            cut = c if cut is None else m.math('MAXIMUM', cut, c)
            ear = e if ear is None else m.math('MAXIMUM', ear, e)
            umin = u if umin is None else m.math('MINIMUM', umin, u)
        top = m.smooth(m.sep(p)[2], self.z0, self.z1)
        lip = m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(umin, 0.56, 0.66), m.math('SUBTRACT', 1.0, m.smooth(umin, 0.70, 0.86))), top)
        cut = m.math('MULTIPLY', cut, top)
        return cut, m.math('MULTIPLY', m.math('MULTIPLY', ear, m.math('SUBTRACT', 1.0, cut)), top), umin, lip


def boule_mesh(lib, name, shape, disp=None, segs=320, n=150, target=13000, wobble=0.010, seed=0.0):
    """촘촘한 회전체 → 둘레 요철 → 법선 변위(disp(co)) → decimate(목표 삼각형)"""
    rfn = (lambda th, z: 1 + wobble * n3(math.cos(th) * 1.3, math.sin(th) * 1.3, z * 2.5, seed)
           + 0.4 * wobble * math.sin(3 * th + seed))
    ob = lib.lathe(name, shape.profile(n), segs=segs, rfn=rfn)
    if disp is not None:
        lib.displace_normal(ob, disp)
    lib.decimate(ob, min(1.0, target / max(1, lib.tri_count(ob))))
    return ob


def drop_base(lib, ob):
    """납작한 바닥 면을 지운다(카메라가 늘 위에서 본다 — 텍스처 자리 절약, 팬케이크 맨 아래 장과 같은 정책)"""
    lib.delete_faces(ob, lambda c, n: n.z < -0.9 and c.z < 0.01)


CRUST_PAL = dict(ramp=('#7E3204', '#A04C0A', '#BC6014'), ring='#682A04', low='#561F02', base='#6A3412',
                 ear='#B8661E', flour='#E8D3AE', lip='#4A1C04', inner=('#F6CC80', '#ECAC4E', '#C47228', '#7A3A0E'),
                 pore='#B8732E')


def campagne_crust(lib, shape, score, name='crust', pal=None, flour_a=0.85, extra=None):
    """깜빠뉴 껍질 — 진한 갈색 + 바네통 동심 고리(볼록한 고리에 밀가루) + X 칼집(홈 = 노릇한 속살, 테 = 귀).
    pal = CRUST_PAL 덮어쓰기(반죽색 변형) · flour_a = 고리 밀가루 농도(0 = 없음: 짙은 껍질 위 흰 가루는 곰팡이) ·
    extra(m, col, rough, p, nz, cut) → (col, rough) 덧입힘(글레이즈 · 씨 코팅 · 기름 윤기)"""
    c = dict(CRUST_PAL, **(pal or {}))
    m = lib.Mat(name)
    p = m.lpos()
    px = m.sep(p)
    nz = m.sep(m.lnrm())[2]
    cut, ear, u, lip = score.masks(m, p)
    blot = m.noise(p, scale=5.5, detail=6, rough=0.6, distortion=0.3)

    # 바네통 고리 — 정수리부터, 손으로 감은 듯 흔들림. 폭·농도를 노이즈로 끊고 군데군데 비운다.
    # 고른 흰 줄 + 맨 주황 띠로 끝난 판(r8)은 줄무늬 공으로 읽혔다(검수) — 아래로 갈수록 흐려지며 이어진다
    ang = m.math('ADD', shape.ring_angle(m, p), m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=3, detail=2), 0.5), 0.06))
    band = m.math('ADD', 0.5, m.math('MULTIPLY', m.math('COSINE', m.math('MULTIPLY', ang, 2 * math.pi / 0.13)), 0.5))
    zone = m.math('SUBTRACT', 1.0, m.smooth(ang, 1.0, 1.62))
    wid = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=6, detail=2), 0.5), 0.5)  # 띠 폭 흔들림
    grain = m.smooth(m.noise(p, scale=75, detail=2), 0.36, 0.56)
    patch = m.smooth(m.noise(p, scale=2.6, detail=3), 0.22, 0.55)  # 군데군데 빈 데
    flour = m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(m.math('SUBTRACT', band, wid), 0.48, 0.76), zone),
                   m.math('MULTIPLY', grain, patch))
    flour = m.math('MULTIPLY', flour, m.math('SUBTRACT', 1.0, cut), clamp=True)

    # 껍질 — 레퍼런스 실측 #8E4B1F~#A95821(위) · #713510(아래). 노출(위 ≈0.93×)만큼 밝혀 잡는다
    # r2·r7 렌더는 분홍 갈색(방 반사, 실측 #92522C) — 파랑을 빼 채도를 올리고 거칠기를 높였다
    crust = m.ramp(blot, [(0.30, c['ramp'][0]), (0.48, c['ramp'][1]), (0.66, c['ramp'][2])])
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, band), m.math('MULTIPLY', zone, 0.15)), crust, c['ring'])
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(px[2], 0.03, 0.22)), 0.55), crust, c['low'])
    crust = m.mix(m.smooth(m.math('MULTIPLY', nz, -1.0), 0.4, 0.8), crust, c['base'])  # 바닥
    crust = m.mix(m.math('MULTIPLY', ear, 0.4), crust, c['ear'])  # 귀 윗면 = 금갈색 껍질
    if flour_a:
        crust = m.mix(m.math('MULTIPLY', flour, flour_a), crust, c['flour'])  # 대비 한 단 낮춤(0.85)
    crust = m.mix(m.math('MULTIPLY', lip, 0.6), crust, c['lip'])  # 그을린 입술
    # 홈 속살 — 꺼진 바닥은 노릇, 입술 밑으로 갈수록 짙게(u 0.6 = 입술)
    inner = m.ramp(u, [(0.0, c['inner'][0]), (0.38, c['inner'][1]), (0.54, c['inner'][2]), (0.62, c['inner'][3])])
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 1.6)), scale=55), 0.06, 0.14))
    inner = m.mix(m.math('MULTIPLY', pore, 0.45), inner, c['pore'])
    col = m.mix(cut, crust, inner)

    rough = m.mixf(cut, m.mixf(flour, 0.88, 0.94), 0.86)
    if extra:
        col, rough = extra(m, col, rough, p, nz, cut)
    h = m.math('MULTIPLY', m.math('MULTIPLY', band, zone), 0.6)
    h = m.math('ADD', h, m.math('MULTIPLY', m.noise(p, scale=90, detail=3), 0.35))
    h = m.math('ADD', h, m.math('MULTIPLY', flour, 0.25))
    h = m.math('SUBTRACT', h, m.math('MULTIPLY', m.math('MULTIPLY', pore, cut), 0.6))
    return m.out(col, rough, m.bump(h, strength=0.35, distance=0.004))
