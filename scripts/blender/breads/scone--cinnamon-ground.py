"""시나몬 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 반죽이 짙은 금갈색 · 옆면에 얇은 시나몬 설탕 층 한 줄 · 흰 아이싱 줄(대리석 무늬 아님).
구성: 시나몬빛 윗면 · 옆면의 시나몬 층 · 흰 아이싱 줄.
"""
import wedge


def build(lib):
    lib.reset(37)
    def extra(m, top_c, side_c, p, crust):
        return top_c, wedge.layer(m, p, side_c, '#8A4A1E', 0.21, 0.02)

    return wedge.build_scone(lib, 37, top=('#BE7628', '#CE8A38', '#DA9C4A'), side=('#EECB94', '#F6D8A6', '#F0D09C'),
                             extra=extra, drizzle=('#FBF4E4', 15, 8.0, 0.075))
