"""올리브 과육 포카치아 (focaccia--olive-flesh) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/focaccia--olive-flesh{,-2,-3}.png — 정면(1번)이 정체성 기준, 배치는 위에서 본 3번을 옮겼다.
단위: 긴 변 1, 바닥 z=0, 정면 = Blender −Y. 형상·재질·조립은 slab.py(build_focaccia) — 포카치아와 같은 판.
구성: 더 작고 도톰한 판(옆면까지 금빛) · 딤플에 눕혀 박은 보랏빛 칼라마타 10 · 기름 웅덩이 2 · 바늘 자국 2 ·
      낱 로즈마리 잎 6 · 소금 12.
"""
import math

import slab

SEED = 33
L, W, T = 1.0, 0.64, 0.14
# 위에서 본 레퍼런스(3번) 좌표 → 판 (x, y). 앞 = −y
OLIVES = [(-0.303, 0.180), (-0.084, 0.197), (0.134, 0.191), (0.353, 0.208), (-0.008, 0.044), (-0.237, -0.016),
          (0.369, -0.055), (-0.379, -0.120), (0.107, -0.142), (0.266, -0.178)]
OIL = [(0.238, 0.055), (-0.122, -0.137)]
PINS = [(-0.161, 0.093), (0.222, -0.077)]


def build(lib):
    lib.reset(SEED)
    return slab.build_focaccia(
        lib, SEED, L, W, T, 0.08, OIL, OLIVES, oil_r=0.045, oil_d=0.032, olive_r=0.075, olive_d=0.042, pins=PINS,
        slab_tris=10000, bevel=(0.05, 0.02), wave=0.6,
        # 올리브마다 손가락 딤플(올리브보다 넓게) · 딤플 안은 기름 밴 색 — 윗면이 평평하다는 지적(r8 검수)
        olive_oil=1.0, ao_crust=0.45,  # 0.45 · 깊이 0.032는 딤플이 안 보였다(r9)
        # 옆면도 기름에 구운 금빛(레퍼런스) — 속살빛 기공 띠 없음
        crust_kw=dict(top=('#E59830', '#F0AE40', '#F7BE52'), brown='#D08A2A', rough_top=0.88, side=('#E9AA44', '#F0B954'),
                      pore='#D59A3E', bump=0.6),  # 레퍼런스는 울퉁불퉁한 반죽 결
        # 칼라마타 반쪽 — 적갈색 껍질(레퍼런스 실측 #5A3030~#965444 · 자주로 칠한 판은 회보라로 떴다, r5) · 단면 과육 · 씨 자리 홈. 눕혀 단면이 위(레퍼런스 과육 조각)
        olive_kw=dict(skin=('#5A2622', '#763A32', '#8E4A3E'), hole='#2A0C0C', cut=('#8E4636', '#A85E48'), rough=0.32),
        olive_len=(0.082, 0.092), olive_dia=(0.068, 0.076), olive_sink=0.08, olive_lean=(15, 35), olive_half=True,
        olive_face=lib.CAM + math.pi,  # 단면은 카메라 반대로 — 카메라를 본 단면은 납작한 원반으로 읽혔다(r6)
        sprigs=6, sprig_len=(0.05, 0.065), sprig_pairs=0, salt_n=12, salt_size=(0.016, 0.022))
