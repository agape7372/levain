"""피스타치오 포카치아 — 실물 사진(네이버 이미지 「피스타치오 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 껍데기 깐 피스타치오 알을 딤플에 하나씩 눌러 굽는다 — 길쭉한 알 연두 속살에 보랏빛 갈색 속껍질이 군데군데 붙고,
      피스타치오 크림을 떠 얹은 자리는 연둣빛으로 매끈하게 퍼진다.
      잘게 다진 조각을 무리로 모은 첫 판은 64px에서 브로콜리 · 이끼로 읽혔다 → 통알을 낱개로 크게.
구성: 피스타치오 통알 9(길쭉한 알 · 연두 + 보랏빛 속껍질 얼룩) · 피스타치오 크림 2 · 기름 웅덩이 2 · 소금 10.
"""
import math
import random

import flat_top
import slab
import wedge
from mathutils import Matrix

SEED = 81
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    pts = slab.scatter(rnd, 11, L - 0.16, W - 0.16, 0.17)
    nuts, creams = pts[:9], pts[9:11]
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.1, 0.26)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.13 for a, b in pts)][:2]

    def top(put, rnd, seats):
        mat = wedge.chunk_material(lib, 'pistachio', [(0.34, '#74403E'), (0.44, '#86A23E'), (0.72, '#A8C25A')], rough=0.45)
        cream = flat_top.melt_mat(lib, 'pista_cream', ('#A6B858', '#B2C466'), '#8E9E46', rough=0.45, width=(0.7, 1.0))
        for k, (x, y) in enumerate(nuts):
            s = rnd.uniform(0.07, 0.08)
            ob = slab.pebble(lib, f'nut{k}', s, s * 0.55, s * 0.48, rnd, jit=0.05, taper=0.2, subdiv=2)
            put(ob, mat, x, y, lift=s * 0.12, lean=18)
        for j, (x, y) in enumerate(creams):
            put(flat_top.dollop(lib, f'cream{j}', rnd, n=4, flat=0.3, lumpy=0.04), cream, x, y, lift=0.004, lean=3,
                pre=Matrix.Scale(rnd.uniform(0.075, 0.09), 4))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=pts, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.075, oil_d=0.014,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=10, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'pistachio': 0.4, 'pista_cream': 0.3}, uv_weight={'pistachio': 1.5, 'pista_cream': 1.2}))
