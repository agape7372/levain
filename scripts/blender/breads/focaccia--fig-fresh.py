"""무화과 포카치아 — 실물 사진(네이버 이미지 「무화과 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 생무화과를 세로로 반 갈라 단면이 위로 오게 딤플에 눌러 굽는다 — 보라 껍질 테 · 크림빛 속껍질 · 씨가 박힌 분홍 과육.
구성: 반쪽 무화과 5(크게, 단면이 위 · 물방울 윤곽) · 기름 웅덩이 3 · 로즈마리 잔가지 3 · 소금 12.
"""
import math
import random

import flat_top
import slab

SEED = 53
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 5, L - 0.26, W - 0.26, 0.26)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.08, 0.26)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.19 for a, b in seats)][:3]

    def top(put, rnd, seats):
        skin = slab.plain_mat(lib, 'fig_skin', '#4A2240', '#603052', rough=0.42, scale=25)
        cut = flat_top.fig_cut_mat(lib)
        for k, (x, y) in enumerate(seats):
            put(flat_top.fig_half(lib, f'fig{k}', rnd.uniform(0, 9), skin, cut), None, x, y, lift=0.02, lean=8,
                pre=flat_top.half_up(rnd.uniform(0.62, 0.7), flat=0.55))
        flat_top.sprigs(lib, put, rnd, 3, (0.1, 0.13), [(x, y, 0.1) for x, y in seats + oil], L, W, pairs=2)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.09, oil_d=0.022,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=12, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'fig_skin': 0.4, 'fig_cut': 0.25}, uv_weight={'fig_skin': 1.2, 'fig_cut': 2.2},
                  grade={'fig_cut': 0.5}))
