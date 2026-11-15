"""꿀 팬케이크 — 이름만 듣고 새로 지음(2026-11-15). 질감 · 조명은 사실적인 쪽(진한 갈색 윗면 + 비치는 꿀).

구성: 흰 접시 · 테가 고르지 않은 팬케이크 넉 장을 어긋나게 높이 쌓음 · 꿀이 윗면을 거의 다 덮고
턱을 넘어 굵고 둥근 줄기로 흘러내림(길이 제각각) · 녹아 번지는 네모 버터 한 조각 ·
방마다 꿀이 찬 벌집 한 덩이를 카메라 쪽으로 기울여 얹음.
"""
import math

import fresh


def build(lib):
    lib.reset(seed=52)
    R, H, T = 0.42, 0.125, 0.020
    kw = dict(steps=13, wob=0.03)
    # 장 간격 = 두께보다 조금만 좁게: 더 겹치면 위아래 장이 뚫고 지나간 선이 보이는 틈 안에 계단으로 드러난다
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=11, **kw),
        fresh.Cake(R * 0.965, H, 0.122, 0.022, 0.012, seed=12, droop=0.010, **kw),
        fresh.Cake(R * 0.99, H, 0.244, -0.018, -0.012, seed=13, droop=0.010, **kw),
        fresh.Cake(R * 0.93, H * 0.96, 0.366, 0.012, 0.020, seed=14, droop=0.012, **kw),
    ]
    top = cakes[-1]
    cake = fresh.cake_mat('cake', R)
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.27
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#A9C0CF')))

    # 버터: 가운데에서 카메라 왼쪽 앞
    a = lib.az(-55)
    bx, by = top.cx + 0.085 * math.cos(a), top.cy + 0.085 * math.sin(a)
    pat = fresh.butter('butter', a=0.15, h=0.05, seed=2.0)
    lib.place(pat, (bx, by, top.top + T - 0.008), (math.radians(4), math.radians(-5), lib.az(28)))
    parts.append(lib.assign(pat, fresh.butter_mat('butter', h=0.05)))

    # 꿀: 윗면을 거의 다 덮는다(테 둘레로 구운 면이 조금 남는다). 넓은 혀(지수 2)가 턱을 넘기고 굵은 줄기가 더 흐른다
    front = lib.az(-20)
    pool = fresh.puddle(front, reach=0.03, back=0.16, ph=2.0)
    # 줄기 = (방위, 턱 넘어 흐른 길이, 굵기 배율). 꿀은 점도가 높아 가는 실로 길게 늘어지고 머리가 굵다
    runs = [(front - 0.52, 0.22, 0.8), (front - 0.40, 0.12, 0.6), (front - 0.05, 0.25, 1.0), (front + 0.22, 0.06, 1.2),
            (front + 0.50, 0.20, 0.75)]
    mat = fresh.sauce_mat('honey', '#B4640A', '#DC961E', rough=0.10, edge=(0.1, 1.0), side_col='#F6BE4C',
                          melt=((bx, by, top.top + T), 0.13, '#F8E08E'))
    parts += fresh.sauce('honey', cakes, pool, runs, mat, w=0.022, plate=PR, thick=T, embed=0.004, ds=0.028, segs=56, lump=0.3, lump_scale=7.0,
                         riv=dict(aspect=0.62, head=1.6))

    # 벌집: 카메라 오른쪽 뒤, 방이 뚫린 면을 카메라 쪽으로 기울인다
    roll = math.radians(30)
    a = lib.az(118)
    comb = fresh.honeycomb('comb', cols=7, rows=5, a=0.021, slab=0.052, seed=5)
    cz = top.top + T - 0.008 + 0.079 * math.sin(roll) + 0.026 * math.cos(roll)
    lib.place(comb, (top.cx + 0.14 * math.cos(a), top.cy + 0.14 * math.sin(a), cz), (roll, 0.0, lib.az(96)))
    parts.append(lib.assign(comb, fresh.comb_mat('comb')))

    return fresh.lift(parts), dict(
        uv_weight={'honey': 1.1, 'comb': 1.5, 'butter': 1.2, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'cream': 0.15, 'plate': 0.3},
        lit=dict(ao=1.0, sheen=0.0, clear={'honey': dict(absorb='#FFF050', density=45.0, base='#FFF4D6')}), quality=76,
    )
