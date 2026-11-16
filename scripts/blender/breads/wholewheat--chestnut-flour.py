"""밤가루 통밀빵 — 실물 사진(네이버 이미지 검색 「밤 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 밤가루 반죽은 껍질이 밤 껍데기 같은 붉은 갈색이고, 바네통에서 나온 빵은 고리마다 옅은 가루 줄이 남는다(통밤 조각은 밤 변형 몫).
구성: 밤빛 적갈 껍질 · 바네통 고리 마루마다 미색 가루 줄(흰빛이 아니라 밤가루 미색 — 짙은 껍질 위 흰 가루는 곰팡이로 읽힌다).
"""
from breads.wholewheat import crust_material, variant

PAL = dict(ramp=('#62280A', '#7C3A14', '#94501E'), low='#341404', groove='#E0C49C', mottle='#A86634', light='#C08042')  # groove = 홈 바탕도 미색


def flour(m, k, col, rough, h):
    line = m.math('MULTIPLY', m.smooth(k['g'], 0.3, 0.6), k['zone'])  # 고리 홈 = 가는 줄(마루 전체에 두면 빵 전체가 허옇게 덮였다, d1)
    f = m.math('MULTIPLY', line, m.smooth(m.noise(k['p'], scale=5, detail=3), 0.4, 0.6))  # 줄마다 끊기고 짙기가 다르다
    f = m.math('MULTIPLY', f, m.smooth(m.noise(k['p'], scale=70, detail=2), 0.3, 0.55))  # 가루 결
    col = m.mix(m.math('MULTIPLY', f, 0.8), col, '#D8BC94')
    return col, rough, h


def build(lib):
    return variant(lib, 251, crust=lambda lib: crust_material(lib, pal=PAL, dust_a=0.0, extra=flour))
