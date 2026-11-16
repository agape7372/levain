"""단호박 식빵 (loaf--pumpkin-puree) — 형상 · 껍질은 loaf_kit.build_loaf(색), 단면은 crumb_material + pieces.

실물: 네이버 이미지 「단호박 식빵」(2026-11-16) — 뚜껑은 주황 금빛으로 구워졌고 옆벽은 노란빛, 썬 속살은 짙은 노랑에 주황 단호박 조각(깍둑, 초록 껍질이 붙은 것도)이 박혔다.
구성: 반죽색은 단면으로 — 금주황 뚜껑 · 옅은 노랑 옆벽 · 끝을 썬 노란 단면 + 깍둑 단호박 조각(주황, 몇은 한쪽에 초록 껍질).
"""
import loaf_kit as lk

PAL = dict(crust=('#CC7420', '#D8842C', '#E29438'), shoulder='#EAA850',
           side=('#F6D684', '#F8DE96'), kiss='#E2AE52', shred='#FAE2A4', pore='#DCB466')
CUBES = [(-0.14, 0.50, 0.040, 20, 1.1), (0.12, 0.40, 0.034, -15, 1.2), (-0.04, 0.20, 0.036, 35, 1.0),
         (0.18, 0.14, 0.026, 5, 1.2), (-0.21, 0.24, 0.024, -30, 1.1), (0.06, 0.60, 0.022, 50, 1.3)]
SKIN = [(u - 0.9 * r, v + 0.2 * r, r * 0.42, a + 90, 2.2) for u, v, r, a, e in CUBES[:3]]


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#F0C450', '#F4CE62'), pore='#D4A240', rim=('#D69A3A', 0.012),
                             rim_top=(lk.HS, '#B86A20'), fills=[
        dict(mask=lk.pieces(CUBES, warp=0.25, box=True), col=('#E4721A', '#EE8626'), halo=('#F2B048', 0.35), gloss=0.5),
        dict(mask=lk.pieces(SKIN, warp=0.2), col=('#4E6A26', '#5E7A2E'), halo=None, gloss=0.5)])


def build(lib):
    return lk.build_loaf(lib, seed=49, pal=PAL, cut=-0.40, crumb=crumb,
                         opts=dict(uv_weight={'crumb': 1.6}, grade={'*': 1.0, 'crumb': 0.5}))
