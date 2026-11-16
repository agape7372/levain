"""건조 로즈마리 깜빠뉴 (campagne--rosemary-dried) — 실물 사진(네이버 이미지 검색 「로즈마리 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 말린 로즈마리 잎을 반죽 겉에 뿌려 구운 모습 — 올리브빛 바늘잎이 흩어져 있다.
구성: 깜빠뉴 껍질 · 고리 밀가루를 뺀 껍질 · 정수리에 흩은 마른 바늘잎(형상, 쏠리게 · 방향 흩음).
"""
import slab
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, in_score


def build(lib):
    leaf = dict(make=lambda lib, nm, s, r: (slab.rosemary(lib, nm, s, r, n_pairs=0), 0.002),
                mat=lambda lib: slab.plain_mat(lib, 'bit', '#4A6626', '#66843A', rough=0.7, scale=60),
                n=70, size=(0.045, 0.06), zone=(0.0, 1.0), bias=1.3, sink=-0.6, gap=-0.01)
    return build_campagne_variant(lib, 139, bits=[leaf], avoid=in_score(SCORE),
                                  crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.0))
