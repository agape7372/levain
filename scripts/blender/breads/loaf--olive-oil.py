"""올리브 오일 식빵 (loaf--olive-oil) — 형상 · 껍질은 loaf_kit.build_loaf(뚜껑 rough 낮춤), 로즈마리는 slab.rosemary.

실물: 네이버 이미지 「올리브 오일 식빵」(2026-11-16) — 기름을 바른 뚜껑이 윤이 나는 금갈색, 속살은 기름 덕에 노르스름하다. 허브(로즈마리)를 곁들인 판이 흔하다.
구성: 윤기 도는 금갈색 뚜껑(rough 0.4) · 끝을 썬 노르스름한 속살 · 뚜껑에 눕힌 로즈마리 잔가지 셋(크기 · 방향 제각각).
"""
import math

import loaf_kit as lk
import slab
from mathutils import Matrix

PAL = dict(crust=('#CC7A26', '#D88A32', '#E29A40'), shoulder='#EAAE5A', rough=0.4)


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#F0D890', '#F6E2A4'), pore='#D2AE62', rim_top=(lk.HS, '#B8742A'))


def herbs(lib, body, rnd, x0):
    mat = slab.rosemary_material(lib)
    out = []
    for k, (x, y, yaw, L) in enumerate(((-0.22, 0.03, 20, 0.24), (0.08, -0.09, 160, 0.20), (0.30, 0.10, 75, 0.16))):
        z, n = lk.top_z(body, x, y)
        obs = slab.rosemary(lib, f'rose{k}', L, rnd, n_pairs=4)
        M = Matrix.Translation((x, y, z + 0.002)) @ slab.tilt_frame(n, math.radians(yaw)).to_4x4()
        for o in obs:
            o.data.transform(M)
            o.data.update()
            out.append(lib.assign(o, mat))
    return out


def build(lib):
    return lk.build_loaf(lib, seed=33, pal=PAL, cut=-0.40, crumb=crumb, top=herbs,
                         opts=dict(uv_weight={'crumb': 1.5, 'rosemary': 1.2}))
