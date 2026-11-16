"""동결건조 딸기 깜빠뉴 (campagne--strawberry-freezedried) — 실물 사진(네이버 이미지 검색 「딸기 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 썬 면은 분홍빛 속살에 딸기 조각, 겉은 깜빠뉴 — 동결건조 딸기는 연분홍 속이 비치는 바삭한 덩이.
구성: 깜빠뉴 껍질 · 정수리 칼집 곁에 얹은 동결건조 딸기 덩이(형상 있는 조각, 붉은 칠 없음).
"""
import wedge
from boule_variant import SCORE, build_campagne_variant, in_score


def berry_mat(lib):
    m = lib.Mat('bit')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, '#C8384A'), (0.7, '#E2606E')])
    core = m.smooth(m.noise(p, scale=55, detail=2), 0.5, 0.65)
    col = m.mix(m.math('MULTIPLY', core, 0.8), col, '#F4C8CC')  # 동결건조 속의 연분홍
    return m.out(col, 0.85, m.bump(m.noise(p, scale=120, detail=2), strength=0.4, distance=0.002))


def build(lib):
    bit = dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=5, height=0.55, flat=0.8), mat=berry_mat,
               n=10, size=(0.03, 0.055), zone=(0.05, 0.9), bias=1.2, sink=0.25, gap=0.03)
    return build_campagne_variant(lib, 103, bits=[bit], avoid=in_score(SCORE))
