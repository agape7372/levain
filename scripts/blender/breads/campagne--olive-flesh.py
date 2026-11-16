"""올리브 깜빠뉴 — 실물 사진(네이버 이미지 검색 「올리브 깜빠뉴」, 2026-11-16) · 프롬프트 JSON을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 기공 많은 크림빛 속살에 박힌 올리브 단면(고리 · 반달 · 씨 빠진 구멍), 검정과 올리브그린이 섞인다.
구성: 깜빠뉴 껍질 · 오른쪽 앞 쐐기를 덜어낸 두 단면 = 올리브 물이 살짝 밴 속살 + 크기 섞인 올리브 고리 · 반달(윤기).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

OLIVE = dict(scale=8.0, cover=0.4, r=0.36, cols=('#1E1418', '#30222A'), cols2=('#4A4626', '#5E5A30'), edge='#120C0E',
             ring=0.45, half=0.4, size_var=0.6, rough=0.38, seed=4.0, stretch=(1, 1, 0.8), halo=('#C8BC8A', 0.35))


def build(lib):
    return build_campagne_variant(lib, 73, cut=('wedge', -20, 72), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#DCC898', '#E8D6A8'), pieces=OLIVE))
