"""딸기 단면 그림 — 반쪽 딸기 단면(국소 x · z 평면)에 입힐 색을 numpy로 그린다. bpy를 안 써서 미리보기도 같은 코드.

세로로 가른 딸기(해부도: 꽃턱 = 겉살 · 관다발 고리 · 심, 씨마다 관다발이 닿는다):
껍질 밑 붉은 테(겉살, 두께 거의 고름) → 분홍 → 옅은 속살(테 안쪽 하트) + 가운데 하얀 심(꼭지 쪽이 넓은 물방울,
끝 쪽엔 닿지 않아 끝은 통째로 붉다) + 심에서 껍질 씨까지 부챗살로 뻗는 옅은 관다발 줄.
2026-11-14 사용자 「딸기 단면 디테일」. 타일 두 장(가로) = 덜 익은 판 · 더 익은 판 — 셰이더가 반쪽마다
타일 · 좌우 뒤집기를 고른다. 첫 판의 곧은 흰 줄(법선을 따라 걸은 줄)은 서로 엇갈려 자로 그은 빗금으로 읽혔다:
줄은 윤곽 위치 순서대로 심 높이에 이어(엇갈림 없음) 껍질에 수직으로 닿게 휘고, 가장자리는 부드럽게 · 진하기는 띄엄띄엄.
"""
import numpy as np

X0, X1, Z0, Z1 = -0.13, 0.13, -0.005, 0.295  # 타일 한 장이 덮는 국소 범위(윤곽 최대 반폭 0.123 · 높이 0.289)

SKIN = '#A30F25'  # 단면 테두리 껍질 선
RED, RED2 = '#C8142E', '#D82840'  # 겉살 바깥 · 안쪽
PINK, FLESH, PALE, WHITE = '#E9586D', '#F08A99', '#F6BCC4', '#FFF3F3'  # 테 안쪽 경계 → 속살 → 심 둘레 → 심
VEIN = '#FBE1E5'
SEED, SEED_RIM = '#DDB050', '#97591F'


