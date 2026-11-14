"""크래커 (cracker) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/cracker{,-2,-3}.png — 정면(1번)이 정체성 기준, 구멍 격자는 위에서 본 3번.
단위: 한 변 1, 바닥 z=0, 정면 = Blender −Y. 판 형상은 slab.py.
구성: 얇은 정사각 판(두께 0.04) · 도킹 홀 5×5(깔때기 + 가운데 바늘 구멍) · 연한 기포 물집 · 검은 깨알 반점 ·
      가장자리로 갈수록 짙게 구운 금빛. 옛 모델은 구멍 대신 각진 돌기 판이라 고무 매트로 읽혔다(2026-11-14).
"""
import math
import random

import slab
from mathutils import Vector

SEED = 5
L, T, RC = 1.0, 0.04, 0.025
HOLE_R, HOLE_D = 0.024, 0.014  # 깔때기 반지름·깊이
PIT_R, PIT_D = 0.009, 0.012  # 가운데 바늘 구멍


def crust_material(lib):
    m = lib.Mat('crust')
    p = m.lpos()
    nz = m.sep(m.lnrm())[2]
    blot = m.noise(p, scale=6, detail=5, rough=0.6, distortion=0.25)
    # 레퍼런스 실측 윗면 #F0B050~#F2B658 · 물집 #F5C474 · 옆면 #CC8D36 → 노출(위 0.93·옆 0.83)로 되짚은 값
    col = m.ramp(blot, [(0.3, '#E9A23C'), (0.5, '#F4B44E'), (0.7, '#F8C262')])
    col = m.mix(m.math('MULTIPLY', m.attr('edge'), 0.5), col, '#CC8630')  # 가장자리 짙게(0.75 갈색 테는 탄 테두리로 읽혔다, r1)
    col = m.mix(m.smooth(m.attr('blist'), 0.15, 0.6), col, '#FAD48E')  # 기포 물집은 연하게
    col = m.mix(m.math('MULTIPLY', m.attr('hole'), 0.6), col, '#C07626')  # 깔때기 안쪽 구움(0.7은 때 낀 구멍으로 읽혔다, r2)
    # 검은 깨알 반점 — 보로노이 칸 넷 중 하나에만 작은 점
    vp = m.mapping(p, scale=(1, 1, 1))
    d = m.voronoi(vp, scale=38, randomness=0.9)
    keep = m.smooth(m.sep(m.voronoi(vp, scale=38, randomness=0.9, out='Color'))[0], 0.62, 0.64)
    speck = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.09, 0.13)), keep)
    speck = m.math('MULTIPLY', speck, m.smooth(nz, 0.5, 0.8))
    col = m.mix(speck, col, '#4A3020')
    top = m.smooth(nz, 0.4, 0.7)
    col = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, top), 0.6), col, '#D08C34')  # 옆면
    rough = m.mixf(m.attr('blist'), 0.88, 0.8)  # 0.78은 방 반사 회색 막(본세션 교훈 11-14)
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=90, detail=2), 0.25), m.math('MULTIPLY', blot, 0.3))
    h = m.math('ADD', h, m.math('MULTIPLY', speck, -0.3))
    return m.out(col, rough, m.bump(h, strength=0.3, distance=0.002))


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    pitch = 0.165
    holes = [(pitch * (i - 2) + rnd.uniform(-0.006, 0.006), pitch * (j - 2) + rnd.uniform(-0.006, 0.006))
             for j in range(5) for i in range(5)]
    blisters = []
    while len(blisters) < 64:
        x, y = rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45)
        if all(math.hypot(x - a, y - b) > 0.045 for a, b in holes) and \
                all(math.hypot(x - a, y - b) > 0.04 for a, b, *_ in blisters):
            blisters.append((x, y, rnd.uniform(0.017, 0.026), rnd.uniform(0.003, 0.005)))

    ob = slab.slab(lib, 'slab', slab.rect_outline(lib, L, L, RC, wob=0.006, seed=4.0), T, 0.012, 0.006,
                   voxel=0.006)

    def push(co, n):
        w = slab.smoothstep(0.45, 0.9, n.z)
        if w <= 0:
            return None
        dz = 0.003 * lib.n3(co.x * 3, co.y * 3, 0, 1.0) + 0.0012 * lib.n3(co.x * 14, co.y * 14, 0, 2.0)
        for x, y in holes:
            if abs(co.x - x) < HOLE_R and abs(co.y - y) < HOLE_R:
                d = math.hypot(co.x - x, co.y - y)
                dz += slab.bowl(d / HOLE_R, HOLE_D) + slab.bowl(d / PIT_R, PIT_D)
        for x, y, r, h in blisters:
            if abs(co.x - x) < r and abs(co.y - y) < r:
                dz -= slab.bowl(math.hypot(co.x - x, co.y - y) / r, h)
        return Vector((0, 0, dz * w))

    slab.shape(ob, push)
    slab.finish(lib, ob, 11000)

    def near(pts, r, co):
        return max([1 - math.hypot(co.x - p[0], co.y - p[1]) / r for p in pts] + [0.0])

    slab.attrs(lib, ob, {
        'edge': lambda co, n: 1 - slab.smoothstep(0.0, 0.08, -slab.rect_sdf(co.x, co.y, L, L, RC)),
        'blist': lambda co, n: max([1 - math.hypot(co.x - x, co.y - y) / r for x, y, r, _ in blisters] + [0.0]),
        'hole': lambda co, n: near(holes, HOLE_R * 1.3, co),
    })
    parts = [lib.assign(ob, crust_material(lib))]
    print(f'  slab {lib.tri_count(parts[0])} tri')
    return parts, dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45})  # 구멍 그늘은 재질색(hole)으로
