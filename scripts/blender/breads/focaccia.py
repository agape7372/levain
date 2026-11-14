"""포카치아 (focaccia) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/focaccia{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 긴 변 1, 바닥 z=0, 정면 = Blender −Y(긴 변이 카메라 쪽). 형상·재질·조립은 slab.py(build_focaccia).
구성: 두툼한 둥근 사각 판 · 손가락 딤플 6×4 바둑 배치(절반은 기름 웅덩이, 절반은 통올리브) ·
      로즈마리 잔가지 9 · 굵은 소금 36. 옛 모델은 각진 격자 홈이라 와플로 읽혔다(2026-11-14).
"""
import random

import slab

SEED = 21
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    cells = slab.jitter_grid(6, 4, L - 0.14, W - 0.14, random.Random(SEED), 0.016)
    oil = [(x, y) for i, j, x, y in cells if (i + j) % 2 == 0]
    olives = [(x, y) for i, j, x, y in cells if (i + j) % 2 == 1]
    # 딤플 반지름 0.056 · 올리브 지름 0.06은 레퍼런스보다 작아 잔 점으로 읽혔다(r1) — 0.064 · 0.07로
    return slab.build_focaccia(lib, SEED, L, W, T, 0.07, oil, olives, oil_r=0.064, oil_d=0.05,
                               olive_r=0.05, olive_d=0.02)
