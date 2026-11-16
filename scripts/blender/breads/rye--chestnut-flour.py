"""밤 호밀빵 (rye--chestnut-flour) — 형상 · 껍질은 rye_kit.build_rye, 단면은 rye_kit.crumb.

실물: 네이버 이미지 「밤 호밀빵」(2026-11-16) — 대표 모습이 반으로 가른 단면: 밤가루로 따뜻한 황갈 속살에 노란 공주밤 덩이가 크게 박혀 있다. 껍질은 밤색, 밀가루가 살짝.
구성: 껍질 톤을 밤색 쪽으로 살짝 · 가운데를 갈라 두 쪽을 책처럼(다른 각으로) 벌린 단면 = 황갈 밤가루 속살 + 크고 성긴 노란 밤 덩이(가장자리 갈색 속껍질).
"""
import rye_kit as rk

PAL = dict(crust=('#663210', '#784016', '#8C4E1E'), ear='#A86E40')
NUT = [(-0.12, 0.095, 0.05, 25, 1.25, 0, 0), (0.1, 0.16, 0.042, -40, 1.15, 0, 0),
       (0.07, 0.06, 0.03, 70, 1.3, 0, 0), (-0.04, 0.205, 0.026, 5, 1.2, 0, 0)]


def crumb(lib):
    return rk.crumb(lib, crumb=('#7C5C3A', '#8C6A46'), pore='#4A341E', rim=('#5A2C10', 0.009), fills=[
        dict(mask=rk.bits(NUT, warp=0.45), col=('#94621E', '#94621E'), halo=('#5E4428', 0.35), gloss=0.5),
        dict(mask=rk.bits([(u, v, r * 0.84, a, e, 0, 0) for u, v, r, a, e, *_ in NUT], warp=0.45),
             col=('#D8A01C', '#E8B834'), gloss=0.5)])


def build(lib):
    return rk.build_rye(lib, seed=47, crust=dict(pal=PAL), cut=('split', 0.02, 50, 30, 0.03), crumb=crumb, angle=95,
                        opts=dict(uv_weight={'crumb': 1.6}))
