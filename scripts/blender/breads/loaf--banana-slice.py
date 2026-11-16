"""바나나 식빵 (loaf--banana-slice) — 형상 · 껍질은 loaf_kit.build_loaf, 길이로 가른 바나나는 이 파일의 half_banana.

실물: 네이버 이미지 「바나나 식빵」(2026-11-16)은 토스트 위 둥근 슬라이스가 많았지만, 통식빵으로 굽는 바나나 브레드의 대표 모습은
길이로 반 가른 바나나 한 쪽을 뚜껑에 눌러 구운 꼴이다(단면이 위 · 가장자리가 캐러멜빛으로 그을림 · 가운데 씨 줄). 뚜껑은 조금 짙다.
구성: 껍질 쪽 — 조금 짙게 구운 뚜껑 · 비스듬히 눌러 얹은 바나나 반쪽 하나(휜 꼴, 단면이 위) · 단면 없음.
원반 슬라이스를 한 줄로 얹은 판은 알약으로 읽혀 뺐다(두뇌 검토 11-16).
"""
import math

import bmesh
import bpy
import loaf_kit as lk
from wedge import press_into

PAL = dict(crust=('#B4621E', '#C07028', '#CA7E32'), ridge='#9A5216')
L, W, H = 0.6, 0.15, 0.055


def half_banana(lib, name):
    """길이로 가른 바나나 반쪽(국소: 길이 X, 단면 +Z, 가운데 원점, 길이 방향으로 휜다). 정점 속성 banr = 단면 가운데 줄에서 테까지 0→1"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=14, radius=1.0)
    rs = []
    for v in bm.verts:
        x, y, z = v.co
        taper = max(0.0, 1 - abs(x) ** 2.4) ** 0.5  # 끝으로 갈수록 가늘다
        rs.append(min(1.0, abs(y) / max(taper, 1e-3)))
        v.co.x = x * L / 2
        v.co.y = y * W / 2 * max(taper, 0.08) + 0.05 * (x ** 2 - 0.35)  # 길이 방향으로 휜 꼴
        v.co.z = min(z * H * max(taper, 0.15), H * 0.35)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    ob = lib.link(bpy.data.objects.new(name, me))
    lib.point_attr(ob, 'banr', rs)
    lib.tag_local(ob)
    return ob


def banana_mat(lib):
    m = lib.Mat('banana')
    p = m.lpos()
    r = m.attr('banr')
    top = m.smooth(m.sep(m.lnrm())[2], 0.8, 0.95)
    flesh = m.ramp(m.noise(m.mapping(p, scale=(1.0, 4.0, 4.0)), scale=30, detail=3), [(0.3, '#EECB6E'), (0.7, '#F6DA8A')])
    seeds = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(r, 0.08, 0.18)),
                   m.smooth(m.noise(m.mapping(p, scale=(1.0, 3.0, 3.0)), scale=40, detail=1), 0.45, 0.6))
    flesh = m.mix(m.math('MULTIPLY', seeds, 0.7), flesh, '#7A4A24')  # 가운데 씨 줄(끊긴 점선)
    burn = m.math('MAXIMUM', m.smooth(r, 0.5, 0.9), m.math('MULTIPLY', m.smooth(m.noise(p, scale=12, detail=3), 0.5, 0.66), 0.7))
    flesh = m.mix(m.math('MULTIPLY', burn, 0.85), flesh, '#B0641C')  # 캐러멜로 그을린 가장자리 · 얼룩
    side = m.ramp(m.noise(p, scale=20, detail=2), [(0.3, '#A8621E'), (0.7, '#C07A2C')])
    col = m.mix(top, side, flesh)
    return m.out(col, m.mixf(top, 0.5, 0.38), m.bump(m.noise(p, scale=70, detail=2), strength=0.15, distance=0.002))


def banana(lib, body, rnd, x0):
    ob = half_banana(lib, 'banana')
    press_into(lib, body, ob, H, at_xy=(0.0, 0.0), sink=-0.05, tilt=(0.0, 0.0), spin=math.radians(-14))
    return [lib.assign(ob, banana_mat(lib))]


def build(lib):
    return lk.build_loaf(lib, seed=51, pal=PAL, top=banana,
                         opts=dict(uv_weight={'banana': 1.6}, ao_strength={'*': 0.25, 'banana': 0.4}))
