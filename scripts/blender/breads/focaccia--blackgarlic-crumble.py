"""흑마늘 포카치아 — 실물 사진(네이버 이미지 「흑마늘 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 숙성한 흑마늘은 짙은 초콜릿 갈색으로 젤리처럼 끈적하다 — 쪽을 반으로 갈라 딤플에 납작하게 눌러 박고,
      곁에 구운 통마늘 반쪽(크림빛 단면에 쪽 칸)을 두면 「마늘」이 읽힌다.
      검은 통쪽 · 크림빛 밑동 · 곁의 잔가지는 딱정벌레로 읽혔다(두뇌 검수 두 번) → 납작한 반쪽 + 통마늘 단면, 잔가지 없음.
구성: 반 가른 흑마늘 쪽 4(납작 · 짙은 초콜릿 갈색 윤기 · 크기 섞음) · 구운 통마늘 반쪽 1 · 기름 웅덩이 3 · 굵은 소금 16.
"""
import math
import random

import flat_top
import slab
from mathutils import Matrix

SEED = 105
L, W, T = 1.0, 0.74, 0.12


def garlic_mat(lib, n=9):
    """통마늘 가로 단면(국소 반지름 1) — 가운데 줄기 · 부챗살로 나뉜 크림빛 쪽 칸 · 종이 속껍질 테 · 구운 노릇한 얼룩"""
    m = lib.Mat('garlic')
    p = m.lpos()
    s = m.sep(p)
    r = m.vmath('LENGTH', m.combine(s[0], s[1]))
    t = m.math('FRACT', m.math('ADD', m.math('MULTIPLY', m.math('ARCTAN2', s[1], s[0]), n / math.tau),
                                m.math('MULTIPLY', m.noise(p, scale=3), 0.15)))
    wall = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(m.math('MINIMUM', t, m.math('SUBTRACT', 1.0, t)), 0.02, 0.06)),
                  m.smooth(r, 0.18, 0.26))
    col = m.ramp(m.noise(p, scale=6, detail=3), [(0.3, '#F2DFB2'), (0.7, '#E8C880')])
    col = m.mix(m.math('MULTIPLY', m.smooth(m.noise(p, scale=4, detail=3), 0.45, 0.65), 0.75), col, '#C08A3C')  # 구운 얼룩
    col = m.mix(wall, col, '#B88A50')
    col = m.mix(m.math('SUBTRACT', 1.0, m.smooth(r, 0.14, 0.2)), col, '#A87A44')  # 줄기
    col = m.mix(m.smooth(r, 0.88, 0.94), col, '#D2BC92')  # 속껍질 테
    return m.out(col, 0.6, m.bump(m.math('MULTIPLY', wall, -1.0), strength=0.3, distance=0.002))


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = [(-0.26, 0.12), (0.06, -0.15), (0.3, 0.13), (-0.04, 0.16)]
    bulb = (-0.25, -0.15)
    oil = [p for p in slab.scatter(rnd, 40, L - 0.1, W - 0.1, 0.24)
           if all(math.hypot(p[0] - a, p[1] - b) > 0.17 for a, b in seats + [bulb])][:3]

    def top(put, rnd, seats):
        m = lib.Mat('blackgarlic')  # 갈라 누른 단면 — 가운데가 조금 밝은 끈적한 초콜릿 갈색, 가장자리 짙게
        p = m.lpos()
        s3 = m.sep(p)
        r = m.vmath('LENGTH', m.combine(m.math('MULTIPLY', s3[0], 1.6), m.math('MULTIPLY', s3[1], 2.4)))
        col = m.ramp(m.noise(p, scale=9, detail=3), [(0.3, '#764628'), (0.7, '#8A5632')])
        col = m.mix(m.math('MULTIPLY', m.smooth(r, 0.55, 0.95), 0.8), col, '#4A2A18')
        mat = m.out(col, 0.22, m.bump(m.noise(p, scale=14, detail=2), strength=0.2, distance=0.002))
        for k, (x, y) in enumerate(seats):
            s = (0.16, 0.11, 0.14, 0.1)[k]
            put(flat_top.clove(lib, f'clove{k}', rnd, bend=0.05), mat, x, y, lift=-0.006, lean=3,
                pre=Matrix.Diagonal((s, s * 0.9, s * 0.22, 1)))
        put(flat_top.disc(lib, 'bulb', thick=0.32, segs=36), garlic_mat(lib), *bulb, lift=0.002, lean=4,
            pre=Matrix.Scale(0.11, 4))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, oil=oil, olives=[], oil_r=0.085, oil_d=0.018,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=16, salt_size=(0.018, 0.026), crust_kw=dict(dimple='#A06A20'),
        opts=dict(ao_strength={'blackgarlic': 0.3, 'garlic': 0.3}, uv_weight={'blackgarlic': 1.4, 'garlic': 1.6}))
