"""치즈 크럼블 포카치아 — 실물 사진(네이버 이미지 「치즈 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 페타 · 리코타 같은 흰 치즈를 손으로 뜯어 뭉텅이째 얹고 구우면 덩이 끝만 노릇해진다 — 크림빛 흰 무리가 판 곳곳에.
      깍둑 치즈(cheese-cube)의 노란 정육면체 · 녹아 퍼진 치즈와는 「희고 울퉁불퉁한 뭉텅이 무리」로 갈린다.
구성: 흰 치즈 무리 5(무리마다 뜯은 납작한 조각 3, 크게 · 끝 그을림) · 기름 웅덩이 3 · 로즈마리 잔가지 3 · 소금 8.
"""
import math
import random

import flat_top
import slab

SEED = 56
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    heaps = slab.scatter(rnd, 5, L - 0.22, W - 0.2, 0.26)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.1, 0.24)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.16 for a, b in heaps)][:3]

    def top(put, rnd, seats):
        mat = flat_top.toast_mat(lib, 'crumble', ('#EEE2C0', '#F4EACC'), '#C08038', rough=0.85, amount=0.75)
        k = 0
        for cx, cy in heaps:
            for j in range(3):
                a, d = rnd.uniform(0, math.tau), (0.0 if j == 0 else rnd.uniform(0.05, 0.07))
                s = rnd.uniform(0.065, 0.08) * (1.15 if j == 0 else 1.0)
                ob = slab.pebble(lib, f'crumb{k}', s, s * rnd.uniform(0.7, 0.9), s * rnd.uniform(0.42, 0.52), rnd, jit=0.15, subdiv=2)
                put(ob, mat, cx + d * math.cos(a), cy + d * math.sin(a), lift=-s * 0.05, lean=20)
                k += 1
        flat_top.sprigs(lib, put, rnd, 3, (0.1, 0.13), [(x, y, 0.09) for x, y in heaps + oil], L, W, pairs=2)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=heaps, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.08, oil_d=0.016,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=8, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'crumble': 0.35}, uv_weight={'crumble': 1.4}))
