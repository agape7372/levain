"""포피시드 깜빠뉴 (campagne--poppyseed-seed) — 실물 사진(네이버 이미지 검색 「포피시드 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 양귀비씨를 겉에 묻혀 굽는다 — 청흑색 낱알이 정수리에 촘촘하고 어깨로 가며 성기게 흩어진다. 씨 사이로 껍질이 보인다.
구성: 고리 밀가루를 뺀 깜빠뉴 껍질 · 청흑색 낱알(살짝 윤기)이 정수리에서 어깨로 갈수록 성겨진다(셰이더). 면으로 칠하지 않는다:
      회흑색 뚜껑(정식 1판)은 탄 빵 · 곰팡이로 읽혔다(두뇌 검수). 경계는 낱알 밀도로만 흐려져 뚜껑 선이 없다.
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant


def seeds(m, col, rough, p, nz, cut):
    a = m.math('ADD', SHAPE.ring_angle(m, p), m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=2.5, detail=3), 0.5), 0.5))
    dens = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(a, 0.35, 1.5)), 0.95)  # 정수리 촘촘 → 어깨 0
    dens = m.math('MULTIPLY', dens, m.math('SUBTRACT', 1.0, cut))  # 칼집 홈 속은 비운다
    mp = m.mapping(p, scale=(1.0, 1.7, 1.0))
    cell = m.voronoi(mp, scale=72, randomness=1.0)  # 낟알 하나 = 칸 하나(살짝 길쭉)
    rnd = m.sep(m.voronoi(mp, scale=72, randomness=1.0, out='Color'))[0]
    keep = m.math('SUBTRACT', 1.0, m.smooth(m.math('SUBTRACT', rnd, dens), -0.02, 0.0))
    grain = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(cell, 0.4, 0.5)), keep)
    sc = m.ramp(rnd, [(0.2, '#10141E'), (0.6, '#182030'), (0.9, '#222C40')])  # 청흑색, 회색기 없이
    return m.mix(grain, col, sc), m.mixf(grain, rough, 0.4)


def build(lib):
    return build_campagne_variant(lib, 191, crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.0, extra=seeds))
