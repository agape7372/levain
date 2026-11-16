"""포피시드 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 연한 반죽에 양귀비씨가 고르게 섞인 잔 점박이 판(체다 포피 크래커) · 씨를 윗면에 듬뿍 덮은 판도 흔하다.
구성: 금빛 판 · 윗면을 빽빽이 덮은 푸른 잿빛 양귀비씨 층(무늬, 가장자리 띠는 비움). 드문드문 박힌 잔 점 초안은 밝은 면의 짙은 점(벌레)이라 덮개로 바꿨다.
"""
import slab


def build(lib):
    def extra(m, col, p, nz):
        d = m.voronoi(p, scale=150, randomness=1.0)
        tone = m.ramp(m.sep(m.voronoi(p, scale=150, randomness=1.0, out='Color'))[0], [(0.2, '#343846'), (0.8, '#5C6474')])
        dot = m.math('SUBTRACT', 1.0, m.smooth(d, 0.6, 0.72))  # 0.32~0.44 는 듬성한 잔 점이라 모래 · 때로 읽혔다
        rim = m.math('SUBTRACT', 1.0, m.smooth(m.attr('edge'), 0.2, 0.6))  # 테 가까이는 덜 덮였다
        cover = m.math('MULTIPLY', m.math('MULTIPLY', dot, m.smooth(nz, 0.6, 0.85)), rim)
        return m.mix(m.math('MULTIPLY', cover, 0.95), col, tone)

    return slab.build_cracker(lib, seed=18, pal=dict(speck=None), extra=extra)
