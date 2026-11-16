"""말린 로즈마리 포카치아 — 실물 사진(네이버 이미지 「로즈마리 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 말린 로즈마리를 잘게 부숴 기름과 섞어 윗면에 고루 바른다 — 올리브 갈색 잎 부스러기가 윗면을 덮고 딤플엔 기름이 고인다.
      생 잔가지(rosemary-sprig)와는 「가지 없이 윗면을 덮은 잔 부스러기 · 마른 색」으로 갈린다.
      잎을 한 줌씩 무리로 올린 첫 판은 64px에서 작은 거미 · 벌레로 읽혔다 → 껍질 그림으로 덮는다.
구성: 윗면을 덮은 마른 잎 부스러기(짧은 결, 딤플 바닥은 엷게) · 기름 웅덩이 8 · 굵은 소금 26.
      덮개 셋은 색 · 결로 갈린다: 포피 = 청흑 점 · 아마씨 = 갈색 띠 · 말린 로즈마리 = 올리브 결.
"""
import random

import flat_top
import slab

SEED = 19
L, W, T = 1.0, 0.74, 0.12


def herbs(m, top_c, side_c, p, nz, dim):
    flecks = m.math('ADD', m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, rot=(0, 0, 0.5), scale=(1, 3.2, 1)), scale=60), 0.26, 0.38)),
                    m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, rot=(0, 0, 2.1), scale=(1, 3.2, 1)), scale=60), 0.26, 0.38)))
    flecks = m.math('MULTIPLY', m.math('MINIMUM', flecks, 1.0), m.math('SUBTRACT', 1.0, m.math('MULTIPLY', dim, 0.7)))
    return m.mix(flecks, top_c, m.ramp(m.noise(p, scale=90), [(0.4, '#38441A'), (0.6, '#4E5826')])), side_c


def build(lib):
    lib.reset(SEED)
    oil = slab.scatter(random.Random(SEED), 8, L - 0.12, W - 0.12, 0.17)
    return flat_top.build_focaccia_top(
        lib, SEED, crust=herbs, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.065, oil_d=0.03,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=26, salt_size=(0.018, 0.026))
