"""호두 통밀빵 — 실물 사진(네이버 이미지 검색 「호두 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 대표 사진은 썬 면 — 베이지 갈색 속살에 굵게 부순 호두가 연갈색 조각으로 박히고, 속껍질 둘레가 보랏빛 갈색 테로 비친다.
구성: 통밀 껍질 · 오른쪽 앞 쐐기를 덜어낸 두 단면 = 통밀 속살 + 각지고 주름진 연갈색 호두 조각(보랏빛 속껍질 테, 크기 섞어 성기게).
"""
import wedge
from breads.wholewheat import blobs, crumb, variant


def walnuts(m, p, col, rough, h):
    d, rnd, keep = blobs(m, p, 6.0, 0.12, seed=11.0, stretch=(1.3, 1, 0.9), warp=0.45)  # 일그러짐 크게 = 부순 모서리
    nut = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.36, 0.38)), keep)
    skin = m.math('MULTIPLY', m.smooth(d, 0.27, 0.34), nut)  # 속껍질 테
    v = wedge.veins(m, p, scale=22, width=0.1, warp=1.5)  # 호두 속 주름
    nc = m.ramp(m.noise(p, scale=18, detail=3), [(0.3, '#A87A48'), (0.7, '#C49A64')])
    nc = m.mix(m.math('MULTIPLY', v, 0.6), nc, '#7E4E34')
    nc = m.mix(skin, nc, '#5E3428')
    col = m.mix(nut, col, nc)
    rough = m.mixf(nut, rough, 0.7)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, nut)),
               m.math('MULTIPLY', nut, m.math('SUBTRACT', 0.45, m.math('MULTIPLY', v, 0.4))))
    return col, rough, h


def build(lib):
    return variant(lib, 281, cut=('wedge', -5, 85), tris=12500, crumb=lambda lib: crumb(lib, extra=walnuts))
