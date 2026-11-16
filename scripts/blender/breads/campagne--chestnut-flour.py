"""밤가루 깜빠뉴 (campagne--chestnut-flour) — 실물 사진(네이버 이미지 검색 「밤 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 밤가루 반죽은 껍질이 회갈색으로 짙고 속살도 황갈 회색 — 재료가 박히지 않고 반죽색으로 읽힌다.
구성: 회갈 껍질(밤가루 반죽색) · 왼쪽 쐐기 단면 = 황갈 회색 속살 + 기공.
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, crumb_material

PAL = dict(ramp=('#6A3A1C', '#86502A', '#9E6436'), ring='#54301A', low='#44240E', base='#50301A', ear='#A06C3E',
           inner=('#E2C496', '#D4AE7C', '#A87442', '#5A3418'), pore='#A07A54')


def build(lib):
    return build_campagne_variant(
        lib, 113, cut=('wedge', -70, 10), tris=13500,
        crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, pal=PAL, flour_a=0.6),
        crumb=lambda lib: crumb_material(lib, SHAPE, base=('#C4A482', '#D0B290'), pore='#8A6440', deep_col='#5A3A1E'))
