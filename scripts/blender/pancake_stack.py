"""팬케이크 더미 공용 — pancake · pancake--strawberry-fresh 가 함께 쓴다 (docs/BREADS.md §Blender).

단위: 팬케이크 지름 1, 바닥 z=0. 장 명세 = (반지름, 두께, xy 어긋남, z 회전, 기울기 x·y 도).
"""
import math

from lib import horiz, prof_r
from mathutils import Vector

RCB, RCT, BULGE, DOME = 0.070, 0.086, 0.012, 0.014  # 모서리 반경 ≈ 두께의 35% — 폭신한 수플레 테
STACK = 0.968  # 다음 장 바닥 = 아래 장 바닥 + 두께 × STACK (살짝 눌려 겹침)


def cake_profile(R, T):
    """수플레 팬케이크 단면 — 납작한 바닥 · 둥근 아래 모서리 · 살짝 부푼 옆벽 · 둥근 위 모서리 · 낮은 돔"""
    pts = [((R - RCB) * k / 3, 0.0) for k in range(4)]
    pts += [(R - RCB + RCB * math.cos(a), RCB + RCB * math.sin(a))
            for a in (-math.pi / 2 + math.pi / 2 * k / 6 for k in range(1, 7))]
    pts += [(R + BULGE * math.sin(math.pi * u), RCB + (T - RCT - RCB) * u) for u in (0.25, 0.5, 0.75)]
    pts += [(R - RCT + RCT * math.cos(a), T - RCT + RCT * math.sin(a))
            for a in (math.pi / 2 * k / 6 for k in range(7))]
    rt = R - RCT
    pts += [(rt * (1 - k / 8), T + DOME * (1 - (1 - k / 8) ** 2)) for k in range(1, 9)]
    return pts


def top_z(c, r):
    rt = c['R'] - RCT
    return c['z'] + c['T'] + DOME * max(0.0, 1 - (r / rt) ** 2)


def stack_r(cakes, z, th):
    """쌓인 팬케이크의 방위 th · 높이 z 바깥 반지름(어긋남·둘레 요철 포함, 기울기 무시)"""
    best = 0.0
    for c in cakes:
        h = z - c['z']
        r = prof_r(c['prof'], h)
        if r > 0:
            best = max(best, r * c['rfn'](th - c['rotz'], h) + Vector(c['off'] + (0,)).dot(horiz(th)))
    return best


def build_cakes(lib, mat, spec, top_hole=0.0):
    """장 명세대로 쌓는다 → (장 dict 목록, 파트). top_hole = 맨 위 장 윗면을 지울 반지름(토핑이 가리는 곳)"""
    cakes, parts, z = [], [], 0.0
    for i, (R, T, off, rotz, tilt) in enumerate(spec):
        prof = cake_profile(R, T)
        s = i * 3.1
        rfn = (lambda th, zz, s=s: 1 + 0.009 * lib.n3(math.cos(th) * 1.4, math.sin(th) * 1.4, zz * 2, s)
               + 0.004 * math.sin(2 * th + s))
        cakes.append(dict(R=R, T=T, z=z, off=off, rotz=rotz, prof=prof, rfn=rfn))
        ob = lib.lathe(f'cake{i}', prof, segs=48, rfn=rfn)
        last = i == len(spec) - 1

        def hidden(c, n, last=last):
            r = math.hypot(c.x, c.y)
            if n.z < -0.5 and r < 0.40:  # 아랫면 — 아래 장(맨 아래는 바닥)이 가린다
                return True
            return n.z > 0.5 and r < (top_hole if last else 0.40)  # 윗면 — 위 장(맨 위는 토핑)이 가린다

        lib.delete_faces(ob, hidden)
        lib.place(ob, (off[0], off[1], z), (math.radians(tilt[0]), math.radians(tilt[1]), rotz))
        parts.append(lib.assign(ob, mat))
        z += T * STACK
    return cakes, parts


