"""스콘 (scone) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/scone{,-2,-3}.png — 정면(1번)이 정체성 기준.
둥근 스콘을 자른 두툼한 삼각 쐐기 하나: 바닥에 눕고 꼭지가 앞(살짝 왼쪽). 높이 ≈ 폭의 0.44.
윗면만 금갈색 크러스트 + 얕은 갈라짐 네 줄(바깥 호와 나란한 끊긴 호), 옆 단면 = 크림 속살 + 가로 켜.
레퍼런스 실측(1번): 윗면 #EBA952~#FABB64 · 크러스트 모서리 #E0A451 · 옆 밝은 쪽 #F2D6A8 · 그늘 쪽 #E0C395 ·
  바닥 모서리 #E9C488. 공용 형상·재질 = scripts/blender/wedge.py.
"""
import math

from wedge import build_wedge, place_all, scone_material

SEED = 3
H = 0.44
# 갈라짐 — φ = 이등분선에서 잰 각(+ = 오른쪽), r = 꼭지에서 거리(바깥 호 = 1). 레퍼런스 3번(위에서)에서 읽었다
CRACKS = [
    ('arc', 0.72, -0.40, 0.14),
    ('arc', 0.68, 0.20, 0.50),
    ('arc', 0.50, -0.48, 0.30),
    ('arc', 0.30, -0.30, 0.20),
]


def build(lib):
    lib.reset(SEED)
    mat = scone_material(lib, H,
                         top_stops=[(0.25, '#E4922E'), (0.50, '#F0AA44'), (0.75, '#FAC262')],
                         side_stops=[(0.30, '#F5D49C'), (0.50, '#FCE0AE'), (0.72, '#F8D8A4')])
    body, _, _ = build_wedge(lib, mat, H=H, half=math.radians(33), seed=1.3, cracks=CRACKS)
    parts = [body]
    place_all(parts, tip_alpha=-6)  # -15는 왼쪽 단면이 좁게 접혔다(r1)
    for p in parts:
        print(f'  {p.name:12s} {lib.tri_count(p):6d} tri')
    return parts, dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.5},  # 켜 골 그림자를 살린다
                       uv_weight={'crumb': 1.0})
