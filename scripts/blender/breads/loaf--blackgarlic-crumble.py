"""흑마늘 식빵 (loaf--blackgarlic-crumble) — 형상 · 껍질은 loaf_kit.build_loaf(칼집 fx), 흑마늘은 slab.pebble · 허브는 slab.rosemary.

실물: 네이버 이미지 「흑마늘 식빵」 · 레시피(2026-11-16) — 흑마늘(윤기 도는 검갈색 물방울꼴 쪽)을 통째 넣어, 뚜껑 칼집이 벌어진 자리로 쪽이 드러나 구워진다.
구성: 껍질 쪽 — 뚜껑 마루를 따라 벌어진 칼집(옅은 속살빛) · 그 자리에 반쯤 묻힌 큰 흑마늘 쪽 넷(엇갈려 · 크기 제각각) · 허브 잔가지 둘 · 단면 없음.
단면에 검갈색 덩이를 박은 판은 벌레로 읽혀 뺐다(두뇌 검토 11-16). 같은 높이 나란한 둘(얼굴)은 두지 않는다.
"""
import math

import loaf_kit as lk
import slab
from mathutils import Matrix
from wedge import press_into


def slash(m, p, cap, col, rough, h):
    """마루를 따라 벌어진 칼집 — 가운데 옅은 속살 · 가장자리는 짙게 구운 입술"""
    px = m.sep(p)
    wob = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=4, detail=2), 0.5), 0.05)
    d = m.math('ABSOLUTE', m.math('ADD', px[1], wob))
    w = m.math('MULTIPLY', 0.032, m.math('SUBTRACT', 1.0, m.smooth(m.math('ABSOLUTE', px[0]), 0.28, 0.4)))
    q = m.math('DIVIDE', d, m.math('ADD', w, 1e-4))  # 칼집 폭으로 나눈 거리(끝으로 갈수록 좁아진다)
    open_ = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(q, 0.6, 1.0)), cap)
    lip = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(q, 1.0, 1.9)), cap)
    col = m.mix(m.math('MULTIPLY', lip, 0.5), col, '#8E4614')
    col = m.mix(open_, col, m.ramp(m.noise(p, scale=40, detail=3), [(0.3, '#E2BC80'), (0.7, '#ECCA94')]))
    return col, m.mixf(open_, rough, 0.9), m.math('ADD', h, m.math('MULTIPLY', open_, -0.8))


def garlic_mat(lib):
    m = lib.Mat('garlic')
    p = m.lpos()
    col = m.ramp(m.noise(m.mapping(p, scale=(1.0, 3.0, 1.0)), scale=30, detail=3), [(0.3, '#2A1A12'), (0.7, '#42291A')])
    return m.out(col, 0.22, m.bump(m.noise(p, scale=60, detail=2), strength=0.15, distance=0.002))


def tops(lib, body, rnd, x0):
    gm = garlic_mat(lib)
    out = []
    # (x, y, 길이, 방향°) — 칼집을 따라 엇갈리게, 크기를 섞는다
    for k, (x, y, s, yaw) in enumerate(((-0.26, 0.01, 0.13, 10), (-0.04, -0.015, 0.105, 200), (0.16, 0.012, 0.125, -20),
                                         (0.34, -0.01, 0.09, 170))):
        ob = slab.pebble(lib, f'garlic{k}', s, s * 0.62, s * 0.55, rnd, jit=0.05, taper=0.55, subdiv=2)
        press_into(lib, body, ob, s * 0.27, at_xy=(x, y), sink=0.15, tilt=(rnd.uniform(-0.15, 0.15), 0.0),
                   spin=math.radians(yaw))
        out.append(lib.assign(ob, gm))
    hm = slab.rosemary_material(lib)
    for k, (x, y, yaw, L) in enumerate(((-0.15, 0.13, 60, 0.14), (0.25, -0.13, 230, 0.12))):
        z, n = lk.top_z(body, x, y)
        M = Matrix.Translation((x, y, z + 0.002)) @ slab.tilt_frame(n, math.radians(yaw)).to_4x4()
        for o in slab.rosemary(lib, f'herb{k}', L, rnd, n_pairs=2):
            o.data.transform(M)
            o.data.update()
            out.append(lib.assign(o, hm))
    return out


def build(lib):
    return lk.build_loaf(lib, seed=69, fx=slash, top=tops, opts=dict(uv_weight={'garlic': 1.4, 'rosemary': 1.2}))
