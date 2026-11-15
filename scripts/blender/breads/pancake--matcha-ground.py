"""말차 팬케이크 — 이름만 듣고 새로 지음(2026-11-15). 질감 · 조명은 사실적인 쪽.

구성: 흰 접시 · 키가 큰 수플레 팬케이크 두 장(옆구리는 연한 말차빛 속살 + 세로 주름, 윗면만 노릇) ·
짙은 말차 소스가 넓게 고였다가 굵은 줄기로 흘러내림 · 별 깍지로 높이 짜 올린 휘핑크림 ·
팥소 한 덩이(통팥 알이 박힘) · 경단 세 알 · 한쪽에서 체로 친 말차 가루.
"""
import math
import random

from mathutils import Matrix, Vector

import fresh


def build(lib):
    lib.reset(seed=63)
    rnd = random.Random(63)
    R, H, T = 0.36, 0.25, 0.020
    kw = dict(n=4.6, steps=18, wob=0.016, pleat=0.010)
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=21, dome=0.020, **kw),
        fresh.Cake(R * 0.95, H * 0.96, 0.246, 0.040, 0.022, seed=22, dome=0.022, droop=0.010, **kw),
    ]
    top = cakes[-1]

    def at(al, r, z=0.0):  # 윗장 가운데에서 카메라 기준 방위 al 로 r
        a = lib.az(al)
        return (top.cx + r * math.cos(a), top.cy + r * math.sin(a), top.top + T + z)

    # 크림 자리(뒤 왼쪽)와 가루: 카메라 왼쪽 앞에서 쳐서 반쪽만 덮인다
    kx, ky, _ = at(150, 0.10)
    a = lib.az(-70)
    dust = ((kx + 0.11 * math.cos(a), ky + 0.11 * math.sin(a), top.top + 0.13), 0.29, 1.0, '#5F8020', 0.3, 0.85)
    cake = fresh.cake_mat('cake', R, top=('#D2B85C', '#AC923A', '#846A24'), side=('#E2E0A4', '#CDD288'),
                          pit='#A6B25A', pore_scale=62.0, dust=dust)
    parts = [lib.assign(c.build(f'cake{i}', segs=64), cake) for i, c in enumerate(cakes)]
    PR = R * 1.30
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate', '#3B3A3A', rough=0.42)))

    front = lib.az(-25)
    pool = fresh.puddle(front, reach=0.035, back=0.11, ph=0.4)
    # 줄기 = (방위, 턱 넘어 흐른 길이, 굵기 배율). 연유 농도라 굵고 둥글게, 길이는 제각각
    runs = [(front - 0.50, 0.26, 0.9), (front - 0.30, 0.05, 1.2), (front + 0.02, 0.12, 0.75), (front + 0.38, 0.19, 1.05),
            (front + 0.55, 0.03, 1.0)]
    parts += fresh.sauce('glaze', cakes, pool, runs, fresh.sauce_mat('glaze', '#5E8420', '#A9C64E', rough=0.16, depth=0.010),
                         w=0.034, plate=PR, thick=T, riv=dict(aspect=0.6, head=1.5))

    cream = fresh.rosette('cream', r0=0.125, height=0.17, tiers=2.3, tube=0.042, segs=48, rings=48, soft=1.0)
    lib.place(cream, (kx, ky, top.top + T - 0.008), (0.0, 0.0, lib.az(-90)))
    parts.append(lib.assign(cream, fresh.cream_mat('cream')))

    # 팥소: 숟가락 둘로 빚은 길쭉한 한 덩이(카메라 오른쪽 앞, 비스듬히). 통팥 알 몇이 겉에 반 넘게 묻혀 눕는다.
    # 둥근 덩이에 알을 돌려 박은 판은 산딸기로 읽혔다
    sx, sy, sz = at(48, 0.15, -0.050)
    S, spin = (1.45, 0.92, 0.85), Matrix.Rotation(lib.az(18), 4, 'Z')
    parts.append(lib.assign(lib.place(fresh.scoop('anko', seed=4.0), (sx, sy, sz), (0.0, 0.0, lib.az(18)), S), fresh.anko_mat(cols=('#4A1A1C', '#70292A', '#964038'), bump=0.45)))
    red = fresh.bean_mat()
    for k, (th, ph) in enumerate(((-150, 40), (-60, 66), (25, 34), (95, 72), (-105, 80), (160, 60), (-20, 12))):
        t, p = math.radians(th), math.radians(ph)
        u = Vector((math.sin(p) * math.cos(t), math.sin(p) * math.sin(t), math.cos(p)))
        loc = Vector((sx, sy, sz)) + spin @ Vector((u.x * 0.075 * S[0], u.y * 0.075 * S[1], (0.065 + u.z * 0.057) * S[2]))
        out = spin.to_3x3() @ Vector((u.x / S[0], u.y / S[1], u.z / S[2])).normalized()
        ob = fresh.bean(f'bean{k}')
        s = rnd.uniform(0.85, 1.15)
        ob.matrix_world = (Matrix.Translation(loc) @ lib.frame(out.cross(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0.3))), out)
                           @ Matrix.Diagonal((s, s, s, 1.0)))
        parts.append(lib.assign(ob, red))

    # 경단 세 알: 카메라 왼쪽 앞에 모여 앉는다
    white = fresh.dango_mat()
    for k, (al, r, s) in enumerate(((-62, 0.15, 1.0), (-100, 0.19, 0.94), (-78, 0.25, 0.9))):
        x, y, z = at(al, r, -0.010)
        parts.append(lib.assign(lib.place(fresh.dango(f'dango{k}'), (x, y, z), (0.0, 0.0, rnd.uniform(0, 6.0)), (s, s, s)), white))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, sheen=0.0), quality=76,  # 창 광택은 끈다: 고인 글레이즈 가운데 흰 줄로 앉았다
        ao_strength={'*': 0.55, 'cream': 0.15, 'dango': 0.15, 'plate': 0.3},
        uv_weight={'glaze': 1.1, 'cream': 1.4, 'anko': 1.3, 'bean': 1.3, 'dango': 1.2, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
    )
