"""말차 식빵 (loaf--matcha-ground) — 형상 · 껍질은 loaf_kit.build_loaf, 썬 한 장은 cut_slab, 단면은 crumb_material.

실물: 네이버 이미지 「말차 식빵」(2026-11-16) — 뚜껑은 노릇하게 구워져 올리브 갈색, 옆벽은 옅은 말차빛, 썬 속살이 초록(크림 결이 섞인 마블이 흔하다).
구성: 반죽색은 단면으로 — 구운 뚜껑 · 옅은 말차 옆벽 · 끝에서 한 장 떠 기대 세운 단면(초록 속살 + 크림 마블 결).
통째 초록으로 칠한 첫 판은 비누 · 지점토로 읽혔다(두뇌 검토 11-16).
"""
import loaf_kit as lk

PAL = dict(crust=('#9C7432', '#AA8238', '#B68E42'), ridge='#84602A', shoulder='#BC9A52', blister='#6E5222',
           side=('#D6DCA8', '#DEE4B6'), kiss='#BDB880', shred='#E4E8C4', pore='#B4BC88')


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#9DB862', '#AFC672'), pore='#86A050', rim=('#B4AE66', 0.012),
                             rim_top=(lk.HS, '#94703A'), fills=[dict(
                                 mask=lk.marble(scale=2.0, width=0.045, warp=2.6, stretch=(1.0, 1.5, 1.0), seed=3.0),
                                 col=('#EDE2B4', '#F5EBC6'), halo=('#C9D49A', 0.5), gloss=0.9)])


def build(lib):
    return lk.build_loaf(lib, seed=27, pal=PAL, cut=-0.28, crumb=crumb, slab=dict(t=0.07, lean=26),
                         opts=dict(uv_weight={'crumb': 1.6}))
