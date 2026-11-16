"""아마씨 호밀빵 (rye--flaxseed-seed) — 형상 · 껍질은 rye_kit.build_rye, 씨는 boule_variant.flake 를 loaf_kit.stud 로 앉힌다.

실물: 네이버 이미지 「아마씨 호밀빵」(2026-11-16) — 작고 납작하며 윤나는 아마씨(적갈 · 금빛)가 껍질에 빽빽이 붙어 반짝이는 결로 읽힌다. 바탕 껍질은 짙은 호밀.
구성: 캐러웨이 뺀 호밀 껍질 · 정수리를 따라 길게 두른 넓은 띠에 금빛 · 적갈 아마씨를 빽빽이(윤기, 가장자리는 흩어져 성김) · 칼집은 비워 둔다.
"""
import math

import loaf_kit as lk
import rye_kit as rk
import slab
from boule_variant import flake


def flax(lib, body, rnd):
    band = lambda x, y, r: r.random() < math.exp(-(abs(y + 0.02) / (rk.half_width(x) * 0.55)) ** 3)
    pts = rk.top_pts(rnd, 480, 0.016, xr=(-0.42, 0.42), keep=band, slash_f=1.4)
    gold = slab.plain_mat(lib, 'seed', '#C08A2C', '#E0B04E', rough=0.32, scale=40)
    brown = slab.plain_mat(lib, 'seed_b', '#5E2A10', '#7E3E1A', rough=0.32, scale=40)

    def make(lib, nm, r):
        s = r.uniform(0.85, 1.15)
        return flake(lib, nm, 0.024 * s, 0.013 * s, 0.003, r, n=7)

    k = len(pts) * 2 // 5
    return (lk.stud(lib, body, pts[:k], make, gold, rnd, sink=-0.1, tilt=0.35, name='seed')
            + lk.stud(lib, body, pts[k:], make, brown, rnd, sink=-0.1, tilt=0.35, name='seedb'))


def build(lib):
    return rk.build_rye(lib, seed=73, crust=dict(caraway=False), top=flax, tris=8500,
                        opts=dict(ao_strength={'*': 0.45, 'seed': 0.3, 'seed_b': 0.3}, uv_weight={'seed': 1.0, 'seed_b': 1.0}))
