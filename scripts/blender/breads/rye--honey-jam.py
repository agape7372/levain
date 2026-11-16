"""허니 호밀빵 (rye--honey-jam) — 형상 · 껍질은 rye_kit.build_rye(덧칠 extra), 꿀은 loaf_kit.blob_chain.

실물: 네이버 이미지 「허니 호밀빵」(2026-11-16) — 꿀을 발라 구운 윗면이 호박색으로 윤나고, 칼집에 고인 꿀이 어깨로 흘러내린다.
구성: 호밀 껍질 · 정수리부터 어깨까지 꿀 글레이즈 · 칼집 골에 고인 꿀 + 앞 어깨로 흘러내린 굵은 꿀 줄기 넷(길이 들쭉날쭉 · 끝마다 방울) — 빛 굽기 없이.
글레이즈 · 고인 꿀만으로는 꿀이 안 읽혔다(r2) — 흘러내린 줄기 형상으로.
"""
import math

import loaf_kit as lk
import rye_kit as rk
import slab

# 줄기 (칼집 위 x, 앞 어깨까지 갈 반폭 비) — 길이 들쭉날쭉
STREAMS = [(-0.22, 0.6), (-0.06, 0.97), (0.1, 0.74), (0.24, 0.9)]


def glaze(m, k, col, rough, h):
    p = k['p']
    edge = m.math('ADD', k['nz'], m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=3, detail=3), 0.5), 0.5))
    coat = m.smooth(edge, 0.25, 0.7)  # 정수리에서 어깨까지, 옆으로 흐려진다
    amber = m.ramp(m.noise(p, scale=12, detail=3), [(0.3, '#8A3E06'), (0.7, '#B05C0E')])
    col = m.mix(m.math('MULTIPLY', coat, 0.7), col, amber)
    rough = m.mixf(m.math('MULTIPLY', coat, 0.85), rough, 0.36)
    return col, rough, h


def _on(body, x, y, r, lift):
    """윗면 (x, y) 에 반지름 r 덩이를 법선 쪽으로 lift·r 띄운 중심"""
    hit = lk.top_z(body, x, y)
    if hit is None:
        return None
    z, n = hit
    return (x + n.x * r * lift, y + n.y * r * lift, z + n.z * r * lift)


def honey(lib, body, rnd):
    x0, y0, ang, a, w = rk.SLASHES[0][:5]
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    els = []
    for i in range(25):  # 칼집 골에 고인 꿀
        u = -0.86 + 1.72 * i / 24
        x, y = x0 + u * a * c, y0 + u * a * s
        hit = lk.top_z(body, x, y)
        if hit is None:
            continue
        r = w * 1.15 * math.sqrt(1 - u * u) * (0.75 + 0.35 * (0.5 + 0.5 * lib.n3(u * 3, 0, 0, 5.0)))
        els.append(((x, y, hit[0] + 0.002), r, (1.0, 1.0, 0.35)))
    for k, (sx, f) in enumerate(STREAMS):  # 앞(−Y) 어깨로 흘러내린 줄기 + 끝 방울
        ys = y0 + (sx - x0) * math.tan(math.radians(ang)) - w * 0.6
        ye = -rk.half_width(sx) * f
        steps = max(4, int((ys - ye) / 0.007))
        for j in range(steps + 1):
            t = j / steps
            y = ys + (ye - ys) * t
            x = sx + 0.03 * t * (1 if k % 2 else -1) + 0.01 * math.sin(t * 5 + k)  # 비스듬히 굽이친다(곧은 다리 = 빗살, r4)
            # 메타볼 겉면은 반지름보다 한참 안쪽 — 0.016 은 실 같은 다리였다(r3 초안)
            r = 0.028 * (1 - 0.25 * t) * (0.85 + 0.3 * (0.5 + 0.5 * lib.n3(t * 4, k, 0, 7.0)))
            ctr = _on(body, x, y, r, 0.1)
            if ctr:
                els.append((ctr, r, (1.0, 1.0, 0.7)))
        ctr = _on(body, x, ye, 0.04, 0.25)
        if ctr:
            els.append((ctr, 0.036 + 0.005 * (k % 3), (1.0, 1.0, 0.9)))
    ob = lk.bury(lib, body, lk.blob_chain(lib, 'honey', els, tris=5000, resolution=0.004))
    return [lib.assign(ob, slab.plain_mat(lib, 'honey', '#C86A08', '#E8901A', rough=0.22, scale=25))]


def build(lib):
    return rk.build_rye(lib, seed=79, crust=dict(extra=glaze), top=honey,
                        opts=dict(ao_strength={'*': 0.45, 'honey': 0.2}, uv_weight={'honey': 1.5}))
