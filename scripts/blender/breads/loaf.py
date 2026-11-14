"""식빵 (loaf) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/loaf{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 길이 1(국소 X), 바닥 z=0. 길이축을 az(ANGLE)로 돌려 레퍼런스처럼 짧은 끝면이 화면 왼쪽, 긴 옆면이 오른쪽.
구성: 몸통 1(loft) — 단면 = 납작한 바닥 · 둥근 아래 모서리 · 곧은 팬 옆벽 · 팬 테 위로 살짝 부푼 뚜껑(돔).
  길이 방향은 끝으로 갈수록 단면을 무게중심 쪽으로 줄여(지수 10) 끝면이 평평한 둥근 모서리 상자가 된다.
색: 레퍼런스 실측 돔 #E79C56·#C87F40(그늘) · 옆면 #FDE5BE(밝은 쪽)·#E2C79D(그늘 쪽).
"""
import math

from long_loaf import loft

SEED = 9
ANGLE = 140  # 길이축 방위 — 짧은 끝면이 화면 왼쪽(레퍼런스 3/4)
HY = 0.30  # 옆벽 반폭(위 테)
HS = 0.50  # 팬 테 높이 = 뚜껑 시작
HT = 0.72  # 돔 꼭대기
RB = 0.045  # 아래 모서리 반경
NTH = 112


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


def loaf_material(lib):
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
    crust = m.ramp(blot, [(0.3, '#CE762A'), (0.5, '#D98536'), (0.7, '#E3933E')])
    crust = m.mix(m.math('MULTIPLY', ridge, 0.3), crust, '#B5621F')
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(nz, 0.3, 0.8)), 0.6), crust, '#E8A458')
    blister = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=60, randomness=0.9), 0.05, 0.12))
    blister = m.math('MULTIPLY', blister, m.smooth(m.noise(p, scale=9, detail=2), 0.5, 0.62))
    crust = m.mix(m.math('MULTIPLY', blister, 0.15), crust, '#A0501A')

    # 옆면: 옅은 크림 + 팬에 닿아 살짝 구운 기운(아래·모서리 쪽 금빛)
    side = m.ramp(m.noise(p, scale=14, detail=4), [(0.3, '#FFE9BA'), (0.7, '#FFEFCA')])
    kiss = m.math('ADD', m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(px[2], 0.0, 0.2)), 0.6),
                  m.math('MULTIPLY', m.smooth(blot, 0.55, 0.75), 0.12))  # 0.35는 옆면이 누런 얼룩으로 읽혔다(r10)
    side = m.mix(m.math('MULTIPLY', kiss, 0.6), side, '#E3B26A')
    # 테 바로 밑 — 오븐에서 부풀며 찢긴 결(밝은 띠)
    shred = m.math('MULTIPLY', m.smooth(px[2], HS - 0.05, HS - 0.01),
                   m.math('SUBTRACT', 1.0, m.smooth(px[2], HS - 0.006, HS)))
    side = m.mix(m.math('MULTIPLY', shred, 0.5), side, '#FBEAC6')
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=160, randomness=0.9), 0.05, 0.14))
    side = m.mix(m.math('MULTIPLY', pore, 0.25), side, '#D9B37A')

    col = m.mix(cap, side, crust)
    rough = m.mixf(cap, 0.88, 0.86)  # 0.76은 방 반사가 뚜껑 채도를 뺐다
    h = m.mixf(cap, m.math('MULTIPLY', pore, -0.5),
               m.math('ADD', m.math('MULTIPLY', blot, 0.4), m.math('MULTIPLY', blister, -0.4)))
    h = m.math('ADD', h, m.math('MULTIPLY', m.noise(p, scale=80, detail=2), 0.15))
    return m.out(col, rough, m.bump(h, strength=0.4, distance=0.003))


def build(lib):
    lib.reset(SEED)
    mat = loaf_material(lib)
    # 정거장 — 가운데는 성기게(길이 방향으로 평평), 끝 둥근 모서리는 촘촘하게. 줄이기(decimate)는 쓰지 않는다:
    # 끝 모서리 고리가 옆벽까지 긴 바늘 삼각형으로 뭉개져 옆면에 세로 줄무늬가 생겼다(r4·r5)
    end = [0.42 + 0.08 * math.sin(math.pi / 2 * k / 16) for k in range(1, 17)]
    mid = [-0.42 + 0.84 * k / 22 for k in range(23)]
    xs = [-e for e in reversed(end)] + mid + end
    ob = loft(lib, 'loaf', xs, section(lib), nth=NTH)
    lib.place(ob, rot=(0, 0, lib.az(ANGLE)))
    lib.assign(ob, mat)
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    return [ob], dict(size=1024, rough_size=512, ao_samples=48, ao_strength=0.25)
