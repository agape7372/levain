"""올리브 오일 포카치아 — 실물 사진(네이버 이미지 「올리브 오일 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 기름을 듬뿍 붓고 손가락으로 판 딤플마다 연둣빛 금색 기름이 넘치게 고여 반짝인다 · 가장자리는 기름에 튀겨져 진한 금빛.
구성: 딤플 5×4 중 12개에 크고 얕은 연둣빛 기름 웅덩이(나머지 빈 딤플) · 짙은 금빛 테 · 굵은 소금 22 · 짧은 로즈마리 2.
      꿀(줄기) · 메이플(깍둑)과는 모양으로 갈린다: 이 판은 「웅덩이가 많다」가 정체성.
"""
import random

import flat_top
import slab

SEED = 101
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    cells = slab.jitter_grid(5, 4, L - 0.16, W - 0.16, rnd, 0.025)
    order = list(range(len(cells)))
    rnd.shuffle(order)
    oil = [cells[i][2:] for i in order[:12]]
    seats = [cells[i][2:] for i in order[12:]]  # 빈 딤플
    pool = slab.plain_mat(lib, 'evoo', '#A89424', '#BCA632', rough=0.08, scale=20)
    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, pool=pool, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.092, oil_d=0.03,
        olive_r=0.05, olive_d=0.02, sprigs=2, sprig_len=(0.1, 0.12), sprig_pairs=2, salt_n=22,
        salt_size=(0.018, 0.026), crust_kw=dict(brown='#B8641A', dimple='#A07A10'),
        opts=dict(ao_strength={'evoo': 0.2}, uv_weight={'evoo': 1.0}, grade={'evoo': 0.3}))
