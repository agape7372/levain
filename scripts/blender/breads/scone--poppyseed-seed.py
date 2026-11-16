"""포피시드 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 옅은 반죽에 아주 잔 씨가 촘촘 · 흰 아이싱 줄.
구성: 잔 양귀비씨 점 · 흰 아이싱 줄.
"""
import wedge


def build(lib):
    lib.reset(45)
    def extra(m, top_c, side_c, p, crust):
        d = m.voronoi(p, scale=70, randomness=1.0)
        keep = m.smooth(m.sep(m.voronoi(p, scale=70, randomness=1.0, out='Color'))[0], 0.40, 0.42)
        dot = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.20, 0.28)), keep)
        return m.mix(dot, top_c, '#3A3C4A'), m.mix(dot, side_c, '#4A4C5A')

    return wedge.build_scone(lib, 45, top=('#E6AE56', '#F0C06C', '#F8D088'), extra=extra, drizzle=('#FBF4E4', -15, 8.0, 0.07))
