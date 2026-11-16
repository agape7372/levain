"""비트 통밀빵 — 실물 사진(네이버 이미지 검색 「비트 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 비트 퓌레를 반죽에 섞어 속살이 분홍빛 자홍 빵색이고(덜 섞인 크림빛 결이 군데군데), 껍질은 붉은 기 도는 갈색이다.
구성: 적갈 통밀 껍질 · 오른쪽 넓은 쐐기를 덜어낸 두 단면 = 밝은 자홍 속살 + 크고 불규칙한 기공 + 덜 섞인 크림빛 결.
      짙은 와인색 속살(정식 1판)은 생고기로 읽혔고, 거의 검은 껍질도 밝혔다.
"""
import wedge
from breads.wholewheat import crumb, crust_material, variant

PAL = dict(ramp=('#6A2A1A', '#843A24', '#9C4A30'), low='#3A140C', groove='#4A1A10', mottle='#A85A44', light='#B86A50',
           dust='#B8948A')


def streaks(m, p, col, rough, h):
    v = wedge.veins(m, p, scale=3, width=0.035, warp=2.0)  # 덜 섞인 반죽 결
    v = m.math('MULTIPLY', v, m.smooth(m.noise(p, scale=3, detail=2), 0.55, 0.65))
    # 진한 흰 결(초안)은 고기 마블링으로 읽혔다 — 가늘고 옅게
    return m.mix(m.math('MULTIPLY', v, 0.4), col, '#E8B8BC'), rough, h


def build(lib):
    return variant(lib, 313, cut=('wedge', 15, 105), tris=12500,
                   crust=lambda lib: crust_material(lib, pal=PAL, dust_a=0.3),
                   crumb=lambda lib: crumb(lib, base=('#C25C78', '#D2748C'), pore='#94405A', deep_col='#64223A',
                                           rim='#5A2014', pore_a=1.0, holes=1.6, extra=streaks))
