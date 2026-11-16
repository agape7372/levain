"""레몬 포카치아 — 실물 사진(네이버 이미지 「레몬 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia, 토핑은 flat_top.

실물: 얇게 썬 레몬 바퀴 몇 장을 납작하게 눌러 얹어 굽는다 — 노란 껍질 테 · 흰 막으로 나뉜 과육 칸 · 가장자리가 캐러멜색.
      로즈마리 낱잎이 흩어지고 반죽은 진한 금빛.
구성: 큰 레몬 슬라이스 3(scatter 4 중 들어간 3, 얕은 딤플에 눕혀, 반지름 · 기울기 흩음) · 기름 웅덩이 3 · 로즈마리 낱잎 9 · 소금 14.
"""
import math
import random

import flat_top
import slab
from mathutils import Matrix

SEED = 73
L, W, T = 1.0, 0.74, 0.11


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 4, L - 0.3, W - 0.28, 0.29)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.1, 0.25)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.18 for a, b in seats)][:3]

    def top(put, rnd, seats):
        mat = flat_top.lemon_mat(lib, roast=0.35)
        for k, (x, y) in enumerate(seats):
            r = rnd.uniform(0.115, 0.135)
            put(flat_top.disc(lib, f'lemon{k}', thick=0.08, segs=40), mat, x, y, lift=0.013, lean=4, pre=Matrix.Scale(r, 4))
        flat_top.sprigs(lib, put, rnd, 9, (0.045, 0.06), [(x, y, 0.14) for x, y in seats], L, W, pairs=0)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.11, oil_d=0.012,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=14, salt_size=(0.016, 0.022),
        crust_kw=dict(top=('#E39030', '#EEA640', '#F5B652')),
        opts=dict(ao_strength={'lemon': 0.35}, uv_weight={'lemon': 2.0}))
