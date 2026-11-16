"""비트 포카치아 — 실물 사진(네이버 이미지 「비트 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 비트 퓌레를 섞은 반죽은 속이 진한 자홍이고, 구운 윗면은 자홍에 적갈색 구움이 얹혀 탁해지며 테 · 솟은 곳은 밤색으로 익는다.
      한 가지 붉은색으로 칠한 판 · 붉은 웅덩이는 날고기로 읽힌다(BRIEF) → 윗면은 구움과 섞고 딤플엔 금빛 기름.
구성: 자홍 판(윗면 적갈색 구움 얼룩 · 옆면 · 딤플은 더 짙게) · 금빛 기름 웅덩이 5 · 로즈마리 잔가지 4 · 굵은 소금 24.
"""
import random

import flat_top
import slab

SEED = 76
L, W, T = 1.0, 0.74, 0.12


def baked(m, top_c, side_c, p, nz, dim):
    w = m.math('MULTIPLY', m.smooth(m.noise(p, scale=4.5, detail=4, distortion=0.4), 0.36, 0.62), 0.8)
    return m.mix(m.math('MULTIPLY', w, m.math('SUBTRACT', 1.0, dim)), top_c, '#8A4A30'), side_c


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    oil = slab.scatter(rnd, 5, L - 0.16, W - 0.16, 0.24)
    pool = slab.plain_mat(lib, 'goldoil', '#B48A14', '#C89C22', rough=0.12, scale=20)
    return flat_top.build_focaccia_top(
        lib, SEED, crust=baked, pool=pool, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.08, oil_d=0.028,
        olive_r=0.05, olive_d=0.02, sprigs=4, sprig_len=(0.12, 0.15), sprig_pairs=3, salt_n=24,
        salt_size=(0.018, 0.026),
        crust_kw=dict(top=('#943048', '#A43C54', '#B04A5E'), brown='#4E2420', dimple='#6A1A30',
                      side=('#7E2440', '#8C2E4A'), pore='#5E1A32'),
        opts=dict(ao_strength={'goldoil': 0.25}, grade={'goldoil': 0.4}))
