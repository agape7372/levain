"""로즈마리 포카치아 — 실물 사진(네이버 이미지 「로즈마리 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 올리브 없이 딤플만 고르게 판 금빛 판 · 생 로즈마리 잔가지를 여기저기 눕혀 박고 굵은 소금 · 기름이 딤플에 고인다.
구성: 딤플 6×4(절반 기름 웅덩이, 절반 빈 딤플) · 길고 잎 많은 잔가지 8 · 소금 30. 토핑은 베이스 인자만.
"""
import random

import flat_top
import slab

SEED = 66  # 64는 잔가지 끝이 옆면에 걸쳤다(build_focaccia 잔가지 자리는 판 끝 여백이 좁다)
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    cells = slab.jitter_grid(6, 4, L - 0.14, W - 0.14, random.Random(SEED), 0.02)
    oil = [(x, y) for i, j, x, y in cells if (i + j) % 2 == 0]
    seats = [(x, y) for i, j, x, y in cells if (i + j) % 2 == 1]  # 빈 딤플(웅덩이 없이)
    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.058, oil_d=0.04,
        olive_r=0.05, olive_d=0.02, sprigs=8, sprig_len=(0.17, 0.23), sprig_pairs=4, salt_n=30,
        salt_size=(0.018, 0.026))
