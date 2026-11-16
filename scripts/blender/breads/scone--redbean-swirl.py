"""팥 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 팥앙금을 사이에 끼워 옆면에 굵은 팥빛 층이 보이고 윗면에 팥알이 드문드문 비친다.
구성: 앙버터 샌드: 옆면을 가로지르는 굵은 팥앙금 층 + 그 위 얇은 버터 층.
"""
import wedge


def build(lib):
    lib.reset(47)
    def extra(m, top_c, side_c, p, crust):
        side_c = wedge.layer(m, p, side_c, '#5E2630', 0.20, 0.06)
        return top_c, wedge.layer(m, p, side_c, '#F8E492', 0.285, 0.022)

    return wedge.build_scone(lib, 47, extra=extra)
