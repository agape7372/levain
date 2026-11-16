"""피스타치오 깜빠뉴 (campagne--pistachio-piece) — 실물 사진(네이버 이미지 검색 「피스타치오 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 피스타치오 깜빠뉴는 칼집 사이 · 단면에 초록 조각이 비친다(크림을 채운 것도 많다).
구성: 깜빠뉴 껍질 · X 칼집 홈 안에 몰아 박은 초록 피스타치오 조각(보랏빛 속껍질 조금).
"""
import wedge
from boule_variant import SCORE, build_campagne_variant, in_score


def pista_mat(lib):
    m = lib.Mat('bit')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=20, detail=3), [(0.3, '#6A8830'), (0.7, '#88A444')])
    skin = m.smooth(m.noise(p, scale=35, detail=2), 0.58, 0.68)
    col = m.mix(m.math('MULTIPLY', skin, 0.7), col, '#7A4A3A')
    return m.out(col, 0.6)


def build(lib):
    nut = dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=5, height=0.6, flat=0.75), mat=pista_mat,
               n=20, size=(0.028, 0.042), zone=(0.0, 1.0), sink=0.3, gap=0.0, where=in_score(SCORE, margin=0.02))
    return build_campagne_variant(lib, 181, bits=[nut], tris=11500)
