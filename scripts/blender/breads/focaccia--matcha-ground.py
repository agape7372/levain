"""말차 포카치아 — 실물 사진(네이버 이미지 「말차 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 말차 가루를 섞은 반죽은 속이 쑥빛 초록이고, 구운 윗면은 초록에 금갈색이 얼룩지며 솟은 곳 · 테는 올리브 갈색으로 익는다.
      기름이 고인 딤플은 더 짙은 초록. 한 가지 초록으로 칠한 판은 비누로 읽혔다(두뇌 검수 규칙).
구성: 쑥빛 초록 판(윗면 금갈색 구움 얼룩 섞음 · 옆면 · 딤플은 더 짙게) · 금빛 기름 웅덩이 6 · 굵은 소금 26.
"""
import random

import flat_top
import slab

SEED = 104
L, W, T = 1.0, 0.74, 0.12


def baked(m, top_c, side_c, p, nz, dim):  # 구워진 얼룩 — 넓고 흐리게 금갈색을 섞는다
    w = m.math('MULTIPLY', m.smooth(m.noise(p, scale=4.5, detail=4, distortion=0.4), 0.45, 0.7), 0.6)
    return m.mix(m.math('MULTIPLY', w, m.math('SUBTRACT', 1.0, dim)), top_c, '#A8903E'), side_c


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    oil = slab.scatter(rnd, 6, L - 0.14, W - 0.14, 0.22)
    pool = slab.plain_mat(lib, 'goldoil', '#B48A14', '#C89C22', rough=0.12, scale=20)
    return flat_top.build_focaccia_top(
        lib, SEED, crust=baked, pool=pool, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.075, oil_d=0.028,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=26, salt_size=(0.018, 0.026),
        crust_kw=dict(top=('#68862E', '#76943A', '#86A246'), brown='#6E6426', dimple='#4A6424',
                      side=('#5E7C30', '#6A883A'), pore='#46602A'),
        opts=dict(ao_strength={'goldoil': 0.25}, grade={'goldoil': 0.4}))
