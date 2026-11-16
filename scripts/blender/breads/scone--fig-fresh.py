"""무화과 스콘 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 반으로 가른 무화과 한 쪽을 단면이 위로 오게 윗면에 눌러 굽는다(자줏빛 껍질 테 · 흰 속껍질 · 씨 박힌 속살) · 꿀 윤.
구성: 윗면 한쪽에 얹은 무화과 반쪽 하나(단면 그림) · 꿀을 발라 윤이 도는 윗면. 묻힌 얼룩 판은 살색 면의 상처로 읽혀 뺐다.
"""
import math

import bmesh
import bpy
import wedge


def half_fig(lib, name, s, rnd):
    """무화과 반쪽 — 눌린 공의 위를 평평히 잘라 단면을 만든다(국소: 가운데 원점, 단면 +Z). 정점 속성 figr = 단면 중심에서 테까지 0→1"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=s)
    cap = 0.25 * s
    rs = []
    for v in bm.verts:
        v.co.z *= 0.7
        rs.append(math.hypot(v.co.x, v.co.y) / (s * 0.93))
        v.co.x *= 1 - 0.38 * max(0.0, v.co.y / s) ** 1.5  # 꼭지 쪽이 좁은 물방울(동그란 원반은 과녁으로 읽힌다)
        v.co.y *= 1.12
        v.co.z = min(v.co.z, cap)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.point_attr(ob, 'figr', rs)
    lib.tag_local(ob)  # press_into 가 메시를 옮기기 전 좌표 · 법선을 심는다
    return ob, s


def fig_material(lib):
    m = lib.Mat('fig')
    p = m.lpos()
    r = m.attr('figr')
    top = m.smooth(m.sep(m.lnrm())[2], 0.85, 0.95)
    skin = m.ramp(m.noise(p, scale=40, detail=3), [(0.3, '#4A2030'), (0.7, '#6E3446')])
    # 속살 = 가운데서 테로 뻗는 섬유 결(방향 벡터에 거는 잡음) — 고른 동심 고리는 눈알 · 과녁으로 읽힌다
    px = m.sep(p)
    rad = m.vmath('NORMALIZE', m.combine(px[0], px[1], 0.0))
    fib = m.noise(m.mapping(rad, scale=(6, 6, 6)), scale=1.0, detail=3)
    flesh = m.ramp(m.math('ADD', m.math('MULTIPLY', fib, 0.7), m.math('MULTIPLY', m.noise(p, scale=30, detail=2), 0.3)),
                   [(0.35, '#B84A40'), (0.65, '#DC7860')])
    seed = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=70, randomness=1.0), 0.10, 0.17))
    seed = m.math('MULTIPLY', seed, m.smooth(r, 0.15, 0.3))  # 가운데 빈 데는 씨가 없다
    flesh = m.mix(m.math('MULTIPLY', seed, 0.85), flesh, '#F4D490')
    pith = m.math('ADD', r, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=12, detail=2), 0.5), 0.12))
    face = m.mix(m.smooth(pith, 0.64, 0.74), flesh, '#F2DEBA')  # 흰 속껍질 — 안쪽 경계는 섬유처럼 흔들린다
    face = m.mix(m.smooth(r, 0.88, 0.92), face, skin)
    col = m.mix(top, skin, face)
    return m.out(col, m.mixf(top, 0.45, 0.4), m.bump(m.math('MULTIPLY', seed, 0.5), strength=0.2, distance=0.002))


def build(lib):
    lib.reset(40)
    bits = [dict(make=half_fig, mat=fig_material(lib), n=1, size=(0.17, 0.17), at=[(-0.1, 0.6)], sink=0.1,
                 mark=False)]
    return wedge.build_scone(lib, 40, bits=bits, glaze=('#E09A28', 0.4),
                             opts=dict(uv_weight={'crumb': 1.0, 'fig': 2.0}))
