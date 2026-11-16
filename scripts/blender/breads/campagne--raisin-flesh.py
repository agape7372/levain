"""건포도 깜빠뉴 (campagne--raisin-flesh) — 실물 사진(네이버 이미지 검색 「건포도 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 크림 베이지 속살에 검보라 · 황금 건포도가 섞여 쭈글쭈글하게 박혀 있다.
구성: 깜빠뉴 껍질 · 정면을 덜어 낸 둥근 단면 = 베이지 속살 + 검보라 · 황금 건포도(주름, 크기 섞음).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

RAISIN = dict(scale=10.0, cover=0.5, r=0.32, cols=('#3A1A1E', '#4E2428'), cols2=('#9A6A24', '#B08030'),
              veins=(80, '#1E0A0E'), jag=0.65, size_var=0.5, stretch=(1, 1, 1.3), rough=0.42, seed=53.0)


def build(lib):
    return build_campagne_variant(lib, 157, cut=('cap', 0, 0.24), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#D2B08C', '#DEBE9A'), pore='#9A6A40', deep_col='#5A3418', pieces=RAISIN))
