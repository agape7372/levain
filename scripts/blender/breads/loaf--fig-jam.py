"""무화과 식빵 (loaf--fig-jam) — 형상 · 껍질은 loaf_kit.build_loaf, 무화과 반쪽은 scone--fig-fresh 의 그림 방식(half_fig · fig_material)을 옮겨 쓴다.

실물: 네이버 이미지 「무화과 식빵」(2026-11-16) — 통밀빛 식빵에 무화과가 큼직하게 들었고, 뚜껑에 세로로 가른 무화과를 눌러 구운 판이 대표 모습(자줏빛 껍질 테 · 흰 속껍질 · 씨 박힌 붉은 속살) · 꿀 윤기.
구성: 껍질 쪽 — 꿀 윤기 도는 뚜껑(rough 0.5) · 세로로 가른 무화과 반쪽 셋(눈물꼴 · 크기 · 방향 제각각, 단면이 위) · 단면 없음.
단면에 테 두른 동그라미를 박은 판은 소시지 단면으로 읽혀 뺐다(두뇌 검토 11-16).
"""
import math

import bmesh
import bpy
import loaf_kit as lk
from wedge import press_into

PAL = dict(side=('#F2DCB0', '#F6E4BE'), pore='#D2AC78', rough=0.5)


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
    px = m.sep(p)
    rad = m.vmath('NORMALIZE', m.combine(px[0], px[1], 0.0))
    fib = m.noise(m.mapping(rad, scale=(6, 6, 6)), scale=1.0, detail=3)  # 가운데서 테로 뻗는 섬유 결
    flesh = m.ramp(m.math('ADD', m.math('MULTIPLY', fib, 0.7), m.math('MULTIPLY', m.noise(p, scale=30, detail=2), 0.3)),
                   [(0.35, '#B84A40'), (0.65, '#DC7860')])
    seed = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=110, randomness=1.0), 0.10, 0.17))
    seed = m.math('MULTIPLY', seed, m.smooth(r, 0.15, 0.3))
    flesh = m.mix(m.math('MULTIPLY', seed, 0.85), flesh, '#F4D490')
    pith = m.math('ADD', r, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=12, detail=2), 0.5), 0.12))
    face = m.mix(m.smooth(pith, 0.64, 0.74), flesh, '#F2DEBA')
    face = m.mix(m.smooth(r, 0.88, 0.92), face, skin)
    col = m.mix(top, skin, face)
    return m.out(col, m.mixf(top, 0.45, 0.35), m.bump(m.math('MULTIPLY', seed, 0.5), strength=0.2, distance=0.002))


def figs(lib, body, rnd, x0):
    mat = fig_material(lib)
    out = []
    for k, (x, y, s, yaw) in enumerate(((-0.22, 0.05, 0.105, 20), (0.04, -0.07, 0.085, 150), (0.27, 0.06, 0.075, 75))):
        ob, h = half_fig(lib, f'fig{k}', s, rnd)
        press_into(lib, body, ob, h, at_xy=(x, y), sink=0.1, tilt=(rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1)),
                   spin=math.radians(yaw))
        out.append(lib.assign(ob, mat))
    return out


def build(lib):
    return lk.build_loaf(lib, seed=45, pal=PAL, top=figs, opts=dict(uv_weight={'fig': 2.0}))
