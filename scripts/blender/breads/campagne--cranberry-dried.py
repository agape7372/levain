"""크랜베리 깜빠뉴 — 실물 사진(네이버 이미지 검색 「크랜베리 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 통밀 섞인 베이지 갈색 속살에 쭈글쭈글한 와인빛 크랜베리 · 연갈색 호두가 함께 박혀 있다. 겉은 깜빠뉴.
구성: 깜빠뉴 껍질(껍질엔 붉은 것을 칠하지 않는다) · 왼쪽 앞을 덜어낸 둥근 단면 = 통밀빛 속살 + 와인빛 크랜베리(주름 · 들쭉날쭉)
      + 호두 조각 조금(붉은 것만 있으면 상처로 읽힌다).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

BERRY = dict(scale=8.0, cover=0.5, r=0.32, cols=('#4A0C18', '#621626'), edge='#360810', veins=(60, '#2E0610'), jag=0.6,
             size_var=0.5, stretch=(1, 1, 1.4), rough=0.45, seed=11.0)
NUT = dict(scale=7.0, cover=0.72, r=0.3, cols=('#A87A48', '#C49464'), veins=(45, '#6A4422'), jag=0.55, size_var=0.5,
           rough=0.7, seed=23.0)


def build(lib):
    return build_campagne_variant(lib, 83, cut=('cap', -35, 0.2), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#B88E5E', '#C69C6C'), pore='#8A5A30', deep_col='#5A3414', pieces=[BERRY, NUT]))
