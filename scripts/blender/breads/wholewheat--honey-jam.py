"""허니 통밀빵 — 실물 사진(네이버 이미지 검색 「허니 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 꿀을 발라 구운 윗면이 호박색으로 윤나고 꿀이 결 · 틈에 고여 반짝인다(허니오트는 귀리까지 얹지만 그건 귀리 변형 몫).
구성: 통밀 껍질 · 정수리부터 어깨까지 꿀 글레이즈(호박색 · 윤기, 가장자리는 잡음으로 흐려짐) · 바네통 고리 홈에 꿀이 고여
      윤나는 금빛 줄로 선다(홈이 꿀로 차 살짝 메워진다) — 빛 굽기 없이 재질 윤기로만.
"""
from breads.wholewheat import crust_material, variant


def glaze(m, k, col, rough, h):
    p = k['p']
    edge = m.math('ADD', k['ang'], m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=3, detail=3), 0.5), 0.5))
    coat = m.math('SUBTRACT', 1.0, m.smooth(edge, 0.85, 1.35))  # 정수리에서 어깨까지, 아래로 흐려진다
    pool = m.math('MULTIPLY', m.smooth(k['g'], 0.25, 0.6), m.math('ADD', 0.25, m.math('MULTIPLY', coat, 0.75)))  # 홈에 고인 꿀
    pool = m.math('MULTIPLY', pool, m.smooth(m.noise(p, scale=6, detail=2), 0.32, 0.5))  # 군데군데 끊긴다
    amber = m.ramp(m.noise(p, scale=12, detail=3), [(0.3, '#B8640A'), (0.7, '#E0961E')])
    col = m.mix(m.math('MULTIPLY', coat, 0.4), col, amber)  # 0.55는 밀기울 결을 다 덮어 플라스틱이었다(d2)
    col = m.mix(pool, col, '#F4B430')
    rough = m.mixf(m.math('MAXIMUM', m.math('MULTIPLY', coat, 0.8), pool), rough, 0.3)
    h = m.math('ADD', h, m.math('MULTIPLY', pool, 1.2))
    return col, rough, h


def build(lib):
    return variant(lib, 239, crust=lambda lib: crust_material(lib, dust_a=0.0, extra=glaze))
