"""생딸기 포카치아 — 실물 사진(네이버 이미지 「딸기 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia, 단면은 berry_cut.

실물: 구운 판이 식은 뒤 생딸기를 세로로 얇게 저며 얹는다 — 하트 모양 단면(붉은 테 · 분홍 속살 · 흰 심)이 위를 보고
      껍질은 선명한 빨강으로 윤이 난다. 구운 딸기(strawberry-roasted)의 검붉게 졸은 반쪽과는 색 · 두께로 갈린다.
구성: 세로 저민 생딸기 7(단면이 위, 납작) · 기름 웅덩이 3 · 소금 10. 딸기는 딤플이 아니라 윗면에 얹는다(구운 뒤 토핑).
"""
import math
import random

import flat_top
import slab

SEED = 15
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 8, L - 0.2, W - 0.2, 0.2)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.08, 0.26)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.17 for a, b in seats)][:3]

    def top(put, rnd, seats):
        skin = flat_top.berry_skin_mat(lib, stops=('#B80E26', '#CC1830', '#DE2A3A'), rough=0.3)
        cut = flat_top.berry_cut_mat(lib, tint=None, rough=0.4)
        for k, (x, y) in enumerate(seats):
            pieces = flat_top.berry_half(lib, f'berry{k}', rnd.uniform(0, 9), rnd.choice((-1.0, 1.0)), k % 2, skin, cut)
            put(pieces, None, x, y, lift=0.012, lean=6, pre=flat_top.half_up(rnd.uniform(0.6, 0.68), flat=0.3))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.08, oil_d=0.012,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=10, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'berry': 0.4, 'berry_cut': 0.25}, uv_weight={'berry': 1.2, 'berry_cut': 2.4},
                  grade={'berry': 0.5, 'berry_cut': 0.5}))
