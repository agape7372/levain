"""해바라기씨 호밀빵 (rye--sunflowerseed-seed) — 형상 · 껍질은 rye_kit.build_rye, 씨는 rye_kit.sunflower 를 loaf_kit.stud 로 앉힌다.

실물: 네이버 이미지 「해바라기씨 호밀빵」(2026-11-16) — 윗면을 길쭉한 해바라기씨가 빽빽이 덮고 구워진 끝만 노릇하다. 씨 사이로 짙은 호밀 껍질이 비친다.
구성: 캐러웨이 뺀 호밀 껍질 · 윗면 전체를 덮는 굵은 씨(볶은 회베이지 ~ 연갈색 · 끝 노릇, 정수리가 빽빽하고 어깨로 성김) · 칼집은 비워 둔다.
"""
import math

import loaf_kit as lk
import rye_kit as rk


def seeds(lib, body, rnd):
    mat, make = rk.sunflower(lib, 0.052, 0.02, 0.007)
    keep = lambda x, y, r: r.random() < math.exp(-(y / (rk.half_width(x) * 0.7)) ** 4)  # 어깨로 성기게
    pts = rk.top_pts(rnd, 260, 0.03, keep=keep, slash_f=1.5)
    return lk.stud(lib, body, pts, make, mat, rnd, sink=-0.1, tilt=0.3, name='seed')


def build(lib):
    return rk.build_rye(lib, seed=71, crust=dict(caraway=False), top=seeds, tris=9000,
                        opts=dict(ao_strength={'*': 0.45, 'seed': 0.3}, uv_weight={'seed': 1.2}))
