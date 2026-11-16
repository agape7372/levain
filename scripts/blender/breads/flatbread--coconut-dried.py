"""코코넛 플랫브레드 — 실물 사진(네이버 이미지 「코코넛 플랫브레드」, 2026-11-16)을 보고 지음. 판은 flat_top.build_flatbread.

실물: 가늘고 길게 채 썬 코코넛을 판 가운데에 수북이 뿌려 구우면 흰 채 끝이 노릇하게 그을린다.
      구겨진 흰 칩은 휴지로 읽혔다(두뇌 검수) → 가는 채를 가운데 넓게 수북이.
구성: 가는 코코넛 채 230(가운데 넓게 · 겹쳐 쌓임 · 끝 노릇, 셋에 하나는 통째로 노릇) · 물집 · 탄 자국(옅게).
"""
import math

import bmesh
import bpy
import flat_top
from mathutils import Matrix


def shred(lib, name, rnd):
    """코코넛 채 한 가닥(국소: 길이 1 · 폭 0.1, 살짝 휘고 비틀림)"""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=4, y_segments=1, size=0.5)
    curl, twist = rnd.uniform(-0.25, 0.25), rnd.uniform(-1.0, 1.0)
    for v in bm.verts:
        x, y = v.co.x, v.co.y * 0.17
        v.co = (x, y * math.cos(twist * x), curl * x * x + y * math.sin(twist * x))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.solidify(ob, 0.035)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def shred_mat(lib, name, body, tip_c, edge=(0.28, 0.45)):
    """코코넛 채 — 양 끝(국소 |x| 큰 쪽)이 노릇하다"""
    m = lib.Mat(name)
    p = m.lpos()
    tip = m.smooth(m.math('ADD', m.math('ABSOLUTE', m.sep(p)[0]), m.math('MULTIPLY', m.noise(p, scale=6), 0.2)), *edge)
    col = m.mix(tip, m.ramp(m.noise(p, scale=20), [(0.4, body[0]), (0.6, body[1])]), tip_c)
    return m.out(col, 0.8)


def build(lib):
    lib.reset(77)

    def top(put, rnd, big):
        mats = (shred_mat(lib, 'coconut', ('#F4EEDE', '#FAF5EA'), '#CC9248'),
                shred_mat(lib, 'coconut_t', ('#EED6A8', '#F2DEB4'), '#C07E34', edge=(0.1, 0.4)))  # 통째로 노릇한 채
        k = 0
        for _ in range(2500):
            if k == 230:
                break
            a, d = rnd.uniform(0, math.tau), 0.32 * math.sqrt(rnd.random())
            x, y = d * math.cos(a), d * math.sin(a) * 0.9
            s = rnd.uniform(0.07, 0.095)
            lift = 0.003 + 0.016 * (1 - d / 0.32) * rnd.random()  # 가운데가 수북하다
            mat = mats[rnd.random() < 0.3]
            if put(shred(lib, f'shred{k}', rnd), mat, x, y, lift=lift, lean=30, pre=Matrix.Scale(s, 4), bury=False):
                k += 1

    return flat_top.build_flatbread(lib, 77, counts=(7, 8, 0), char_k=0.75, top=top,
                                    opts=dict(ao_strength={'coconut': 0.4, 'coconut_t': 0.4},
                                              uv_weight={'coconut': 1.2, 'coconut_t': 0.8}))
