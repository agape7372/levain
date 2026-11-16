"""구운 딸기 포카치아 — 실물 사진(네이버 이미지 「딸기 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia, 토핑은 flat_top.

실물: 반으로 가른 딸기를 단면이 위로 오게 딤플에 눌러 박아 굽는다 — 하트 윤곽 · 붉은 테 · 하얀 심이 보이고 가장자리는 졸아 검붉다.
      과즙은 딸기 바로 둘레만 캐러멜색으로 번진다. 허브 몇 가닥 · 기름 웅덩이.
구성: 빈 딤플 4 · 반쪽 딸기 6(크기 · 방향 흩음, 단면 그림 berry_cut + 구운 잼빛) · 기름 웅덩이 2(떨어뜨려 — 나란하면 눈) · 로즈마리 잔가지 3 · 소금 10.
"""
import math
import random

import flat_top
import slab

SEED = 61
L, W, T = 1.0, 0.74, 0.11


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 10, L - 0.1, W - 0.08, 0.19)  # 앞 6 = 딸기 자리, 나머지 = 빈 딤플(민판은 크래커로 읽혔다)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.1, 0.3)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.2 for a, b in seats)][:2]

    def top(put, rnd, seats):
        skin, cut = flat_top.berry_skin_mat(lib), flat_top.berry_cut_mat(lib, tint=('#9A1226', 0.5))
        for k, (x, y) in enumerate(seats[:6]):
            pieces = flat_top.berry_half(lib, f'half{k}', 2.3 + k * 1.37, 1 if k % 2 else -1, k % 2, skin, cut)
            put(pieces, None, x, y, lift=0.034, lean=12, pre=flat_top.half_up(rnd.uniform(0.58, 0.68), flat=0.8))
        flat_top.sprigs(lib, put, rnd, 3, (0.09, 0.12), [(x, y, 0.09) for x, y in seats], L, W, pairs=2)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.085, oil_d=0.03,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=10, salt_size=(0.016, 0.022),
        crust_kw=dict(dimple='#B87418'),  # 딤플 = 기름 · 졸은 과즙 호박색(빨강은 상처, 붉은 갈색 빈 딤플은 짙은 구멍으로 읽혔다)
        opts=dict(ao_strength={'berry': 0.45, 'berry_cut': 0.3}, uv_weight={'berry': 1.2, 'berry_cut': 2.4}))
