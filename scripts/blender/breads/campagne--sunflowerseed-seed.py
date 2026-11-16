"""해바라기씨 깜빠뉴 (campagne--sunflowerseed-seed) — 실물 사진(네이버 이미지 검색 「해바라기씨 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 사진이 드물다 — 씨 깜빠뉴는 겉에 길쭉한 해바라기씨를 눌러 붙여 볶은 회베이지~연갈색, 끝이 노릇하다.
구성: 고리 밀가루를 뺀 깜빠뉴 껍질 · 정수리에 몰린 길쭉한 볶은 해바라기씨(끝 노릇, 칼집 홈은 비운다). 흰 씨(정식 1판)는 쌀알 · 구더기로 읽혔다.
"""
import slab
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, in_score


def seed_mat(lib):
    """볶은 회베이지 ~ 연갈색, 뾰족한 +X 끝만 노릇(호밀 rye_kit.sunflower 색). 흰 씨는 쌀알 · 구더기로 읽혔다"""
    m = lib.Mat('bit')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=30, detail=2), [(0.3, '#9A8460'), (0.7, '#A88458')])
    col = m.mix(m.smooth(m.sep(p)[0], 0.01, 0.035), col, '#C08A38')
    return m.out(col, 0.66)


def make(lib, nm, s, r):
    ob = slab.pebble(lib, nm, s * 2.4, s * 1.1, s * 0.4, r, taper=0.5)
    lib.tag_local(ob)
    off = r.uniform(0, 50)  # 씨마다 다른 얼룩
    for d in ob.data.attributes['lpos'].data:
        v = d.vector
        d.vector = (v[0], v[1], v[2] + off)
    return ob, s * 0.2


def build(lib):
    seed = dict(make=make, mat=seed_mat,
                n=50, size=(0.03, 0.038), zone=(0.0, 1.0), bias=1.3, sink=0.2, gap=0.0)
    return build_campagne_variant(lib, 193, bits=[seed], avoid=in_score(SCORE),
                                  crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.0))
