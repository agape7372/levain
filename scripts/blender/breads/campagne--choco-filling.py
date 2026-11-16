"""초코 필링 깜빠뉴 (campagne--choco-filling) — 실물 사진(네이버 이미지 검색 「초코 필링 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 겉은 깜빠뉴, 썬 면에 진한 초콜릿 필링이 굵게 말려 들어가 윤이 난다.
구성: 깜빠뉴 껍질 · 왼쪽 앞을 덜어 낸 한 단면 = 크림빛 속살 + 굵고 윤나는 초콜릿 필링 소용돌이(시나몬보다 굵고 적게 감김).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

SWIRL = dict(c=(0.27, 0.2), pitch=0.11, R=0.17, w=0.55, cols=('#2A120A', '#3A1C10', '#4A2616'), halo='#A06A44',
             rough=0.42, wob=1.2)


def build(lib):
    return build_campagne_variant(lib, 109, cut=('cap', -25, 0.17), tris=13500,
                                  crumb=lambda lib: crumb_material(lib, SHAPE, swirl=SWIRL))
