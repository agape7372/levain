"""해바라기씨 포카치아 — 실물 사진(네이버 이미지 「해바라기씨 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 껍질 깐 해바라기씨를 윗면 가운데에 듬뿍 덮어 굽는다 — 회베이지 길쭉한 물방울 씨가 빽빽이 겹치고 끝이 노릇하다.
      테두리에 옅은 낱알을 늘어놓은 판은 구더기로 읽혔다(두뇌 검수) → 가운데 넓은 면을 큰 씨로 빽빽하게, 가장자리는 비운다.
구성: 가운데 타원 면을 덮은 해바라기씨 150(크게 · 회베이지~연갈 · 끝 노릇) · 가장자리 기름 웅덩이 4 · 소금 6.
      씨 셋은 덮는 꼴로 갈린다: 포피 = 윗면 전체 청흑 고운 점 · 아마씨 = 금갈 윤기 낱알(가운데 빽빽) · 해바라기씨 = 큰 회베이지 씨 무더기.
"""
import math
import random

import flat_top
import slab

SEED = 93
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    oil = [p for p in slab.scatter(rnd, 60, L - 0.1, W - 0.1, 0.2) if (p[0] / 0.4) ** 2 + (p[1] / 0.27) ** 2 > 1][:4]

    def top(put, rnd, seats):
        def kernel(name, a, b):  # 뾰족한 끝(국소 +X)이 노릇
            m = lib.Mat(name)
            p = m.lpos()
            body = m.ramp(m.noise(p, scale=60, detail=2), [(0.3, a), (0.7, b)])
            tip = m.smooth(m.math('ADD', m.sep(p)[0], m.math('MULTIPLY', m.noise(p, scale=80), 0.01)), 0.012, 0.034)
            return m.out(m.mix(m.math('MULTIPLY', tip, 0.85), body, '#C68E3E'), 0.6)

        mats = (kernel('kernel', '#A89C84', '#B6A88C'), kernel('kernel_b', '#B49A72', '#C0A47A'))
        pts = []
        for _ in range(4000):
            if len(pts) == 150:
                break
            x, y = rnd.uniform(-0.38, 0.38), rnd.uniform(-0.27, 0.27)
            edge = (x / 0.36) ** 2 + (y / 0.25) ** 2 + 0.18 * math.sin(5 * math.atan2(y, x))
            if edge > 1 or any(math.hypot(x - a, y - b) < 0.03 for a, b in pts):
                continue
            ob = slab.pebble(lib, f'seed{len(pts)}', 0.078, 0.038, 0.018, rnd, jit=0.05, taper=0.5)
            if put(ob, mats[rnd.random() < 0.45], x, y, lift=0.004 + 0.008 * rnd.random(), lean=28):
                pts.append((x, y))

    return flat_top.build_focaccia_top(
        lib, SEED, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.065, oil_d=0.024,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=6, salt_size=(0.016, 0.022), slab_tris=9000,
        opts=dict(ao_strength={'kernel': 0.45}, uv_weight={'kernel': 1.3}))
