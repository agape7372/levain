"""플랫브레드 (flatbread) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/flatbread{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 지름 1(살짝 타원), 바닥 z=0, 정면 = Blender −Y. 판 형상은 slab.py.
구성: 얇은 둥근 판(두께 0.045) · 크게 부푼 기포 물집 9(꼭대기가 탐) · 작은 물집 14 · 납작한 탄 반점 18.
      탄 자국 = 짙은 고동~검정 가운데 + 갈색 번짐 테. 옛 모델은 민 원반에 점을 찍어 쿠키로 읽혔다(2026-11-14).
"""
import math
import random

import slab
from mathutils import Vector

SEED = 13
R, ELL, T = 0.5, 0.9, 0.045


def crust_material(lib):
    m = lib.Mat('crust')
    p = m.lpos()
    nz = m.sep(m.lnrm())[2]
    blot = m.noise(p, scale=8, detail=5, rough=0.6, distortion=0.3)
    # 레퍼런스 실측 바탕 #F4C06B~#E9AE56 · 탄 가운데 #573F2F · 번짐 #BD7433 → 노출 되짚은 값
    col = m.ramp(blot, [(0.3, '#EEAA4C'), (0.5, '#F7BE60'), (0.7, '#FBCB70')])
    col = m.mix(m.math('MULTIPLY', m.smooth(m.noise(p, scale=30, detail=3), 0.58, 0.72), 0.5), col, '#D99540')  # 잔 구움
    col = m.mix(m.math('MULTIPLY', m.attr('edge'), 0.6), col, '#D08A38')
    # 탄 자국 — 정점 속성 char(가운데 1)에 얼룩을 곱해 들쭉날쭉하게. 가운데 검정 · 테 갈색
    burn = m.math('MULTIPLY', m.attr('char'),
                  m.math('ADD', 0.65, m.math('MULTIPLY', m.noise(p, scale=45, detail=4, distortion=0.4), 0.7)))
    char = m.ramp(burn, [(0.12, '#F4C06B'), (0.28, '#DE9440'), (0.45, '#B8682A'), (0.65, '#7A4220'),
                         (0.88, '#3A2214')])  # 번짐을 주황 갈색으로 — 회갈색 판은 그을음 얼룩으로 읽혔다(r2)
    col = m.mix(m.smooth(burn, 0.1, 0.25), col, char)
    side = m.math('SUBTRACT', 1.0, m.smooth(nz, 0.35, 0.7))
    col = m.mix(m.math('MULTIPLY', side, 0.5), col, '#D9984A')
    rough = m.mixf(m.smooth(burn, 0.4, 0.8), 0.88, 0.92)  # 0.8은 방 반사 회색 막(본세션 교훈 11-14)
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=70, detail=3), 0.35), m.math('MULTIPLY', blot, 0.3))
    h = m.math('ADD', h, m.math('MULTIPLY', m.smooth(burn, 0.5, 0.9), -0.25))
    return m.out(col, rough, m.bump(h, strength=0.35, distance=0.003))


def scatter(rnd, n, rmin, rmax, keep, gap):
    """타원 판 안에 겹치지 않게 (x, y, r) n개"""
    out = []
    for _ in range(4000):
        if len(out) == n:
            break
        r = rnd.uniform(rmin, rmax)
        a, d = rnd.uniform(0, math.tau), math.sqrt(rnd.random()) * (R - 0.05 - r)
        x, y = d * math.cos(a), d * math.sin(a) * ELL
        if all(math.hypot(x - q[0], y - q[1]) > r + q[2] + gap for q in keep + out):
            out.append((x, y, r))
    return out


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    big = scatter(rnd, 9, 0.05, 0.085, [], 0.02)
    mid = scatter(rnd, 14, 0.022, 0.034, big, 0.015)
    spots = scatter(rnd, 18, 0.014, 0.026, big + mid, 0.02)  # 28개는 64px에서 초코칩 쿠키로 읽혔다(r3)
    domes = ([(x, y, r, r * rnd.uniform(0.5, 0.75)) for x, y, r in big]
             + [(x, y, r, r * rnd.uniform(0.25, 0.4)) for x, y, r in mid])
    # 탄 자국 — (x, y, 반지름, 세기). 큰 물집은 꼭대기 한쪽으로 비켜 탄다
    chars = [(x + rnd.uniform(-0.25, 0.25) * r, y + rnd.uniform(-0.25, 0.25) * r, r * rnd.uniform(0.95, 1.15),
              rnd.uniform(0.9, 1.0)) for x, y, r in big]
    chars += [(x, y, r * 1.4, rnd.uniform(0.45, 0.8)) for x, y, r in mid]
    chars += [(x, y, r * 1.4, rnd.uniform(0.75, 1.0)) for x, y, r in spots]  # 번짐 테까지(1.0은 잔 점으로 읽혔다, r1)

    ob = slab.slab(lib, 'slab', slab.round_outline(lib, R, wob=0.015, seed=1.5, ell=ELL), T, 0.018, 0.008,
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
                best = max(best, s * math.exp(-1.6 * d * d))
        return best * slab.smoothstep(0.2, 0.6, n.z)

    def edge(co, n):
        q = math.hypot(co.x, co.y / ELL) / R  # 타원 반지름 비
        return slab.smoothstep(0.86, 1.0, q)

    slab.attrs(lib, ob, {'char': char, 'edge': edge})
    parts = [lib.assign(ob, crust_material(lib))]
    print(f'  slab {lib.tri_count(parts[0])} tri')
    return parts, dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45})
