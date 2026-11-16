"""허니 깜빠뉴 (campagne--honey-jam) — 실물 사진(네이버 이미지 검색 「허니 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 허니 깜빠뉴는 겉에 꿀을 발라 정수리가 호박색으로 윤나고 칼집에 꿀이 고인다.
구성: 깜빠뉴 껍질(고리 밀가루 옅게) · 정수리를 덮고 흘러내린 호박색 꿀 윤기(칼집 홈에 고임).
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, glaze


def build(lib):
    return build_campagne_variant(lib, 223, crust=lambda lib: campagne_crust(
        lib, SHAPE, SCORE, flour_a=0.4, extra=glaze(('#D08A1C', '#E2A032'), a=0.7, rough=0.3, z0=0.3, drip=0.06)))
