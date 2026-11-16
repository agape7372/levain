"""올리브 슬라이스 포카치아 — 실물 사진(네이버 이미지 「올리브 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 씨 뺀 올리브를 동그랗게 썰어 판 가득 눌러 박는다 — 검은 고리가 대부분, 초록 고리가 섞이고 딤플에 기름이 고인다.
      통올리브(베이스 focaccia)와는 「납작한 고리」로 갈린다.
구성: 올리브 고리 10(검정 7 · 초록 3, 구멍 뚫린 원반) · 기름 웅덩이 4 · 로즈마리 잔가지 2 · 소금 14.
"""
import math
import random

import flat_top
import slab
from mathutils import Matrix

SEED = 43
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 10, L - 0.12, W - 0.12, 0.17)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.12, W - 0.12, 0.22)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.13 for a, b in seats)][:4]

    def top(put, rnd, seats):
        black = flat_top.olive_ring_mat(lib, 'olive_ring', ('#1E1719', '#2E2428'), ('#4A3238', '#5A3E40'), rough=0.26)
        green = flat_top.olive_ring_mat(lib, 'olive_green', ('#6E7A2C', '#82903A'), ('#A8AE5E', '#BCBE72'))
        for k, (x, y) in enumerate(seats):
            ring = flat_top.disc(lib, f'ring{k}', thick=0.2, hole=0.36, ell=rnd.uniform(0.82, 0.92))
            put(ring, green if k % 3 == 1 else black, x, y, lift=0.007, lean=4,
                pre=Matrix.Scale(rnd.uniform(0.055, 0.068), 4))
        flat_top.sprigs(lib, put, rnd, 2, (0.1, 0.13), [(x, y, 0.07) for x, y in seats + oil], L, W, pairs=2)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.075, oil_d=0.016,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=14, salt_size=(0.016, 0.022),
        crust_kw=dict(dimple='#B87A1C'),
        opts=dict(ao_strength={'olive_ring': 0.35, 'olive_green': 0.35},
                  uv_weight={'olive_ring': 1.4, 'olive_green': 1.4}))
