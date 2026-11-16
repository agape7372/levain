"""초코 포카치아(금빛 판) — 실물 사진(네이버 이미지 「초코 칩 포카치아」, 2026-11-16)을 보고 지음. 판은 slab.build_focaccia.

실물: 기본 금빛 판에 밀크 초콜릿을 올려 구우면 딤플마다 녹아 윤기 있게 고이고, 위로 녹인 초콜릿을 줄기로 흘리며
      판 초콜릿 조각을 몇 개 꽂는다. 코코아 반죽(choco-cocoa)과 달리 판은 금빛 그대로.
      박힌 칩은 사용자가 세 번 반려한 수법(두뇌 검수) → 칩 없이 웅덩이 · 줄기 · 판 조각.
구성: 녹아 고인 밀크 초콜릿 웅덩이 6(딤플 · 윤기) · 판을 비스듬히 가로지르는 초콜릿 줄기 2 · 칸 홈 난 판 초콜릿 조각 2 · 소금 10.
"""
import math
import random

import bmesh
import bpy
import flat_top
import slab
from mathutils import Matrix

SEED = 45
L, W, T = 1.0, 0.74, 0.12


def bar(lib, name):
    """판 초콜릿 조각(국소: 1 × 0.66 × 0.18, 밑면 z=0) — 모서리 베벨"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, 0.5)) @ Matrix.Diagonal((1, 0.66, 1, 1)))
    for v in bm.verts:
        v.co.z *= 0.18
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    md = ob.modifiers.new('bev', 'BEVEL')
    md.width, md.segments = 0.05, 2
    lib.apply_modifiers(ob)
    return ob


def bar_mat(lib):
    """칸 홈 — 국소 x · y 를 3 × 2 칸으로 나눈 얕은 골"""
    m = lib.Mat('bar')
    s = m.sep(m.lpos())

    def groove(v, k):
        f = m.math('FRACT', m.math('MULTIPLY', m.math('ADD', v, 0.5), k))
        return m.math('SUBTRACT', 1.0, m.smooth(m.math('MINIMUM', f, m.math('SUBTRACT', 1.0, f)), 0.03, 0.08))

    g = m.math('MAXIMUM', groove(s[0], 3.0), groove(s[1], 3.0))
    col = m.mix(m.math('MULTIPLY', g, 0.5), '#4A2616', '#2E160C')
    return m.out(col, 0.3, m.bump(m.math('MULTIPLY', g, -1.0), strength=0.4, distance=0.002))


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    seats = slab.scatter(rnd, 8, L - 0.18, W - 0.16, 0.18)

    def top(put, rnd, seats):
        pool = flat_top.melt_mat(lib, 'choco_melt', ('#8A5230', '#9A5E36'), '#5E341C', rough=0.18, width=(0.6, 1.0))
        for k, (x, y) in enumerate(seats[:6]):
            put(flat_top.dollop(lib, f'pool{k}', rnd, n=5, flat=0.14, lumpy=0.02), pool, x, y, lift=0.003, lean=2,
                pre=Matrix.Scale(rnd.uniform(0.1, 0.12), 4))
        bm = bar_mat(lib)
        for k, (x, y) in enumerate(seats[6:8]):
            s = rnd.uniform(0.1, 0.11)
            put(bar(lib, f'bar{k}'), bm, x, y, lift=-0.004, lean=18, pre=Matrix.Scale(s, 4))
        # 숟가락으로 흘린 줄기 두 가닥 — 판을 비스듬히 가로지르는 느슨한 물결(웅덩이를 점 잇기로 꿰면 분자 모형)
        line = slab.plain_mat(lib, 'choco_line', '#5A301A', '#6A3A20', rough=0.18, scale=20)
        for j, (y0, amp, ph) in enumerate(((0.1, 0.07, 0.4), (-0.12, 0.05, 2.2))):
            ctrl = [(x, y0 - 0.18 * x + amp * math.sin(9 * x + ph) + rnd.uniform(-0.015, 0.015))
                    for x in (-0.54 + 0.09 * i for i in range(13))]
            put.parts.append(lib.assign(flat_top.drizzle(lib, f'drizzle{j}', put.surf, lib.catmull(ctrl, sub=6),
                                                         width=0.018 - 0.004 * j, thick=0.008), line))

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, olives=[], oil_r=0.08, oil_d=0.016,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=10, salt_size=(0.016, 0.022),
        opts=dict(ao_strength={'choco_melt': 0.3, 'bar': 0.4, 'choco_line': 0.3},
                  uv_weight={'choco_melt': 1.3, 'bar': 1.4, 'choco_line': 1.4}))
