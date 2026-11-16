"""살구 깜빠뉴 (campagne--apricot-dried) — 실물 사진(네이버 이미지 검색 「살구 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 회베이지 속살에 선명한 주황 살구 덩이가 동글게 박혀 윤이 난다.
구성: 깜빠뉴 껍질 · 왼쪽 앞을 깊게 덜어 낸 단면 = 회베이지 속살 + 동글한 주황 살구 덩이(윤기).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

APRICOT = dict(scale=7.0, cover=0.3, r=0.36, cols=('#E88A16', '#F4A030'), edge='#C86A0E', jag=0.3, size_var=0.6,
               stretch=(1, 1, 1.2), rough=0.38, seed=59.0)


def build(lib):
    return build_campagne_variant(lib, 167, cut=('cap', -50, 0.1), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#C8AE90', '#D4BC9E'), pore='#8A6A4A', deep_col='#5A3E24', pieces=APRICOT))
