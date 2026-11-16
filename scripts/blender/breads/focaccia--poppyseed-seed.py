"""포피시드 포카치아 — 실물 사진(네이버 이미지 「포피시드 포카치아」 · 포피시드 베이글, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 달걀물을 바른 윗면에 양귀비씨를 빈틈없이 뿌려 굽는다 — 아주 잔 청회색 씨가 윗면 전체를 덮어 판이 회색 점묘로 보이고,
      기름이 고인 딤플 바닥만 씨가 엷다.
구성: 윗면 전체를 덮은 잔 청흑색 씨(껍질 그림, 낱알이 아니라 덮개) · 기름 웅덩이 6 · 옆면은 맨 반죽.
      씨 셋은 덮는 자리로 갈린다: 포피 = 윗면 전체 청흑 고운 점 · 아마씨 = 금갈 낱알(가운데 빽빽) · 해바라기씨 = 가운데 큰 씨 무더기.
"""
import random

import flat_top
import slab

SEED = 87
L, W, T = 1.0, 0.74, 0.12


def coat(m, top_c, side_c, p, nz, dim):
    seeds = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=200), 0.38, 0.5))
    seeds = m.math('MULTIPLY', seeds, m.math('SUBTRACT', 1.0, m.math('MULTIPLY', dim, 0.75)))
    return m.mix(seeds, top_c, m.ramp(m.noise(p, scale=260), [(0.4, '#1C1E26'), (0.6, '#30343F')])), side_c


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    oil = slab.scatter(rnd, 6, L - 0.14, W - 0.14, 0.22)
    return flat_top.build_focaccia_top(
        lib, SEED, crust=coat, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.075, oil_d=0.026,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=0)
