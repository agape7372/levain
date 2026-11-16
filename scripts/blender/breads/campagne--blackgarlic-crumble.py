"""흑마늘 깜빠뉴 (campagne--blackgarlic-crumble) — 실물 사진(네이버 이미지 검색 「흑마늘 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 사진이 드물다(마늘빵이 많다) — 흑마늘은 끈적한 검갈색 쪽으로, 단면에 길쭉하게 박힌다.
구성: 깜빠뉴 껍질 · 왼쪽 쐐기 단면 = 크림 속살(흑마늘 물이 옅게 밴 테) + 길쭉한 검갈색 흑마늘 쪽(윤기).
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

GARLIC = dict(scale=7.5, cover=0.35, r=0.34, cols=('#2E1C12', '#44301E'), edge='#6A4628', jag=0.35, stretch=(1, 1, 0.6), size_var=0.5,
              rough=0.4, seed=67.0, halo=('#B89064', 0.4))


def build(lib):
    return build_campagne_variant(lib, 211, cut=('wedge', -85, 5), tris=13500,
                                  crumb=lambda lib: crumb_material(lib, SHAPE, pieces=GARLIC))
