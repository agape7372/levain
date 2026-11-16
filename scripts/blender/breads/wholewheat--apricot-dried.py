"""살구 통밀빵 — 실물 사진(네이버 이미지 검색 「살구 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 대표 사진은 썬 면 — 회갈색 통밀 속살에 썬 건살구가 선명한 주황 조각으로 박힌다(납작하고 모난 덩이, 가장자리가 짙다).
구성: 통밀 껍질 · 오른쪽을 얕게 덜어낸 둥근 단면 하나 = 통밀 속살 + 주황 건살구 조각(모나게, 크기 섞어, 테는 한 단 짙은 주황, 윤기 살짝).
"""
from breads.wholewheat import blobs, crumb, variant


def apricots(m, p, col, rough, h):
    d, rnd, keep = blobs(m, p, 5.5, 0.35, seed=13.0, stretch=(1.2, 1.2, 0.8), warp=0.45)
    a = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.36, 0.38)), keep)
    edge = m.math('MULTIPLY', m.smooth(d, 0.3, 0.36), a)
    ac = m.ramp(m.noise(p, scale=22, detail=3), [(0.3, '#C05408'), (0.7, '#D2660C')])
    ac = m.mix(edge, ac, '#8C3804')
    col = m.mix(a, col, ac)
    rough = m.mixf(a, rough, 0.72)  # 0.45는 방 반사가 윗면을 허옇게 씻었다(정식 1판)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, a)), m.math('MULTIPLY', a, 0.4))
    return col, rough, h


def build(lib):
    return variant(lib, 307, cut=('cap', 55, 0.24), tris=12500, crumb=lambda lib: crumb(lib, extra=apricots))
