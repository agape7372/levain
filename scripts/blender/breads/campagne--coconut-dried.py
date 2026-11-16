"""코코넛 깜빠뉴 (campagne--coconut-dried) — 실물 사진(네이버 이미지 검색 「코코넛 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 사진이 드물다 — 깜빠뉴 겉에 말린 코코넛 채를 붙여 구워 끝이 노릇하다.
구성: 깜빠뉴 껍질(고리 밀가루 뺌) · 정수리에 몰린 넓적한 코코넛 칩(끝이 노릇, 귀리보다 크고 희다).
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, flake, in_score
import slab


def build(lib):
    chip = dict(make=lambda lib, nm, s, r: flake(lib, nm, s * 2.0, s * 1.0, 0.004, r),
                mat=lambda lib: slab.plain_mat(lib, 'bit', '#E2C89A', '#F4E6CC', rough=0.8, scale=40),
                n=95, size=(0.02, 0.03), zone=(0.0, 1.05), bias=1.2, sink=-0.2, gap=-0.012)
    return build_campagne_variant(lib, 179, crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.0),
                                  bits=[chip], avoid=in_score(SCORE), tris=12000)
