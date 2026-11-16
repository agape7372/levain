"""단호박 깜빠뉴 (campagne--pumpkin-puree) — 실물 사진(네이버 이미지 검색 「단호박 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 대표 사진은 썬 면 — 노란빛 반죽에 주황 단호박 덩이가 크게 박히고 덩이 가장자리에 초록 껍질.
구성: 깜빠뉴 껍질 · 앞을 덜어 낸 둥근 단면 = 노란빛 속살 + 주황 단호박 덩이(초록 껍질 테).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

PUMPKIN = dict(scale=5.5, cover=0.35, r=0.4, cols=('#DC5A14', '#E86E1E'), edge='#5A6A2A', jag=0.5, size_var=0.5,
               rough=0.5, seed=47.0)


def build(lib):
    return build_campagne_variant(lib, 149, cut=('cap', 20, 0.14), tris=13500, crumb=lambda lib: crumb_material(
        lib, SHAPE, base=('#F0C878', '#F6D488'), pore='#C08030', deep_col='#8A4410', pieces=PUMPKIN))
