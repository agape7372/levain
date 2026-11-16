"""호두 깜빠뉴 — 실물 사진(네이버 이미지 검색 「호두 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 단면 — 호두 물이 들어 회갈색인 속살에 주름진 연갈색 호두 조각이 크기 섞여 박혀 있다. 껍질은 밀가루 묻은 짙은 갈색.
구성: 깜빠뉴 껍질 그대로 · 축을 지나 반으로 가른 단면(오른쪽 앞을 본다) = 회갈 속살 + 주름진 호두 조각.
      껍질에 붙인 덩이(1판)는 혹으로 읽히고 64px에서 안 보였다(두뇌 검수).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

NUT = dict(scale=5.0, cover=0.38, r=0.4, cols=('#B88450', '#D6A46A'), veins=(40, '#6A4020'), jag=0.45, size_var=0.6,
           rough=0.7, seed=5.0)


def build(lib):
    return build_campagne_variant(lib, 61, cut=('cap', 28, 0.02), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#9E7C5E', '#AE8C6C'), pore='#7A5232', deep_col='#4A2C14', pieces=NUT))
