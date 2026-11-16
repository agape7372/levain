"""무화과 깜빠뉴 (campagne--fig-dried) — 실물 사진(네이버 이미지 검색 「무화과 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 통밀빛 속살에 호박색 무화과 덩이가 크게 박히고 덩이 속에 잔 씨가 비친다.
구성: 깜빠뉴 껍질 · 앞 쐐기 단면 = 통밀빛 속살 + 큰 호박색 무화과 덩이(속에 옅은 씨).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

FIG = dict(scale=5.5, cover=0.45, r=0.38, cols=('#A86020', '#C27A2E'), seeds=(90, '#F0D8A0'), edge='#5A2E10', jag=0.5,
           size_var=0.6, stretch=(1, 1, 0.8), rough=0.45, seed=43.0)


def build(lib):
    return build_campagne_variant(lib, 131, cut=('wedge', -35, 50), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#D8B482', '#E4C090'), pieces=FIG))
