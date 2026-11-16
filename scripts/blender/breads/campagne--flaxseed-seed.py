"""아마씨 깜빠뉴 (campagne--flaxseed-seed) — 실물 사진(네이버 이미지 검색 「아마씨 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 아마씨 깜빠뉴는 겉에 윤나는 갈색 · 황금 아마씨를 덮어 굽는다.
구성: 깜빠뉴 껍질(고리 밀가루 뺌) · 정수리를 덮은 윤나는 갈색 · 황금 아마씨 코팅.
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, coat


def build(lib):
    return build_campagne_variant(lib, 197, crust=lambda lib: campagne_crust(
        lib, SHAPE, SCORE, flour_a=0.0, extra=coat(('#6A3814', '#B07A34'), scale=80, z0=0.32, rough=0.45, keep=0.15)))
