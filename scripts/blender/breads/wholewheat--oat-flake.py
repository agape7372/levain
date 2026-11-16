"""오트밀 통밀빵 — 실물 사진(네이버 이미지 검색 「오트밀 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 짙은 통밀 껍질 윗면을 납작한 귀리 플레이크가 빽빽이 덮고, 구워져 옅은 크림빛 · 끝만 노릇하다. 귀리 밖 껍질은 통밀 그대로.
구성: 통밀 껍질(고리 밀가루 뺌) · 정수리 뚜껑만 귀리가 빽빽이 덮고 어깨 아래는 고리가 드러난다(깜빠뉴 귀리보다 덮는 띠가 좁다).
"""
import slab
from boule_variant import flake
from breads.wholewheat import crust_material, variant


def build(lib):
    oat = dict(make=lambda lib, nm, s, r: flake(lib, nm, s * 2, s * 1.45, 0.008, r),
               mat=lambda lib: slab.plain_mat(lib, 'bit', '#C89A5C', '#E4C48C', rough=0.85, scale=50),
               n=260, size=(0.02, 0.032), zone=(0.0, 0.9), bias=1.2, sink=-0.2, gap=-0.02)
    return variant(lib, 211, crust=lambda lib: crust_material(lib, dust_a=0.0), bits=[oat])
