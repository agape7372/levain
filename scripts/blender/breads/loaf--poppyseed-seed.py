"""포피시드 식빵 (loaf--poppyseed-seed) — 형상 · 껍질은 loaf_kit.build_loaf, 씨는 뚜껑 덧칠(fx)로 빽빽이.

실물: 네이버 이미지 「포피시드 식빵」(2026-11-16) — 반죽에 섞은 양귀비씨가 뚜껑 겉에 빽빽이 드러나 구운 금갈색 위가 잿빛 푸른 점결로 덮였다. 옆벽 · 속은 옅은 크림.
구성: 껍질 쪽 — 뚜껑 전체를 빽빽이 덮은 잿빛 푸른 씨결(두 겹 보로노이 · 크기 섞음, 어깨에서만 조금 성김) · 단면 없음(밝은 속살의 짙은 점 금지).
"""
import loaf_kit as lk


def seeds(m, p, cap, col, rough, h):
    k = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=62, randomness=1.0), 0.20, 0.30))
    k2 = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, loc=(3.1, 1.7, 0.4)), scale=48, randomness=1.0), 0.16, 0.26))
    cov = m.math('MULTIPLY', cap, m.smooth(m.sep(m.lnrm())[2], 0.35, 0.7))
    k = m.math('MULTIPLY', m.math('MAXIMUM', k, k2), cov)
    sc = m.ramp(m.noise(p, scale=160, detail=1), [(0.3, '#2A2C3C'), (0.7, '#404256')])
    col = m.mix(k, col, sc)
    return col, m.mixf(k, rough, 0.6), m.math('ADD', h, m.math('MULTIPLY', k, 0.5))


def build(lib):
    return lk.build_loaf(lib, seed=59, pal=dict(crust=('#C8782A', '#D48834', '#DE963E')), fx=seeds)
