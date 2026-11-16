"""포피시드 통밀빵 — 실물 사진(네이버 이미지 검색 「포피시드 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 양귀비씨를 윗면에 빽빽이 묻혀 구운 빵 — 청흑색 낱알이 정수리에 촘촘하고 어깨로 가며 성기게 흩어진다. 씨 사이로 껍질이 보인다.
구성: 통밀 껍질 · 청흑색 낱알(살짝 윤기)이 정수리에서 어깨로 갈수록 성겨진다(셰이더). 면으로 칠하지 않는다:
      회청색 면(정식 1판)은 곰팡이 · 재로 읽혔다. 경계는 낱알 밀도로만 흐려져 동그란 뚜껑 선이 없다.
"""
from breads.wholewheat import crust_material, variant


def seeds(m, k, col, rough, h):
    p = k['p']
    a = m.math('ADD', k['ang'], m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=2.5, detail=3), 0.5), 0.5))
    dens = m.math('SUBTRACT', 1.0, m.smooth(a, 0.05, 1.35))  # 정수리 1 → 어깨 0, 길게 흐려진다
    dens = m.math('MULTIPLY', dens, 0.92)  # 가장 촘촘한 데도 칸 8%는 비워 껍질이 비친다
    mp = m.mapping(p, scale=(1.0, 1.7, 1.0))
    cell = m.voronoi(mp, scale=105, randomness=1.0)  # 낟알 하나 = 칸 하나(살짝 길쭉)
    rnd = m.sep(m.voronoi(mp, scale=105, randomness=1.0, out='Color'))[0]
    keep = m.math('SUBTRACT', 1.0, m.smooth(m.math('SUBTRACT', rnd, dens), -0.02, 0.0))
    grain = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(cell, 0.4, 0.5)), keep)
    sc = m.ramp(rnd, [(0.2, '#10141E'), (0.6, '#182030'), (0.9, '#222C40')])  # 청흑색, 회색기 없이
    col = m.mix(grain, col, sc)
    rough = m.mixf(grain, rough, 0.4)
    h = m.math('ADD', h, m.math('MULTIPLY', grain, 0.6))
    return col, rough, h


def build(lib):
    return variant(lib, 223, crust=lambda lib: crust_material(lib, dust_a=0.0, extra=seeds))
