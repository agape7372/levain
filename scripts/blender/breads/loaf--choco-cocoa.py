"""초코 식빵 (loaf--choco-cocoa) — 형상 · 껍질은 loaf_kit.build_loaf(색), 썬 한 장은 cut_slab, 단면은 crumb_material + marble.

실물: 네이버 이미지 「초코 식빵」(2026-11-16) — 코코아 반죽이라 구운 뚜껑은 짙은 초콜릿 갈색, 옆벽은 그보다 옅은 코코아빛, 속살은 고른 코코아색에 흰 반죽 결이 섞인 마블이 흔하다.
구성: 반죽색은 단면으로 — 짙게 구운 코코아 뚜껑 · 옅은 코코아 옆벽 · 끝에서 한 장 떠 기대 세운 단면(코코아 속살 + 크림 마블 결).
"""
import loaf_kit as lk

PAL = dict(crust=('#5C3420', '#683C26', '#74462E'), ridge='#4A2A18', shoulder='#7E5034', blister='#3E2214',
           side=('#9C6E50', '#A6785A'), kiss='#86583E', shred='#B08868', pore='#7E5440')


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#7C4E34', '#88583C'), pore='#5E3826', rim=('#5A3420', 0.012),
                             rim_top=(lk.HS, '#3E2416'), fills=[dict(
                                 mask=lk.marble(scale=1.8, width=0.04, warp=2.2, stretch=(1.0, 1.4, 1.0), seed=7.0),
                                 col=('#EAD2A6', '#F2DCB4'), halo=('#A47A58', 0.5), gloss=0.9)])


def build(lib):
    return lk.build_loaf(lib, seed=41, pal=PAL, cut=-0.28, crumb=crumb, slab=dict(t=0.07, lean=30),
                         opts=dict(uv_weight={'crumb': 1.6}))
