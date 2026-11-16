"""초코 필링 식빵 (loaf--choco-filling) — 형상 · 껍질은 loaf_kit.build_loaf, 단면은 loaf_kit.crumb_material.

실물: 네이버 이미지 「초코 필링 식빵」(2026-11-16) — 썬 단면에 짙은 초콜릿 필링이 여러 겹 가는 띠로 비틀려 말려 들어가 크림빛 속살을 가른다(바브카 결). 겉 껍질은 보통 식빵 그대로.
구성: 왼끝(−X)을 한 장 썬 단면 · 크림빛 속살 + 크게 비틀린 여러 겹 초콜릿 소용돌이(팥 스월보다 가늘고 촘촘 · 윤기 조금) · 초콜릿이 스민 옅은 갈색 번짐.
"""
import loaf_kit as lk

CHOCO = dict(col=('#3A2014', '#5A3220'), halo=('#B88A62', 0.4), gloss=0.5)


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[
        dict(mask=lk.swirl(c=(0.02, 0.34), pitch=0.075, r=0.29, w=0.42, wob=5.0, wscale=1.8, aspect=0.9), **CHOCO)])


def build(lib):
    return lk.build_loaf(lib, seed=21, cut=-0.40, crumb=crumb, opts=dict(uv_weight={'crumb': 1.6}))
