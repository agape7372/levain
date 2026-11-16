"""메이플 큐브 깜빠뉴 (campagne--maple-cube) — 실물 사진(네이버 이미지 검색 「메이플 큐브 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 검색 결과가 게임 화면뿐이라 실물 없음 — 메이플 시럽을 굳힌 호박색 큐브를 박아 구운 빵으로 지었다.
구성: 깜빠뉴 껍질 · 정수리에 얇게 흐른 메이플 윤기 · 껍질에 반쯤 박힌 호박색 큐브(윤기).
"""
import wedge
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, glaze, in_score


def build(lib):
    cube = dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=4, height=0.9, flat=0.85),
                mat=lambda lib: wedge.chunk_material(lib, 'bit', [(0.3, '#C07018'), (0.7, '#D88A28')], rough=0.3),
                n=9, size=(0.05, 0.072), zone=(0.15, 1.2), sink=0.35, gap=0.05)
    return build_campagne_variant(
        lib, 199, bits=[cube], avoid=in_score(SCORE),
        crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.4,
                                         extra=glaze(('#B86A1A', '#C8801E'), a=0.45, rough=0.35, z0=0.4)))
