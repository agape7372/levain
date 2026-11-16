"""밤 바게트 (baguette--chestnut-piece) — 형상 · 껍질은 baguette_kit.build_baguette, 밤은 wedge.chunk 를 loaf_kit.stud 로 앉힌다.

실물: 네이버 이미지 「밤 바게트」(2026-11-16) — 밤식빵 · 밤바게트는 노란 당절임 밤 덩이가 반죽 속에 크게 박혀 갈라진 데로 불거진다(겉 소보로판은 다른 메뉴). 단면은 이 크기에서 안 읽혀 쓰지 않는다.
구성: 바게트 몸통 · 조금 더 넓고 깊게 벌어진 칼집 넷 · 칼집 골마다 노란 밤 덩이가 2~4개 불거져 칼집을 메움(크기 · 자리 흩음, 윤기).
"""
import math

import baguette_kit as bk
import loaf_kit as lk
import wedge

SLASHES = [(x, -0.022, -17, 0.105, 0.034, 0.018, 0.010) for x in (-0.26, -0.085, 0.085, 0.26)]
# 칼집 축 위 (칼집 번호, 축 따라 비율, 크기) — 칼집마다 수 · 자리를 흩는다.
# 칼집마다 작은 덩이 1~2개(r1 · r2)는 눈동자 박힌 눈으로 읽혔다 → 칼집을 메우듯 2~4개, 크게
AT = [(0, -0.55, 0.03), (0, 0.0, 0.04), (0, 0.5, 0.026), (1, -0.3, 0.036), (1, 0.35, 0.032),
      (2, -0.6, 0.026), (2, -0.1, 0.038), (2, 0.45, 0.03), (2, 0.8, 0.02), (3, -0.4, 0.034), (3, 0.3, 0.04)]


def chestnuts(lib, body, rnd):
    # 짙은 노랑은 음식 색 보정(채도 높은 따뜻한 색 = 껍질로 보고 짙게)으로 갈색이 됐다 → 옅은 노랑
    mat = wedge.chunk_material(lib, 'nut', [(0.3, '#ECC45C'), (0.6, '#F4D478'), (0.9, '#FAE29A')], rough=0.48)
    pts, sizes = [], []
    for i, f, s in AT:
        x, y, ang, a = SLASHES[i][:4]
        pts.append((x + f * a * math.cos(math.radians(ang)), y + f * a * math.sin(math.radians(ang))))
        sizes.append(s)
    it = iter(sizes)
    make = lambda lib, nm, r: wedge.chunk(lib, nm, next(it), r, sides=5, height=0.85, flat=0.6)
    return lk.stud(lib, body, pts, make, mat, rnd, sink=0.1, tilt=0.3, name='nut')


def build(lib):
    return bk.build_baguette(lib, seed=83, slashes=SLASHES, top=chestnuts,
                             opts=dict(ao_strength={'*': 0.55, 'nut': 0.2}, uv_weight={'nut': 1.6}))
