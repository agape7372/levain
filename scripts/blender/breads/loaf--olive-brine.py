"""올리브 식빵 (loaf--olive-brine) — 형상 · 껍질은 loaf_kit.build_loaf, 통올리브는 slab.olive 를 눕혀 loaf_kit.stud 로 묻는다.

실물: 네이버 이미지 「올리브 식빵」(2026-11-16) — 절인(브라인) 그린 올리브를 통째 넣어 뚜껑 위로 윤기 나는 초록 알이 반쯤 솟아 구워진 판. 속은 보통 식빵.
구성: 껍질 쪽 — 뚜껑 마루를 따라 엇갈려 반쯤 묻힌 통 그린 올리브 다섯(누운 방향 · 크기 제각각, 윤기) · 단면 없음.
olive-flesh = 썬 단면의 블랙 올리브 고리, 이쪽 = 겉의 통 그린 올리브로 가른다.
"""
import math

import loaf_kit as lk
import slab
from mathutils import Matrix


def whole(lib, nm, r):
    L = r.uniform(0.09, 0.105)
    ob = slab.olive(lib, nm, L, L * 0.72, hole=0.0, segs=14)
    ob.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -L / 2)))  # 눕혀 가운데를 원점에
    ob.data.update()
    return ob, L * 0.36


def olives(lib, body, rnd, x0):
    mat = slab.olive_material(lib, skin=('#5E6A22', '#707C2C', '#828E38'), hole='#4A5418', rough=0.25)
    pts = [(-0.30, 0.03), (-0.13, -0.07), (0.04, 0.06), (0.19, -0.04), (0.34, 0.08)]
    return lk.stud(lib, body, pts, whole, mat, rnd, sink=0.12, tilt=0.2, name='olive')


def build(lib):
    return lk.build_loaf(lib, seed=37, top=olives, opts=dict(uv_weight={'olive': 1.4}))
