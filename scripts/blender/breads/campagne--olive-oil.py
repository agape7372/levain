"""올리브 오일 깜빠뉴 (campagne--olive-oil) — 실물 사진(네이버 이미지 검색 「올리브 오일 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 올리브유를 곁들이는 깜빠뉴 — 겉은 기름 바른 듯 금빛 윤기, 속은 기공이 크게 열린 노란빛 속살.
구성: 금빛 윤기 껍질(밀가루 없음) · 왼쪽 옆을 얇게 덜어 낸 단면 = 기름 밴 노란 속살 + 큰 기공.
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, crumb_material, sheen

PAL = dict(ramp=('#7A3606', '#9C520C', '#BC6C18'), ring='#7A3A08', ear='#D08A2A', inner=('#F6D27A', '#EEB44A', '#C8802A', '#7A3A0E'))


def build(lib):
    return build_campagne_variant(
        lib, 101, cut=('cap', -55, 0.27), tris=13500,
        crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, pal=PAL, flour_a=0.0, extra=sheen('#E0A030', a=0.45, rough=0.45)),
        crumb=lambda lib: crumb_material(lib, SHAPE, base=('#ECC67A', '#F6D88E'), pore='#B8782A', holes=1.5))
