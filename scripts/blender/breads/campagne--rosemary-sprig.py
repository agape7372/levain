"""로즈마리 깜빠뉴 (campagne--rosemary-sprig) — 실물 사진(네이버 이미지 검색 「로즈마리 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 사진이 드물다 — 깜빠뉴 위에 로즈마리 잔가지를 얹어 구운 모습.
구성: 깜빠뉴 껍질 · 정수리 어깨에 눕힌 로즈마리 잔가지 셋(칼집 홈은 비운다).
"""
import slab
from boule_variant import SCORE, build_campagne_variant, in_score


def build(lib):
    sprig = dict(make=lambda lib, nm, s, r: (slab.rosemary(lib, nm, s, r, n_pairs=6), 0.004), mat=slab.rosemary_material,
                 n=4, size=(0.24, 0.3), zone=(0.2, 0.85), sink=-0.2, gap=0.04)
    return build_campagne_variant(lib, 137, bits=[sprig], avoid=in_score(SCORE))
