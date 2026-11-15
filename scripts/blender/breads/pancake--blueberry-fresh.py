"""블루베리 팬케이크 — 이름만 듣고 새로 지음(2026-11-15). 질감 · 조명은 사실적인 쪽.

구성: 흰 접시 · 테가 고르지 않은 도톰한 팬케이크 석 장 · 윗면에 고인 블루베리 콩포트가 카메라 쪽 턱을 넘쳐
굵은 줄기로 흘러내림 · 뒤쪽에 짜 올린 크림 한 덩이, 거기 기대 쌓인 생블루베리 무더기(꼭지 방향 제각각) ·
체로 친 슈가파우더 · 민트 잎 셋 · 접시에 굴러떨어진 알 둘.
"""
import math
import random

import fresh


def build(lib):
    lib.reset(seed=41)
    rnd = random.Random(41)
    R, H, B = 0.46, 0.15, 0.058
    kw = dict(steps=13, wob=0.03)
    # 장 간격 = 두께보다 조금만 좁게: 더 겹치면 위아래 장이 뚫고 지나간 선이 보이는 틈 안에 계단으로 드러난다
    cakes = [
        fresh.Cake(R, H, 0.0, 0.0, 0.0, seed=1, **kw),
        fresh.Cake(R * 0.97, H, 0.146, 0.016, -0.010, seed=2, droop=0.012, **kw),
        fresh.Cake(R * 0.95, H * 0.96, 0.292, -0.012, 0.012, seed=3, droop=0.012, **kw),
    ]
    top = cakes[-1]
    cx, cy = top.cx - 0.01, top.cy - 0.07  # 열매 무더기 자리(앞)
    kx, ky = top.cx + 0.02, top.cy + 0.13  # 크림 자리(뒤) — 무더기 위로 솟아 보인다
    dust = ((cx, cy + 0.06, top.top + 0.14), 0.36, 0.6)
    cake = fresh.cake_mat('cake', R, dust=dust)
    parts = [lib.assign(c.build(f'cake{i}', segs=46), cake) for i, c in enumerate(cakes)]
    PR = R * 1.38
    parts.append(lib.assign(fresh.plate('plate', PR), fresh.plate_mat('plate')))

    # 콩포트: 카메라 쪽으로 쏠려 고였다가 턱을 넘는다. 넓은 혀(지수 2)로 턱을 넘기고 굵은 줄기가 더 흐른다
    front = lib.az(-15)
    pool = fresh.puddle(front, reach=0.04, back=0.10, ph=1.0)
    # 줄기 = (방위, 턱 넘어 흐른 길이, 굵기 배율). 콩포트는 되직해서 짧고 굵게 멈춘다
    runs = [(front - 0.48, 0.09, 1.2), (front - 0.18, 0.27, 0.9), (front + 0.12, 0.05, 1.3), (front + 0.45, 0.16, 1.0)]
    jam = fresh.sauce_mat('compote', '#4C1856', '#B4347A', rough=0.18, lump_bump=0.2)
    parts += fresh.sauce('compote', cakes, pool, runs, jam, w=0.032, plate=PR, thick=0.024, lump=0.8, seed=3.0,
                         riv=dict(aspect=0.62, head=1.35))

    cream = fresh.rosette('cream', r0=0.125, height=0.23, tiers=2.8, tube=0.038, segs=36, rings=34)
    lib.place(cream, (kx, ky, top.top + 0.016), (0.0, 0.0, lib.az(-90)))
    parts.append(lib.assign(cream, fresh.cream_mat('cream', dust=dust)))

    skin = fresh.berry_mat('berry', B, dust=dust)
    z0 = top.top + 0.024 + B * 0.62
    spots = []
    for i in range(6):  # 아래 고리
        a = lib.az(-90) + math.tau * i / 6 + rnd.uniform(-0.2, 0.2)
        r = 0.118 + rnd.uniform(-0.012, 0.012)
        spots.append((cx + r * math.cos(a), cy + r * math.sin(a), z0 + rnd.uniform(-0.006, 0.004)))
    spots.append((cx + 0.005, cy - 0.004, z0 + 0.016))
    for k in range(3):  # 위에 올라앉은 셋
        a = lib.az(-60) + math.tau * k / 3 + rnd.uniform(-0.25, 0.25)
        spots.append((cx + 0.062 * math.cos(a), cy + 0.062 * math.sin(a), z0 + 0.084 + rnd.uniform(-0.006, 0.006)))
    a = lib.az(78)  # 혼자 떨어져 앉은 알
    spots.append((top.cx + 0.30 * math.cos(a), top.cy + 0.30 * math.sin(a), top.top + B * 0.74))
    for al, r in ((38, 0.535), (63, 0.55)):  # 접시에 굴러떨어진 알
        spots.append((r * math.cos(lib.az(al)), r * math.sin(lib.az(al)), B * 0.88 + 0.014))
    for i, loc in enumerate(spots):
        s = rnd.uniform(0.88, 1.10)
        ob = fresh.berry(f'berry{i}', B, segs=13)
        parts.append(lib.assign(lib.place(ob, loc, fresh.scatter_rot(rnd, up_bias=0.5), (s, s, s)), skin))

    # 콩포트에 반쯤 잠긴 익은 알(소스와 같은 재질 — 덩어리 소스로 읽히게)
    for al, r, s in ((-70, 0.24, 0.95), (-25, 0.29, 0.8), (12, 0.22, 0.9), (-115, 0.32, 0.75), (48, 0.31, 0.85)):
        a = lib.az(al)
        ob = lib.lathe(f'stewed{al}', lib.superellipse_profile(B * 0.95, B * 1.6, n=2.0, steps=10), segs=12)
        lib.place(ob, (top.cx + r * math.cos(a), top.cy + r * math.sin(a), top.top + 0.024 - B * s * 1.15),
                  (math.pi + rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), rnd.uniform(0, math.tau)), (s, s, s * 0.8))
        parts.append(lib.assign(ob, jam))

    # 민트: 무더기 앞 왼쪽 어깨에 꽂힌 잎 셋(카메라 왼쪽 위로 벌어진다)
    green = fresh.leaf_mat('mint')
    a = lib.az(-125)
    base = (cx + 0.135 * math.cos(a), cy + 0.135 * math.sin(a), top.top + 0.045)
    for k, (yaw, pitch, s) in enumerate(((-150, 34, 1.45), (-88, 22, 1.2), (-200, 55, 1.0))):
        ob = fresh.leaf(f'mint{k}')
        lib.place(ob, base, (rnd.uniform(-0.35, 0.35), -math.radians(pitch), lib.az(yaw)), (s, s, s))
        parts.append(lib.assign(ob, green))

    return fresh.lift(parts), dict(
        lit=dict(ao=1.0, clear={'compote': dict(weight=0.45, absorb='#A0246C', density=60.0)}), quality=76,
        uv_weight={'compote': 1.2, 'berry': 1.3, 'mint': 1.5, 'cream': 1.3, 'plate': 0.6}, uv_margin=0.006, hide=0.3,
        ao_strength={'*': 0.55, 'cream': 0.15, 'plate': 0.3},
    )
