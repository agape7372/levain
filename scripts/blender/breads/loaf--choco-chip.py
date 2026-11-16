"""초코 칩 식빵 (loaf--choco-chip) — 형상 · 껍질은 loaf_kit.build_loaf(뚜껑 글레이즈 fx), 판 초콜릿 조각은 loaf_kit.stud.

실물: 네이버 이미지 「초코 칩 식빵」(2026-11-16) — 초콜릿을 넣은 통식빵에 초콜릿을 부어 굳히거나 조각을 얹어 내는 판이 흔하다.
구성: 껍질 쪽 — 뚜껑을 덮은 밀크 초콜릿 글레이즈(윤기) · 옆벽으로 굵게 몇 줄 흘러내린 자국(길이 제각각) · 위에 얹은 판 초콜릿 조각 셋 · 단면 없음.
크림 단면에 짙은 웅덩이를 박은 판은 벌레로 읽혀 뺐다(두뇌 검토 11-16). choco-filling = 소용돌이, cocoa = 마블과 겹치지 않는다.
"""
import bmesh
import bpy
import loaf_kit as lk
import wedge


def glaze(m, p, cap, col, rough, h):
    px = m.sep(p)
    streak = m.noise(m.mapping(p, scale=(7.0, 7.0, 1.0)), scale=1.0, detail=2)  # 굵은 줄(폭 ~0.1)
    L = m.math('ADD', 0.012, m.math('MULTIPLY', m.smooth(streak, 0.5, 0.68), 0.2))
    drip = m.smooth(m.math('ADD', m.math('SUBTRACT', px[2], lk.HS), L), 0.0, 0.008)
    k = m.math('MAXIMUM', cap, drip)
    gc = m.ramp(m.noise(p, scale=10, detail=2), [(0.3, '#5C301A'), (0.7, '#6E3C22')])
    col = m.mix(k, col, gc)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, k)), m.math('MULTIPLY', drip, 0.3))
    return col, m.mixf(k, rough, 0.25), h


def bar(lib, name, rnd):
    """판 초콜릿 한 조각 — 모서리 둥근 납작 상자"""
    a, b, t = rnd.uniform(0.11, 0.13), rnd.uniform(0.07, 0.08), 0.02
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= a
        v.co.y *= b
        v.co.z *= t
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = lib.link(bpy.data.objects.new(name, me))
    md = ob.modifiers.new('bev', 'BEVEL')
    md.width = t * 0.3
    md.segments = 2
    lib.apply_modifiers(ob)
    return ob, t / 2


def bars(lib, body, rnd, x0):
    mat = wedge.chunk_material(lib, 'chocobar', [(0.3, '#3A1E12'), (0.7, '#4A2818')], rough=0.3)
    return lk.stud(lib, body, [(-0.16, 0.06), (0.08, -0.06), (0.30, 0.07)], bar, mat, rnd, sink=0.3, tilt=0.45,
                   name='chocobar')


def build(lib):
    return lk.build_loaf(lib, seed=39, fx=glaze, top=bars, opts=dict(uv_weight={'chocobar': 1.2}))
