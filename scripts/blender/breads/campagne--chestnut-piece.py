"""밤 깜빠뉴 (campagne--chestnut-piece) — 실물 사진(네이버 이미지 검색 「밤 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 회보랏빛 속살에 큼직한 노란 밤 덩이와 흰 크림치즈가 박혀 있다.
구성: 깜빠뉴 껍질 · 왼쪽 앞을 깊게 덜어 낸 단면 = 회보랏빛 속살 + 큰 노란 밤 덩이 + 크림치즈 덩이.
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

CHESTNUT = dict(scale=6.0, cover=0.3, r=0.4, cols=('#E2B850', '#F0CC6A'), edge='#B8862E', jag=0.5, size_var=0.6,
                rough=0.55, seed=31.0)
CHEESE = dict(scale=4.0, cover=0.72, r=0.36, cols=('#F6EEDC', '#FBF4E6'), jag=0.7, rough=0.6, seed=37.0)


def build(lib):
    return build_campagne_variant(lib, 107, cut=('cap', -40, 0.12), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#A88A74', '#B89A84'), pore='#7A5A44', deep_col='#4A3020', pieces=[CHESTNUT, CHEESE]))
