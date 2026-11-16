"""호박씨 깜빠뉴 (campagne--pumpkin-seed) — 실물 사진(네이버 이미지 검색 「단호박 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 단호박 깜빠뉴 겉에 초록 호박씨를 눌러 붙여 굽는다.
구성: 깜빠뉴 껍질 · 정수리에 몰린 초록 호박씨(납작한 물방울, 칼집 홈은 비운다).
"""
import slab
from boule_variant import SCORE, build_campagne_variant, in_score


def build(lib):
    seed = dict(make=lambda lib, nm, s, r: (slab.pebble(lib, nm, s * 2.2, s * 1.2, s * 0.45, r, taper=0.4), s * 0.22),
                mat=lambda lib: slab.plain_mat(lib, 'bit', '#55703A', '#6E8A48', rough=0.6, scale=60),
                n=42, size=(0.027, 0.035), zone=(0.0, 1.0), bias=1.2, sink=0.15, gap=0.0)
    return build_campagne_variant(lib, 151, bits=[seed], avoid=in_score(SCORE))
