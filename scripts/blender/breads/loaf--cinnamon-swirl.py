"""시나몬 스월 식빵 (loaf--cinnamon-swirl) — 형상 · 껍질은 loaf_kit.build_loaf, 썬 한 장은 cut_slab, 단면은 crumb_material + swirl.

실물: 네이버 이미지 「시나몬 스월 식빵」(2026-11-16) — 썬 단면에 계피 설탕 줄이 가늘고 촘촘하게 여러 겹 감겨 있다(갈색 선, 감김 사이 크림 속살이 넓다). 겉은 보통 식빵.
구성: 끝에서 한 장 떠 기대 세운 단면 — 크림 속살에 가늘게 여러 번 감긴 계피 줄(짙은 계피색 · 옅은 번짐).
(팥 = 굵은 띠 두세 겹, 건포도 = 옅은 띠 + 알, 이쪽 = 가는 줄 여러 겹으로 가른다)
"""
import loaf_kit as lk


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[dict(
        mask=lk.swirl(c=(0.01, 0.33), pitch=0.052, r=0.30, w=0.24, wob=0.7, wscale=3.5, aspect=0.95),
        col=('#8A4620', '#A0582C'), halo=('#CC9A68', 0.45), gloss=0.7)])


def build(lib):
    return lk.build_loaf(lib, seed=47, cut=-0.28, crumb=crumb, slab=dict(t=0.07, lean=24),
                         opts=dict(uv_weight={'crumb': 1.6}))
