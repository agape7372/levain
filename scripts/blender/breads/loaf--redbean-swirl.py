"""팥 스월 식빵 (loaf--redbean-swirl) — 형상 · 껍질은 loaf_kit.build_loaf, 단면은 loaf_kit.crumb_material.

실물: 네이버 이미지 「팥 스월 식빵」(2026-11-16) — 단면에 짙은 팥앙금이 굵은 띠로 두세 바퀴 말려 있다(롤 모양). 겉은 윤기 도는 금갈색 보통 식빵.
구성: 왼끝(−X)을 한 장 썬 단면 · 옅은 속살 + 굵은 팥앙금 소용돌이(자줏빛 갈색, 윤기 조금) · 앙금 속에 통팥 알 결(짙은 알 + 옅은 테) · 앙금이 스민 분홍빛 갈색 번짐.
"""
import math
import random

import loaf_kit as lk


SWIRL = lk.swirl(c=(0.0, 0.31), pitch=0.1, r=0.26, w=0.56, wob=1.0, wscale=4.0, aspect=1.05)
# 앙금 속 통팥 알 — 소용돌이 둘레에 흩은 자리 중 띠 안에 든 것만 남긴다(띠 마스크를 곱한다)
_R = random.Random(23)
BEANS = lk.pieces([(0.24 * math.sqrt(t) * math.cos(a), 0.31 + 0.24 * math.sqrt(t) * math.sin(a), _R.uniform(0.011, 0.015),
                    _R.uniform(0, 180), 1.45) for t, a in ((_R.uniform(0.05, 1), _R.uniform(0, math.tau)) for _ in range(40))],
                  warp=0.15, wscale=60)


def beans(m, u, v, p):
    b, _ = SWIRL(m, u, v, p)
    k, h = BEANS(m, u, v, p)
    b = m.smooth(b, 0.6, 0.95)
    return m.math('MULTIPLY', k, b), m.math('MULTIPLY', h, b)


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[
        dict(mask=SWIRL, col=('#4A1C20', '#66302E'), halo=('#C49274', 0.4), gloss=0.55),
        dict(mask=beans, col=('#36101A', '#481820'), halo=('#86423E', 0.7), gloss=0.35)])


def build(lib):
    return lk.build_loaf(lib, seed=23, cut=-0.40, crumb=crumb, opts=dict(uv_weight={'crumb': 1.6}))
