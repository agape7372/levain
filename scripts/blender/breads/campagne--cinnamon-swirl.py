"""시나몬 스월 깜빠뉴 — 실물 사진(네이버 이미지 검색 「시나몬 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 검색 결과는 대부분 시나몬롤이고 깜빠뉴 사진은 몇 장뿐이다 — 겉은 깜빠뉴, 반죽에 시나몬 설탕이 갈색 결로 말려 있다.
      속을 봐야 읽히는 종이라 썬 면의 소용돌이로 보인다(시나몬롤의 소용돌이가 이 메뉴의 얼굴).
구성: 깜빠뉴 껍질 · 왼쪽 앞 쐐기를 덜어낸 두 단면 = 크림빛 속살 + 시나몬 소용돌이(무광).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

SWIRL = dict(c=(0.25, 0.22), pitch=0.07, R=0.21, w=0.40, cols=('#6E3210', '#88441A', '#A05A26'), halo='#C88A4E',
             rough=0.62, wob=1.4)


def build(lib):
    return build_campagne_variant(lib, 71, cut=('wedge', -62, 28), tris=13500,
                                  crumb=lambda lib: crumb_material(lib, SHAPE, swirl=SWIRL))
