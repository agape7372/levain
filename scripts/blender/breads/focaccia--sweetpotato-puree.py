"""고구마 포카치아 — 실물 사진(네이버 이미지 「고구마 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 껍질째 둥글게 썬 고구마를 딤플에 눌러 굽는다 — 보라 껍질 테 안에 노란 주황 속살, 위는 군고구마처럼 노릇하다.
      고구마 플랫브레드(반죽에 퓌레를 섞은 주황 판)와는 「보라 테 두른 둥근 조각」으로 갈린다.
구성: 껍질째 썬 고구마 조각 6(보라 테 · 노란 주황 속살, 크게) · 기름 웅덩이 3 · 로즈마리 잔가지 2 · 소금 12.
"""
import math
import random

import flat_top
import slab
from mathutils import Matrix

SEED = 102
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 6, L - 0.24, W - 0.22, 0.24)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.08, 0.26)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.17 for a, b in seats)][:3]

    def top(put, rnd, seats):
        # 옆면에만 보라를 두른 첫 판은 위에서 테가 안 보여 당근 · 치즈 원반으로 읽혔다 → 윗면 바깥 둘레에 보라 테
        m = lib.Mat('sweetpotato')
        p = m.lpos()
        s = m.sep(p)
        r = m.math('ADD', m.vmath('LENGTH', m.combine(s[0], s[1])), m.math('MULTIPLY', m.noise(p, scale=8), 0.05))
        col = m.ramp(m.noise(p, scale=9, detail=3), [(0.3, '#F2B832'), (0.7, '#F6C84E')])
        col = m.mix(m.math('MULTIPLY', m.smooth(m.noise(p, scale=5, detail=3), 0.55, 0.7), 0.6), col, '#C8802A')  # 군 자국
        mat = m.out(m.mix(m.smooth(r, 0.8, 0.86), col, '#5A2446'), 0.72,
                    m.bump(m.noise(p, scale=40, detail=2), strength=0.2, distance=0.002))
        for k, (x, y) in enumerate(seats):
            put(flat_top.disc(lib, f'slice{k}', thick=0.14, segs=32), mat, x, y,
                lift=0.008, lean=4, pre=Matrix.Diagonal((1, rnd.uniform(0.82, 0.92), 1, 1)) @ Matrix.Scale(rnd.uniform(0.08, 0.095), 4))
        flat_top.sprigs(lib, put, rnd, 2, (0.1, 0.13), [(x, y, 0.1) for x, y in seats + oil], L, W, pairs=2)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.09, oil_d=0.014,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=12, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'sweetpotato': 0.35}, uv_weight={'sweetpotato': 1.4}, grade={'sweetpotato': 0.5}))
