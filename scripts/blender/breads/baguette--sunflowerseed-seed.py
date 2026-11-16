"""해바라기씨 바게트 (baguette--sunflowerseed-seed) — 형상 · 껍질은 baguette_kit.build_baguette, 씨는 rye_kit.sunflower 를 loaf_kit.stud 로 앉힌다.

실물: 네이버 이미지 「해바라기씨 바게트」(2026-11-16) — 껍질을 길쭉한 해바라기씨가 덮고 칼집 사이로 구운 껍질이 보인다. 씨 끝이 노릇하게 구워진다.
구성: 바게트 몸통 · 칼집 넷 그대로 · 칼집 밖 윗면 · 어깨를 씨로 빽빽이(볶은 회베이지 ~ 연갈색 · 끝 노릇, 호밀 해바라기와 같은 색) — 칼집 속살은 비워 사선이 읽히게.
"""
import math
import random

import baguette_kit as bk
import loaf_kit as lk
import rye_kit as rk


def seeds(lib, body, rnd):
    mat, make = rk.sunflower(lib, 0.036, 0.014, 0.005, n=9)
    pts = []
    r = random.Random(7)
    for _ in range(20000):
        x = r.uniform(-0.46, 0.46)
        y = r.uniform(-1, 1) * bk.RY * bk.taper(x) * 0.95
        if bk.in_slash(bk.SLASHES, x, y, 1.15) or not all(math.hypot(x - a, y - b) > 0.017 for a, b in pts):
            continue
        pts.append((x, y))
        if len(pts) == 220:
            break
    return lk.stud(lib, body, pts, make, mat, rnd, sink=-0.1, tilt=0.3, name='seed')


def build(lib):
    return bk.build_baguette(lib, seed=89, top=seeds, tris=11000,
                             opts=dict(ao_strength={'*': 0.55, 'seed': 0.3}, uv_weight={'seed': 1.2}))
