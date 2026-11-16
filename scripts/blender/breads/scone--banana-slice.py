"""바나나 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 바나나는 으깨져 반죽에 섞이고(갈색 잔 점) 위에 캐러멜빛 아이싱을 부어 굳힌다.
구성: 윗면을 덮고 흘러내린 캐러멜 아이싱 · 그 위 짙은 캐러멜 줄 · 속살의 바나나 잔 점.
"""
import wedge


def build(lib):
    lib.reset(32)
    def extra(m, top_c, side_c, p, crust):
        fleck = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=30, randomness=1.0), 0.10, 0.18))
        return top_c, m.mix(m.math('MULTIPLY', fleck, 0.45), side_c, '#A87440')

    return wedge.build_scone(lib, 32, side=('#EED09A', '#F6DCAC', '#F0D4A0'), extra=extra, glaze=('#EBC88C', 0.95),
                             drizzle=('#8A4E1C', -18, 6.5, 0.07))
