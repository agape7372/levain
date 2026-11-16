"""블루베리 스콘 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 블루베리가 터져 속살에 보랏빛 결로 번지고, 위에 블루베리 잼 · 보랏빛 아이싱을 얹은 것이 흔하다.
구성: 윗면을 덮고 흘러내린 연보라 블루베리 아이싱 · 칼 단면에 말려 든 보랏빛 과즙 결. 알 · 얼룩은 밝은 면의 짙은 점(벌레)으로 읽혀 뺐다.
"""
import wedge


def build(lib):
    lib.reset(34)

    def extra(m, top_c, side_c, p, crust):
        v = wedge.veins(m, p, scale=2.4, width=0.05, warp=1.2)  # 굵고 진한 결은 대리석 · 실핏줄로 읽혔다 — 옅게 번진 과즙 결
        return top_c, m.mix(m.math('MULTIPLY', v, 0.4), side_c, '#9A78B4')

    return wedge.build_scone(lib, 34, extra=extra, glaze=('#BBA0DC', 0.95))
