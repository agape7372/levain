"""허니 포카치아 — 실물 사진(네이버 이미지 「허니 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 구운 판 위에 숟가락으로 꿀을 지그재그로 흘려 뿌린다 — 윤기 나는 호박색 줄기가 판을 가로지르고 딤플에 조금 고인다.
구성: 판을 가로지르는 꿀 줄기 한 가닥(지그재그 7획, 납작한 관) · 꿀이 고인 딤플 3 · 빈 딤플 · 소금 10.
      올리브 오일(웅덩이 여럿) · 메이플(깍둑)과는 「줄기」로 갈린다.
"""
import random

import flat_top
import slab

SEED = 108
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    oil = slab.scatter(rnd, 3, L - 0.2, W - 0.2, 0.3)
    seats = [p for p in slab.scatter(rnd, 12, L - 0.14, W - 0.14, 0.15)
             if all(abs(p[0] - a) + abs(p[1] - b) > 0.18 for a, b in oil)][:7]  # 빈 딤플
    honey = slab.plain_mat(lib, 'honey', '#CC7E0E', '#E4A220', rough=0.1, scale=12)

    def top(put, rnd, seats):
        ctrl = [(x + rnd.uniform(-0.03, 0.03), (0.25 if k % 2 else -0.25) + rnd.uniform(-0.04, 0.04))
                for k, x in enumerate(-0.42 + 0.14 * i for i in range(7))]
        pts = lib.catmull(ctrl, sub=10)
        put.parts.append(lib.assign(flat_top.drizzle(lib, 'drizzle', put.surf, pts, width=0.036, thick=0.007), honey))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, pool=honey, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.09,
        oil_d=0.03, olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=10, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'honey': 0.25}, uv_weight={'honey': 1.4}, grade={'honey': 0.2}))
