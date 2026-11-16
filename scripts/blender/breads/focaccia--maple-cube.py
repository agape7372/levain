"""메이플 큐브 포카치아 — 실물 사진(네이버 이미지 「메이플 큐브 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia, 깍둑은 wedge.chunk.

실물: 메이플 시럽에 졸인 버터 · 설탕 깍둑을 딤플에 박아 구우면 겉이 캐러멜처럼 굳어 진한 호박색으로 윤이 나고,
      녹아 흐른 시럽이 둘레 딤플에 짙게 고인다.
구성: 진한 호박색 윤기 깍둑 6(모서리 무른 정육면체) · 짙은 메이플 시럽 웅덩이 2 · 소금 8.
      올리브 오일(웅덩이 여럿) · 꿀(줄기)과는 「깍둑」으로 갈린다 — 색도 꿀보다 한 단 짙은 적갈색.
"""
import math
import random

import slab
import wedge
import flat_top
from mathutils import Matrix

SEED = 100
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 6, L - 0.18, W - 0.16, 0.24)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.12, W - 0.12, 0.28)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.17 for a, b in seats)][:2]
    syrup = slab.plain_mat(lib, 'syrup', '#7A3408', '#8E420E', rough=0.12, scale=12)

    def top(put, rnd, seats):
        mat = wedge.chunk_material(lib, 'maple', [(0.3, '#9A4A10'), (0.7, '#B8661E')], rough=0.22)
        for k, (x, y) in enumerate(seats):
            ob, h = wedge.chunk(lib, f'maple{k}', rnd.uniform(0.056, 0.068), rnd, sides=4, height=1.25, flat=0.88)
            put(ob, mat, x, y, lift=-h * 0.08, lean=14, pre=Matrix.Diagonal((1, 1, rnd.uniform(0.7, 0.8), 1)))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, pool=syrup, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.1,
        oil_d=0.028, olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=8, salt_size=(0.016, 0.022),
        crust_kw=dict(dimple='#A4601A'),  # 깍둑 둘레 = 녹아 밴 시럽
        opts=dict(ao_strength={'maple': 0.4, 'syrup': 0.25}, uv_weight={'maple': 1.4, 'syrup': 1.0},
                  grade={'maple': 0.3, 'syrup': 0.3}))
