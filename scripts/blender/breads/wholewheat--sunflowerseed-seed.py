"""해바라기씨 통밀빵 — 실물 사진(네이버 이미지 검색 「해바라기씨 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 짙은 통밀 불 윗면에 길쭉한 물방울꼴 해바라기씨가 반쯤 묻혀 솟는다. 씨는 회백 · 상아색, 구워진 끝만 노릇. 귀리보다 굵고 성기다.
구성: 통밀 껍질(고리 밀가루 뺌) · 정수리 · 어깨에 굵은 씨(길이 섞어, 방향 흩어) — 귀리처럼 덮지 않고 껍질 고리가 사이로 보인다.
"""
import slab
from boule_variant import flake
from breads.wholewheat import crust_material, variant


def build(lib):
    seed = dict(make=lambda lib, nm, s, r: flake(lib, nm, s * 2.5, s * 1.1, 0.008, r, n=10),
                mat=lambda lib: slab.plain_mat(lib, 'bit', '#8E8468', '#B8AC8C', rough=0.75, scale=30),  # 흰빛은 쌀알로 읽혔다(d2)
                n=110, size=(0.018, 0.028), zone=(0.0, 1.1), bias=1.4, sink=-0.1, gap=0.0)
    return variant(lib, 229, crust=lambda lib: crust_material(lib, dust_a=0.0), bits=[seed])
