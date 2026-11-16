"""무화과 통밀빵 — 실물 사진(네이버 이미지 검색 「무화과 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 대표 사진은 썬 면 — 통밀 속살에 반 가른 건무화과가 박혀, 얇은 껍질 안 자줏빛 갈색 과육에 금빛 씨가 빽빽하다.
구성: 통밀 껍질 · 정면을 깊게 덜어낸 둥근 단면 하나 = 통밀 속살 + 눈물꼴 · 찌그러진 무화과 단면(크기 섞어, 얇은 테,
      자줏빛 갈색 과육 + 빽빽한 금빛 씨 결). 둥근 원반 + 짙은 테 + 주황 속(정식 1판)은 소시지 단면으로 읽혔다.
"""
from breads.wholewheat import blobs, crumb, variant


def figs(m, p, col, rough, h):
    d, rnd, keep = blobs(m, p, 5.0, 0.12, seed=5.0, stretch=(1, 1, 0.7), warp=0.55, tear=1.8, mix=0.9)
    fig = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.4, 0.42)), keep)
    skin = m.math('MULTIPLY', m.smooth(d, 0.36, 0.4), fig)  # 얇은 껍질 테
    cell = m.voronoi(m.mapping(p, scale=(1.0, 1.0, 1.5)), scale=170, randomness=1.0)
    seed = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(cell, 0.34, 0.46)),
                  m.math('MULTIPLY', m.smooth(m.noise(p, scale=60, detail=2), 0.3, 0.45), m.math('SUBTRACT', fig, skin)))
    core = m.math('SUBTRACT', 1.0, m.smooth(d, 0.1, 0.34))  # 가운데 호박빛 → 껍질 쪽 자줏빛(보라 원반 + 흰 점 = 살라미, 초안)
    fc = m.mix(core, m.ramp(m.noise(p, scale=24, detail=3), [(0.3, '#5A2C30'), (0.7, '#6E3A34')]), '#A8703A')
    fc = m.mix(seed, fc, '#E2B65A')
    fc = m.mix(skin, fc, '#3C1E1A')
    col = m.mix(fig, col, fc)
    rough = m.mixf(fig, rough, 0.6)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, fig)),
               m.math('MULTIPLY', fig, m.math('ADD', 0.3, m.math('MULTIPLY', seed, 0.35))))
    return col, rough, h


def build(lib):
    return variant(lib, 283, cut=('cap', 30, 0.1), tris=12500, crumb=lambda lib: crumb(lib, extra=figs))
