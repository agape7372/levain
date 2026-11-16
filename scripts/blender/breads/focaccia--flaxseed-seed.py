"""아마씨 포카치아 — 실물 사진(네이버 이미지 「아마씨 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 금갈색 납작한 물방울 아마씨는 구우면 윤이 난다 — 윗면에 듬뿍 뿌리면 가운데가 빽빽하고 가장자리로 갈수록 성기다.
      갈색 띠로 모은 판은 흙줄로 읽혔다(두뇌 검수) → 띠 없이 윗면 전체, 밀도만 가운데로 몰린다.
구성: 껍질에 그린 금갈색 낱알 덮개 + 윤기 낱알 110(둘 다 가운데 빽빽 → 가장자리 성김) · 기름 웅덩이 4 · 소금 8.
      포피(청흑 고운 점 덮개)와는 색(금갈) · 알 크기(낱알이 보이는 크기)로 갈린다.
"""
import math
import random

import flat_top
import slab

SEED = 98
L, W, T = 1.0, 0.74, 0.12


def coat(m, top_c, side_c, p, nz, dim):
    """껍질에 그린 아마씨 — 길쭉한 낱알 두 겹(방향을 비틀어 줄 맞춤이 안 보이게), 가운데 빽빽 → 가장자리 성김"""
    s = m.sep(p)
    r = m.vmath('LENGTH', m.combine(m.math('DIVIDE', s[0], L / 2), m.math('DIVIDE', s[1], W / 2)))
    seeds = 0.0
    for rot, off in ((0.5, (0, 0, 0)), (2.1, (0.31, 0.17, 0))):
        q = m.mapping(p, loc=off, rot=(0, 0, rot), scale=(48, 90, 48))
        dot = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(q, scale=1.0), 0.28, 0.4))
        keep = m.smooth(m.math('SUBTRACT', m.sep(m.voronoi(q, scale=1.0, out='Color'))[0],
                               m.math('ADD', m.math('MULTIPLY', r, 0.9), -0.05)), -0.04, 0.04)
        seeds = m.math('MAXIMUM', seeds, m.math('MULTIPLY', dot, keep))
    seeds = m.math('MULTIPLY', seeds, m.math('SUBTRACT', 1.0, m.math('MULTIPLY', dim, 0.7)))
    return m.mix(seeds, top_c, m.ramp(m.noise(p, scale=90), [(0.35, '#8E5420'), (0.65, '#AC6E2C')])), side_c


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    oil = slab.scatter(rnd, 4, L - 0.16, W - 0.16, 0.3)

    def top(put, rnd, seats):
        mat = slab.plain_mat(lib, 'flax', '#A86C2C', '#C4883C', rough=0.16, scale=40)
        k = 0
        for _ in range(6000):
            if k == 110:
                break
            x, y = rnd.uniform(-L / 2 + 0.05, L / 2 - 0.05), rnd.uniform(-W / 2 + 0.05, W / 2 - 0.05)
            r = math.hypot(x / (L / 2), y / (W / 2))
            if rnd.random() > 1.0 - slab.smoothstep(0.15, 0.95, r) * 0.8:
                continue
            ob = slab.pebble(lib, f'flax{k}', 0.04, 0.022, 0.008, rnd, jit=0.08, taper=0.35)
            if put(ob, mat, x, y, lift=0.002, lean=25):
                k += 1

    return flat_top.build_focaccia_top(
        lib, SEED, crust=coat, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.07, oil_d=0.024,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=8, salt_size=(0.016, 0.022), slab_tris=9000,
        opts=dict(ao_strength={'flax': 0.4}, uv_weight={'flax': 1.2}, grade={'flax': 0.5}))
