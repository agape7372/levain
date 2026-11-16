"""비트 식빵 (loaf--beet-puree) — 형상 · 껍질은 loaf_kit.build_loaf(색), 썬 한 장은 cut_slab, 단면은 crumb_material.

실물: 네이버 이미지 「비트 식빵」(2026-11-16) — 뚜껑은 붉은 기 도는 갈색으로 구워졌고 옆벽은 장밋빛, 썬 속살은 고른 분홍(옅은 결).
구성: 반죽색은 단면으로 — 적갈색 뚜껑 · 옅은 장밋빛 옆벽 · 끝에서 한 장 떠 기대 세운 분홍 단면(옅은 결이 흐른다).
"""
import loaf_kit as lk

PAL = dict(crust=('#94503C', '#A05A42', '#AA6648'), ridge='#80422E', shoulder='#B67458', blister='#6A3226',
           side=('#ECB4B0', '#F0C0BC'), kiss='#D49690', shred='#F4CCC8', pore='#D8A0A0')


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#E696A0', '#EEA6AE'), pore='#C87884', rim=('#C88078', 0.012),
                             rim_top=(lk.HS, '#8A4634'), fills=[dict(
                                 mask=lk.marble(scale=1.7, width=0.05, warp=2.4, stretch=(1.0, 1.5, 1.0), seed=5.0),
                                 col=('#F4C6C6', '#F8D4D0'), halo=None, gloss=0.9)])


def build(lib):
    return lk.build_loaf(lib, seed=55, pal=PAL, cut=-0.28, crumb=crumb, slab=dict(t=0.07, lean=30),
                         opts=dict(uv_weight={'crumb': 1.6}))
