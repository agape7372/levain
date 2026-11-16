"""레몬 깜빠뉴 (campagne--lemon-slice) — 실물 사진(네이버 이미지 검색 「레몬 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 레몬 깜빠뉴 사진은 대부분 레몬 아이싱을 씌우고 설탕에 졸인 레몬 슬라이스를 얹은 모습.
구성: 깜빠뉴 껍질 · 정수리를 덮고 흘러내린 레몬빛 아이싱 · 졸인 레몬 슬라이스 셋(노란 껍질 테 · 흰 속껍질 · 연노랑 과육).
"""
import math

import bmesh
import bpy
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, glaze, in_score


def lemon(lib, name, s, rnd):
    """레몬 슬라이스 원반(가운데 · 0.6 · 0.86 · 1 고리) — 정점 속성 rind = 반지름 비"""
    bm = bmesh.new()
    h = s * 0.16
    rings = []
    for z in (0.0, h):
        c = [bm.verts.new((0, 0, z))]
        for rr in (0.6, 0.86, 1.0):
            c.append([bm.verts.new((s * rr * math.cos(math.tau * i / 16), s * rr * math.sin(math.tau * i / 16), z))
                      for i in range(16)])
        rings.append(c)
    for zi, (c0, *rs) in enumerate(rings):
        flip = zi == 0
        for i in range(16):
            j = (i + 1) % 16
            f = (c0, rs[0][i], rs[0][j])
            bm.faces.new(f[::-1] if flip else f)
            for a, b in zip(rs, rs[1:]):
                f = (a[i], b[i], b[j], a[j])
                bm.faces.new(f[::-1] if flip else f)
    lo, hi = rings[0][-1], rings[1][-1]
    for i in range(16):
        j = (i + 1) % 16
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.point_attr(ob, 'rind', [math.hypot(v.co.x, v.co.y) / s for v in me.vertices])
    return ob, h


def lemon_mat(lib):
    m = lib.Mat('bit')
    r = m.attr('rind')
    col = m.ramp(m.noise(m.lpos(), scale=40, detail=2), [(0.3, '#F2CC3A'), (0.7, '#F8DC5A')])
    col = m.mix(m.smooth(r, 0.62, 0.8), col, '#FBF2D2')  # 흰 속껍질
    col = m.mix(m.smooth(r, 0.88, 0.97), col, '#E8A818')  # 노란 겉껍질
    return m.out(col, 0.38)


def build(lib):
    sl = dict(make=lemon, mat=lemon_mat, n=3, size=(0.07, 0.085), zone=(0.15, 0.75), sink=-0.3, gap=0.06)
    return build_campagne_variant(
        lib, 163, bits=[sl], avoid=in_score(SCORE),
        crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, flour_a=0.0,
                                         extra=glaze(('#EED68A', '#F4E2A2'), a=0.85, rough=0.55, z0=0.38)))
