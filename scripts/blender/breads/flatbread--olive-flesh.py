"""올리브 플랫브레드 — 실물 사진(네이버 이미지 「올리브 플랫브레드」, 2026-11-16)을 보고 지음. 판은 flat_top.build_flatbread.

실물: 얇게 민 판에 둥글게 썬 올리브(가운데 구멍 난 고리)를 반쯤 눌러 박아 굽는다 · 검은 올리브에 초록 올리브가 섞인다.
      검은 고리만이면 64px에서 탄 반점과 섞여 초코칩 쿠키로 읽힌다: 초록을 섞고 탄 반점을 줄였다.
구성: 플랫브레드 판(작은 물집 줄임 · 납작한 탄 반점 0) · 올리브 고리 7(검정 4 · 초록 3, 크기 · 기울기 흩음, 얇게 눕힘).
"""
import math

import flat_top
import slab
from mathutils import Matrix


def build(lib):
    lib.reset(71)

    def top(put, rnd, big):
        black = flat_top.olive_ring_mat(lib, 'olive', ('#1E1719', '#2E2428'), ('#4A3238', '#5A3E40'), rough=0.26)
        green = flat_top.olive_ring_mat(lib, 'olive_g', ('#6E7A2C', '#82903A'), ('#A8AE5E', '#BCBE72'))
        spots = [(x, y) for x, y in slab.scatter(rnd, 40, 0.9, 0.8, 0.17) if (x / 0.4) ** 2 + (y / 0.35) ** 2 < 1
                 and all(math.hypot(x - a, y - b) > r + 0.05 for a, b, r in big)]
        for k, (x, y) in enumerate(spots[:7]):
            r = rnd.uniform(0.062, 0.08)
            ob = flat_top.disc(lib, f'ring{k}', thick=0.2, hole=0.36, ell=rnd.uniform(0.8, 0.9))
            put(ob, green if k % 2 else black, x, y, lift=-0.003, lean=6, pre=Matrix.Scale(r, 4))

    return flat_top.build_flatbread(lib, 71, counts=(7, 6, 0), char_k=0.8, top=top,
                                    opts=dict(ao_strength={'olive': 0.4, 'olive_g': 0.4}, uv_weight={'olive': 1.3, 'olive_g': 1.3}))