def _rgb(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _lerp(col, c, w):
    c = _rgb(c) if isinstance(c, str) else c
    return col + (c - col) * w[..., None]


def _noise(X, Z, fx, fz, rng):
    """값 잡음 0..1 — 격자 난수를 smoothstep 보간(fx · fz = 1단위당 칸 수)"""
    gx, gz = (X - X0) * fx, (Z - Z0) * fz
    lat = rng.random((int(gz.max()) + 2, int(gx.max()) + 2))
    ix, iz = gx.astype(int), gz.astype(int)
    tx, tz = gx - ix, gz - iz
    tx, tz = tx * tx * (3 - 2 * tx), tz * tz * (3 - 2 * tz)
    a, b = lat[iz, ix], lat[iz, ix + 1]
    c, d = lat[iz + 1, ix], lat[iz + 1, ix + 1]
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz


def _fbm(X, Z, f, rng, octaves=3):
    s = sum(0.5 ** o * _noise(X, Z, f * 2 ** o, f * 2 ** o, rng) for o in range(octaves))
    return s / sum(0.5 ** o for o in range(octaves))


def _outline(prof):
    """반쪽 단면 윤곽(닫힌 다각형, 반시계) — 오른쪽(+x) 끝 → 꼭지, 왼쪽은 거울로 내려온다"""
    right = [(r, z) for r, z in prof]
    left = [(-r, z) for r, z in reversed(prof)][1:-1]
    return np.array(right + left)


def _sdf(X, Z, poly):
    """윤곽까지 거리 — 안쪽 +"""
    d = np.full(X.shape, np.inf)
    inside = np.zeros(X.shape, bool)
    for (ax, az), (bx, bz) in zip(poly, np.roll(poly, -1, axis=0)):
        vx, vz = bx - ax, bz - az
        t = np.clip(((X - ax) * vx + (Z - az) * vz) / (vx * vx + vz * vz), 0, 1)
        d = np.minimum(d, np.hypot(X - ax - t * vx, Z - az - t * vz))
        if az != bz:
            inside ^= ((az > Z) != (bz > Z)) & (X < ax + vx * (Z - az) / vz)
    return np.where(inside, d, -d)


def _pith_w(z, ripe):
    """심 반폭(z) — 끝 쪽 zb에서 뾰족하게 시작해 위로 갈수록 넓고, 꼭지 바로 밑에서 살짝 좁아졌다 흉터로 퍼진다"""
    zb, zt = 0.085 + 0.012 * ripe, 0.286
    s = np.clip((z - zb) / (zt - zb), 0, 1)
    return (0.027 - 0.005 * ripe) * s ** 0.55 * (1 - 0.25 * _ss(0.75, 1.0, s)) + 0.01 * _ss(0.93, 1.0, s)


def _veins(prof, ripe, rng):
    """관다발 줄 [(점 (k, 2) 껍질 → 심, 굵기, 진하기, 씨 여부)]. 윤곽 위치 f(끝 0 → 꼭지 1)를 심 높이에 차례로
    잇는다(엇갈림 없음). 껍질 쪽은 안쪽 법선 방향으로 들어가 껍질에 수직으로 닿고, 끝 쪽 줄은 심 아래 축으로 모인다"""
    pr = np.array(prof, float)
    seg = np.diff(pr, axis=0)
    cum = np.concatenate([[0], np.cumsum(np.hypot(seg[:, 0], seg[:, 1]))])
    out = []
    for side in (1, -1):
        for main, (lo, hi, n) in ((True, (0.07, 0.93, 10)), (False, (0.11, 0.9, 9))):
            for f in np.linspace(lo, hi, n) + rng.uniform(-0.3, 0.3, n) * (hi - lo) / n:
                s = f * cum[-1]
                i = min(int(np.searchsorted(cum, s)) - 1, len(seg) - 1)
                e = pr[i] + seg[i] * (s - cum[i]) / (cum[i + 1] - cum[i])
                tx, tz = seg[i] / np.hypot(*seg[i])
                E, nrm = np.array([e[0] * side, e[1]]), np.array([-tz * side, tx])  # 안쪽 법선(반시계 윤곽의 왼쪽)
                zr = 0.03 + 0.245 * f ** 1.15
                S = np.array([side * float(_pith_w(zr, ripe)) * 0.8, zr])
                L = np.hypot(*(S - E))
                C = E + nrm * L * 0.45
                t = np.linspace(0, 1, 25)[:, None]
                pts = (1 - t) ** 2 * E + 2 * (1 - t) * t * C + t ** 2 * S
                tang = np.gradient(pts, axis=0)
                perp = np.stack([-tang[:, 1], tang[:, 0]], 1) / np.maximum(np.hypot(*tang.T), 1e-9)[:, None]
                ph = rng.uniform(0, 6.3)
                pts += perp * (0.0012 * np.sin(6.3 * (t * rng.uniform(1.0, 1.8)) + ph))  # 살짝 굽이친다
                w = (0.0017 if main else 0.0009) * rng.uniform(0.8, 1.2)
                a = (0.75 if main else 0.42) * rng.uniform(0.75, 1.0)
                out.append((pts, w, a, main and rng.random() < 0.45))
    return out


def _tile(prof, n, rng, ripe):
    xs = X0 + (np.arange(n) + 0.5) * (X1 - X0) / n
    zs = Z0 + (np.arange(n) + 0.5) * (Z1 - Z0) / n
    X, Z = np.meshgrid(xs, zs)  # 행 = z(아래 → 위, Blender 픽셀 순서)
    d = _sdf(X, Z, _outline(prof))
    rd = d + 0.009 * (_fbm(X, Z, 70, rng) - 0.5)  # 붉은 테 안쪽 경계는 고르지 않다
    zone = _ss(0.03, 0.12, Z)  # 끝 쪽은 통째로 붉다
    t_red = 0.030 + 0.008 * ripe

    col = np.broadcast_to(_rgb(RED), X.shape + (3,)).copy()
    col = _lerp(col, RED2, _ss(0.003, 0.014, rd))
    col = _lerp(col, PINK, _ss(t_red - 0.008, t_red + 0.004, rd) * (0.5 + 0.5 * zone))
    col = _lerp(col, FLESH, _ss(t_red, t_red + 0.014, rd) * zone)
    w = _pith_w(Z, ripe) * (1 + 0.25 * (_fbm(X, Z, 45, rng) - 0.5))
    q = np.abs(X) / np.maximum(w, 1e-5)
    has = (w > 2e-4) & (d > 0)
    col = _lerp(col, PALE, (1 - _ss(1.3, 3.6, q)) * _ss(t_red, t_red + 0.014, rd) * has)  # 심 쪽으로 옅어진다
    col *= (0.975 + 0.05 * _fbm(X, Z, 140, rng))[..., None]  # 속살 얼룩

    col = _lerp(col, WHITE, (1 - _ss(1.0, 2.0, q)) * 0.35 * has)  # 관다발 고리 — 심을 감싼 옅은 띠
    col = _lerp(col, WHITE, (1 - _ss(0.6, 1.05, q)) * has)
    col *= (1 - 0.04 * (1 - _ss(0.5, 1.0, q)) * _noise(X, Z, 380, 40, rng))[..., None]  # 심의 세로 결

    seeds = []
    for pts, w0, a, seed in _veins(prof, ripe, rng):
        k = len(pts)
        (x0, z0), (x1, z1) = pts.min(0) - 4 * w0, pts.max(0) + 4 * w0
        box = (X >= x0) & (X <= x1) & (Z >= z0) & (Z <= z1)
        bx, bz = X[box], Z[box]
        dist, tt = np.full(bx.shape, np.inf), np.zeros(bx.shape)
        for j in range(k - 1):
            (ax, az), (cx, cz) = pts[j], pts[j + 1]
            vx, vz = cx - ax, cz - az
            t = np.clip(((bx - ax) * vx + (bz - az) * vz) / (vx * vx + vz * vz), 0, 1)
            dj = np.hypot(bx - ax - t * vx, bz - az - t * vz)
            better = dj < dist
            dist, tt = np.where(better, dj, dist), np.where(better, (j + t) / (k - 1), tt)  # 0 = 껍질, 1 = 심
        ph = rng.uniform(0, 6.3)
        patchy = 0.55 + 0.45 * np.sin(tt * rng.uniform(9, 15) + ph) ** 2  # 단면 밖으로 들고나는 줄 — 띄엄띄엄
        width = w0 * (1.15 - 0.45 * tt)
        m = np.exp(-(dist / width) ** 2) * a * patchy * _ss(0.002, 0.007, d[box]) * (1 - _ss(0.8, 1.0, tt))
        m *= 1 - 0.2 * _ss(t_red, t_red + 0.02, d[box])  # 속살 위에선 조금 덜 보인다
        col[box] = col[box] + (_rgb(VEIN) - col[box]) * m[:, None]
        if seed:
            seeds.append(pts[0])

    for sx, sz in seeds:  # 씨 단면 — 줄이 닿는 껍질 자리에 반쯤 걸친 노란 알
        e = np.hypot(X - sx, Z - sz) / 0.0036
        col = _lerp(col, SEED_RIM, (1 - _ss(0.85, 1.15, e)) * 0.8)
        col = _lerp(col, SEED, 1 - _ss(0.4, 0.8, e))

    top = _ss(0.255, 0.275, Z) * (1 - _ss(0.02, 0.035, np.abs(X)))  # 꼭지 흉터엔 껍질 선이 없다
    col = _lerp(col, SKIN, (1 - _ss(0.0012, 0.0032, d)) * (1 - top))
    col *= (0.97 + 0.06 * _noise(X, Z, 650, 650, rng))[..., None]  # 즙 머금은 과육 알갱이
    return np.clip(col, 0, 1)


def paint(prof, n=1024, seed=5):
    """prof = 반쪽 윤곽 [(r, z)] 끝 → 꼭지. 돌려줌 = (n, 2n, 4) float32 sRGB 0..1, 아래 행부터(Blender 픽셀 순서)"""
    tiles = [_tile(prof, n, np.random.default_rng(seed + k), ripe) for k, ripe in enumerate((0.0, 1.0))]
    rgb = np.concatenate(tiles, axis=1)
    return np.dstack([rgb, np.ones(rgb.shape[:2])]).astype(np.float32)
