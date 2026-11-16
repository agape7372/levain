"""치즈 큐브 포카치아 — 실물 사진(네이버 이미지 「치즈 큐브 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia, 깍둑은 wedge.chunk.

실물: 깍둑 썬 치즈를 딤플에 박아 구우면 모서리가 녹아 내려앉고 윗면이 노릇하게 그을린다 · 어떤 것은 다 녹아 퍼져 테가 갈색으로 탄다.
구성: 치즈 깍둑 4(크게, 반쯤 녹아 낮게 · 윗면 그을림) · 녹아 퍼진 치즈 2(가장자리 그을린 테) · 기름 웅덩이 2 · 소금 12.
      깍둑만 6개인 판은 64px에서 금빛 판에 묻혀 작은 점으로 읽혔다(두뇌 검수).
"""
import math
import random

import flat_top
import slab
import wedge
from mathutils import Matrix

SEED = 79
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 6, L - 0.18, W - 0.16, 0.25)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.1, 0.3)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.18 for a, b in seats)][:2]

    def top(put, rnd, seats):
        # 진한 노랑(#F6D45E)은 겨자 초록빛, 옅은 크림 + 거칠기 0.42 는 방 반사 회색 막에 두부로 읽혔다 → 연노랑 + 넓은 금빛 그을림
        mat = flat_top.toast_mat(lib, 'cheese', ('#FAE090', '#FDEAA6'), '#C8823A', rough=0.7, amount=0.8)
        melt = flat_top.melt_mat(lib, 'cheese_melt', ('#FADC86', '#FCE6A0'), '#A85E22', rough=0.6, width=(0.35, 0.9))
        for k, (x, y) in enumerate(seats):
            if k in (1, 4):  # 다 녹아 퍼진 치즈 — 가장자리가 그을린다
                put(flat_top.dollop(lib, f'melt{k}', rnd, n=6, flat=0.16, lumpy=0.03), melt, x, y, lift=0.005, lean=3,
                    pre=Matrix.Scale(rnd.uniform(0.11, 0.13), 4))
                continue
            ob, h = wedge.chunk(lib, f'cheese{k}', rnd.uniform(0.085, 0.1), rnd, sides=4, height=1.15, flat=0.85)
            put(ob, mat, x, y, lift=-h * 0.05, lean=15, pre=Matrix.Diagonal((1, 1, rnd.uniform(0.5, 0.6), 1)))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.12, oil_d=0.02,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=12, salt_size=(0.016, 0.022),
        crust_kw=dict(dimple='#F2C452'),  # 깍둑 둘레 딤플 = 녹아 번진 치즈
        opts=dict(ao_strength={'cheese': 0.35, 'cheese_melt': 0.3}, uv_weight={'cheese': 1.4, 'cheese_melt': 1.3}))
