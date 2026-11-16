"""생크랜베리 깜빠뉴 (campagne--cranberry-fresh) — 실물 사진(네이버 이미지 검색 「크랜베리 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 썬 면에 구운 생크랜베리 — 구우며 터져 짙은 루비색 반달 · 찢긴 조각으로 박히고 둘레에 즙이 옅게 번진다.
구성: 깜빠뉴 껍질 · 왼쪽 쐐기 단면 = 크림 베이지 속살 + 크기 · 모양 섞은 와인~루비 조각(반달 · 찢김) + 옅은 즙 번짐.
      붉은 테 두른 분홍 동그라미(정식 1판)는 뾰루지 · 눈알로 읽혔다.
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

BERRY = dict(scale=6.5, cover=0.28, r=0.36, cols=('#6E1022', '#8A1A2C'), cols2=('#8E1E30', '#A42A3A'), half=0.6, jag=0.6,
             size_var=0.6, stretch=(1, 1, 1.3), rough=0.42, seed=41.0, halo=('#C88E88', 0.35))


def build(lib):
    return build_campagne_variant(lib, 127, cut=('wedge', -75, 15), tris=13500,
                                  crumb=lambda lib: crumb_material(lib, SHAPE, base=('#D4AA78', '#E0B886'), pieces=BERRY))
