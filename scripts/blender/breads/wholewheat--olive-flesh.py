"""올리브 통밀빵 — 실물 사진(네이버 이미지 검색 「올리브 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 대표 사진은 썬 면 — 베이지 갈색 통밀 속살에 검은 올리브가 고리(씨 뺀 단면) · 반달 · 덩이로 박혀 윤난다. 껍질은 통밀 그대로.
구성: 통밀 껍질 · 왼쪽 앞을 덜어낸 둥근 단면 하나 = 통밀 속살 + 검보라 올리브(고리 반 · 통 단면 반, 크기 섞어, 윤기).
"""
from breads.wholewheat import blobs, crumb, variant


def olives(m, p, col, rough, h):
    d, rnd, keep = blobs(m, p, 7.5, 0.3, seed=3.0, stretch=(1, 1, 0.8), warp=0.2)
    body = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.32, 0.34)), keep)
    hole = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.15, 0.17)), m.smooth(rnd, 0.7, 0.71))  # 씨 뺀 고리(칸 절반)
    olive = m.math('MULTIPLY', body, m.math('SUBTRACT', 1.0, hole))
    oc = m.ramp(m.noise(p, scale=30, detail=2), [(0.3, '#2C201C'), (0.7, '#42302A')])
    col = m.mix(olive, col, oc)
    rough = m.mixf(olive, rough, 0.36)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, olive)), m.math('MULTIPLY', olive, 0.4))
    return col, rough, h


def build(lib):
    return variant(lib, 271, cut=('cap', -35, 0.2), tris=12500, crumb=lambda lib: crumb(lib, extra=olives))