def crumb_material(lib):
    m = lib.Mat('crumb')
    p = m.lpos()
    px = m.sep(p)
    nz = m.math('ABSOLUTE', m.sep(m.lnrm())[2])
    blot = m.noise(p, scale=6.5, detail=6, rough=0.62, distortion=0.35)
    # 윗면·아랫면 = 구운 껍질, 옆벽 = 속살. 경계는 얼룩으로 들쭉날쭉하게 — 껍질 띠가 모서리를 넘어 옆벽 위·아래를
    # 넉넉히 덮는다(레퍼런스 띠 ≈ 옆면 높이의 40%. 0.25~0.65 고른 경계는 띠가 가늘어 치즈 바퀴로 읽혔다, r4)
    # 옆벽 법선은 부풂 때문에 높이 따라 nz 0.1~0.2를 천천히 지난다 — 경계를 낮게(0.15) 잡고 얼룩을 크게(±0.1)
    # 흔들면 껍질 조각이 옆벽 전체로 번져 나뭇결 줄무늬가 됐다(r6). 경계는 모서리 호 안에 두고 흔들림은 작게
    crust = m.smooth(m.math('ADD', nz, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.12)), 0.30, 0.55)
    rr = m.math('MULTIPLY', m.vmath('LENGTH', m.combine(px[0], px[1], 0.0)), 2.0)
    # 색은 레퍼런스 실측(옆벽 #E7BE62·#EBB75F, 껍질 띠 #B25110~#ED9046)을 램버트 조명 노출로 되짚은 값.
    # 앵커 JSON 값(#B9793F·#F1DDB0)대로 칠했더니 회베이지 도넛으로 읽혔다(2026-11-14).
    # 렌더 실측 껍질 #AD7553(방 반사가 채도를 빼 분홍 갈색) → 채도를 올리고 거칠기를 높였다(r5)
    # 레퍼런스 세로 표본(x=640): 옆벽 #D4AF69~#E0BF77 · 껍질 띠 #BA5F13~#DB8215 · 장 사이 골 #6F2502~#7A2C02
    # 확대 대조(r9, 밝은 쪽): 레퍼런스 껍질 띠 #E98128·#F29F37·#E17319(선명한 주황) vs 렌더 #996741(칙칙한 갈색).
    # 띠는 장 사이 틈 바로 위라 AO와 방 반사(회색)가 함께 죽였다 → 알베도를 주황으로 올리고 거칠기 0.88,
    # 빌더는 반죽 AO를 0.45로 낮춘다. 띠 안의 옅은 반점(레이스 무늬)은 덜 익은 자리
    crust_c = m.ramp(blot, [(0.28, '#A84A06'), (0.42, '#D0620A'), (0.56, '#EA7E12'), (0.70, '#F49A26')])
    crust_c = m.mix(m.math('MULTIPLY', m.smooth(rr, 0.72, 0.98), 0.4), crust_c, '#F0A840')  # 가장자리 금빛
    lace = m.smooth(m.noise(p, scale=9, detail=3), 0.60, 0.68)
    crust_c = m.mix(m.math('MULTIPLY', lace, 0.6), crust_c, '#EDB860')
    # 아래를 보는 껍질(바닥 모서리) = 장 사이 골 — 짙은 적갈색. 회갈색 골(#8A5F41)은 그늘이 아니라 때로 읽혔다
    down = m.smooth(m.math('MULTIPLY', m.sep(m.lnrm())[2], -1.0), 0.2, 0.7)
    crust_c = m.mix(m.math('MULTIPLY', down, 0.75), crust_c, '#6A2A06')
    # 옆벽: 레퍼런스 밝은 쪽 #F2D7A3·#EFCD81·#EDD097 → 렌더 #E5BC6C는 어둡고 노랬다(r9). 고운 스펀지 결을 얹는다
    side_c = m.ramp(m.noise(p, scale=11, detail=3), [(0.35, '#F0CD80'), (0.65, '#F7DA92')])
    grain = m.smooth(m.noise(p, scale=95, detail=2), 0.55, 0.70)
    side_c = m.mix(m.math('MULTIPLY', grain, 0.3), side_c, '#DDB46A')
    # 기공: 지름 ≈ 두께의 6%(레퍼런스 확대 실측). 0.08~0.16 문턱은 바늘구멍이라 고품질 굽기에서도 안 보였다
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 1.5)), scale=30), 0.14, 0.22))
    mask = m.smooth(m.noise(p, scale=8, detail=2), 0.52, 0.62)
    pore = m.math('MULTIPLY', m.math('MULTIPLY', pore, mask), m.math('SUBTRACT', 1.0, crust))
    side_c = m.mix(pore, side_c, '#A87432')
    col = m.mix(crust, side_c, crust_c)
    rough = m.mixf(crust, 0.9, 0.88)
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=70, detail=2), 0.25), m.math('MULTIPLY', pore, -1.0))
    h = m.math('ADD', h, m.math('MULTIPLY', m.math('MULTIPLY', blot, crust), 0.35))
    return m.out(col, rough, m.bump(h, strength=0.4, distance=0.004))
