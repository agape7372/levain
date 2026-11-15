"""아마씨 가루 팬케이크 — 이름만 듣고 새로 지음(2026-11-15, 레퍼런스 없음).

구성: 흰 접시 · 통밀빛 짙고 얇은 다섯 장을 어긋나게 높이 쌓음(겉 · 속살에 갈색 가루 점) · 가운데서 비낀 자리에
녹는 버터 한 조각 · 시럽은 조금만 고였다가 줄기 둘 · 통아마씨(납작한 물방울 씨, 윤나는 갈색)를 한쪽에 뿌림,
접시에도 몇 알.
"""
import math
import random

import fresh


def reopen(lib, mat):
    """이미 지은 재질에 노드를 더 얹는다(fresh.cake_mat 겉에 가루 점을 그릴 때)"""
    m = lib.Mat.__new__(lib.Mat)
    m.mat, m.nt = mat, mat.node_tree
    m.bsdf = m.nt.nodes['Principled BSDF']
    return m


def top_z(c, x, y):
    """Cake 윗면 높이(둘레 요철은 무시)"""
    r, th = math.hypot(x - c.cx, y - c.cy), math.atan2(y - c.cy, x - c.cx)
    pts = c.prof[len(c.prof) // 2:]
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if r1 <= r <= r0:
            return c.z0 + z0 + (z1 - z0) * ((r0 - r) / (r0 - r1) if r0 != r1 else 0.0) + c.zf(th, r)
    return c.top


def seed_ob(lib, name, L=0.050):
    """아마씨 한 알 — 한쪽 끝이 뾰족한 납작한 물방울(긴 축 = 국소 X, 납작한 축 = Z, 원점 = 가운데)"""
    prof = [(0.0, 0.0), (0.16 * L, 0.10 * L), (0.26 * L, 0.34 * L), (0.24 * L, 0.62 * L), (0.13 * L, 0.88 * L), (0.0, L)]
    ob = lib.lathe(name, prof, segs=7)
    for v in ob.data.vertices:
        x, y, z = v.co
        v.co = (z - L / 2, x, y * 0.42)
    return ob


def build(lib):
    lib.reset(seed=96)
    rnd = random.Random(96)
    R, H, T = 0.41, 0.088, 0.016
    kw = dict(n=3.0, steps=11, wob=0.034)
    off = ((0.0, 0.0), (0.026, 0.012), (-0.020, -0.016), (0.014, 0.024), (-0.016, 0.004))
    cakes = [fresh.Cake(R * (1.0 - 0.012 * i - 0.02 * (i % 2)), H, 0.086 * i, *off[i], seed=40 + i,
                        droop=0.010 if i else 0.0, **kw) for i in range(5)]
    top = cakes[-1]

    def at(al, r):
        a = lib.az(al)
        return top.cx + r * math.cos(a), top.cy + r * math.sin(a)

    # 통밀빛 반죽 + 아마씨 가루 점(굵은 조각은 드문드문, 고운 가루는 촘촘)
    mat = fresh.cake_mat('cake', R, top=('#B67C38', '#8E5A22', '#683C14'), side=('#DDBF8C', '#C9A56C'), pit='#A8824C',
                         pore_scale=64.0, mottle=0.5)
    m = reopen(lib, mat)
    P = m.lpos()
    up = m.math('ABSOLUTE', m.sep(m.lnrm())[2])
    big = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(P, scale=44.0), 0.20, 0.30)),
                 m.smooth(m.sep(m.voronoi(P, scale=44.0, out='Color'))[0], 0.50, 0.54))
    dust = m.smooth(m.noise(P, scale=210.0, detail=2.0, rough=0.7), 0.60, 0.72)
    speck = m.math('MAXIMUM', big, m.math('MULTIPLY', dust, 0.7))
    col = m.bsdf.inputs['Base Color'].links[0].from_socket
    # 구운 면에선 옅게(짙은 갈색에 묻힌다), 속살 띠에선 또렷하게
    col = m.mix(m.math('MULTIPLY', speck, m.mixf(m.smooth(up, 0.6, 0.9), 0.85, 0.5)), col, '#4E2C10')
    m.out(color=col)
    parts = [lib.assign(c.build(f'cake{i}', segs=44), mat) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#FAF6EE')))

    # 버터: 가운데에서 뒤 오른쪽
    bx, by = at(150, 0.10)
    pat = fresh.butter('butter', a=0.14, h=0.048, seed=6.0)
    lib.place(pat, (bx, by, top.top + T - 0.008), (math.radians(-3), math.radians(5), lib.az(-22)))
    parts.append(lib.assign(pat, fresh.butter_mat('butter', h=0.048)))

    # 시럽: 조금만 — 왼쪽 앞으로 쏠려 고이고 줄기 둘(하나는 길게, 하나는 턱에 맺힌 방울)
    front = lib.az(-38)
    pool = fresh.puddle(front, reach=0.02, back=0.10, ph=8.0)
    runs = [(front - 0.26, 0.16, 0.85), (front + 0.10, 0.05, 1.15), (front + 0.42, 0.12, 0.6)]
    syrup = fresh.sauce_mat('syrup', '#8E3E08', '#C87A18', rough=0.10, edge=(0.1, 1.0), side_col='#E6A040',
                            melt=((bx, by, top.top + T), 0.12, '#F6DC8A'))
    parts += fresh.sauce('syrup', cakes, pool, runs, syrup, w=0.021, plate=PR, thick=T, refine=0.008, embed=0.006, segs=52, lump=0.3,
                         lump_scale=7.0, riv=dict(head=1.6))

    # 통아마씨: 오른쪽 앞에 한 줌 뿌림(가운데는 촘촘, 밖으로 성기게) + 버터 위 · 접시에 몇 알
    sm = lib.Mat('seed')
    n = sm.noise(sm.lpos(), scale=18.0, detail=1.0)
    seed_mat = sm.out(color=sm.ramp(n, [(0.30, '#6A3812'), (0.55, '#9A5E24'), (0.80, '#C88C3A')]), rough=0.30)
    gx, gy = at(55, 0.15)
    spots = []
    for _ in range(90):
        d, a = abs(rnd.gauss(0.0, 0.10)), rnd.uniform(0, math.tau)
        x, y = gx + d * math.cos(a), gy + d * math.sin(a) * 1.3
        if math.hypot(x - top.cx, y - top.cy) > top.R * 0.80 or math.hypot(x - bx, y - by) < 0.10:
            continue
        # 시럽 웅덩이(치우친 원 근사) 안이면 시럽 위에, 밖이면 구운 면에. 가장자리 띠는 비운다(뜨거나 묻힌다)
        rho = (0.9 * top.R + 0.02 + 0.05) / 2
        dp = math.hypot(x - top.cx - (rho - 0.05) * math.cos(front), y - top.cy - (rho - 0.05) * math.sin(front))
        if abs(dp - rho) < 0.03:
            continue
        spots.append((x, y, top_z(top, x, y) + (T * 0.8 if dp < rho else 0.0) + 0.004))
    for al, r in ((52, 0.50), (61, 0.535), (70, 0.505), (44, 0.53), (-72, 0.52), (80, 0.545), (56, 0.565)):
        a = lib.az(al)
        spots.append((r * math.cos(a), r * math.sin(a), fresh.plate_z(PR, r) + 0.006))
    for i, loc in enumerate(spots):
        s = rnd.uniform(0.85, 1.2)
        ob = seed_ob(lib, f'seed{i}')
        lib.place(ob, loc, (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.25, 0.25), rnd.uniform(0, math.tau)), (s, s, s))
        parts.append(lib.assign(ob, seed_mat))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0, clear={'syrup': dict(absorb='#FFE648', density=58.0, base='#FFF4D6')}), quality=76,
        uv_weight={'syrup': 1.1, 'butter': 1.2, 'seed': 1.6, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'butter': 0.3, 'plate': 0.3},
    )
