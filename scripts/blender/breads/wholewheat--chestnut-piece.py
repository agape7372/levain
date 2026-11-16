"""밤 통밀빵 — 실물 사진(네이버 이미지 검색 「밤 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 대표 사진은 썬 면 — 베이지 속살에 당조림 밤이 노란 덩이로 큼직하게 박힌다(둥글고 모난 덩이, 군데군데 갈색 겉면).
구성: 통밀 껍질 · 앞쪽 넓은 쐐기를 덜어낸 두 단면 = 통밀 속살 + 큰 노란 밤 덩이(드물게, 테는 얇은 갈색, 매끈하고 살짝 솟음).
"""
from breads.wholewheat import blobs, crumb, variant


def chestnuts(m, p, col, rough, h):
    d, rnd, keep = blobs(m, p, 4.5, 0.18, seed=17.0, stretch=(1, 1, 0.9), warp=0.35)
    c = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.4, 0.42)), keep)
    edge = m.math('MULTIPLY', m.smooth(d, 0.35, 0.4), c)
    cc = m.ramp(m.noise(p, scale=14, detail=3), [(0.3, '#E2B23C'), (0.7, '#F2CC5A')])
    cc = m.mix(m.math('MULTIPLY', edge, 0.85), cc, '#9A6224')
    col = m.mix(c, col, cc)
    rough = m.mixf(c, rough, 0.75)  # 윤기는 방 반사로 허옇게 씻긴다(살구 정식 1판)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, c)), m.math('MULTIPLY', c, 0.35))
    return col, rough, h


def build(lib):
    return variant(lib, 311, cut=('wedge', -50, 40), tris=12500, crumb=lambda lib: crumb(lib, extra=chestnuts))
