"""귀리 깜빠뉴 — 실물 사진(네이버 이미지 검색 「오트밀 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 정수리 · 어깨를 납작한 귀리 플레이크가 빽빽이 덮고 구워져 옅은 크림빛이다. 칼집은 귀리 사이로 벌어진다. 밀가루 고리는 없다.
구성: 깜빠뉴 껍질(고리 밀가루 뺌) · 정수리에 빽빽하고 어깨로 갈수록 성긴 귀리 플레이크(칼집 홈은 비운다).
"""
import slab
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, flake, in_score


def build(lib):
    oat = dict(make=lambda lib, nm, s, r: flake(lib, nm, s * 2, s * 1.4, 0.007, r),
               mat=lambda lib: slab.plain_mat(lib, 'bit', '#D4AE72', '#E8CC98', rough=0.85, scale=50),
               n=170, size=(0.018, 0.028), zone=(0.0, 1.15), bias=1.3, sink=-0.2, gap=-0.016)
    return build_campagne_variant(lib, 67, crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.0),
                                  bits=[oat], avoid=in_score(SCORE), tris=12000)
