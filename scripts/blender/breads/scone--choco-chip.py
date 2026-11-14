"""초코칩 스콘 (scone--choco-chip) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/scone--choco-chip{,-2,-3}.png — 정면(1번)이 정체성 기준.
스콘(scone.py)과 같은 쐐기(wedge.py)에 손으로 썬 초콜릿 덩어리 7개를 윗면에 반쯤 묻었다 + 단면에 2개.
쐐기는 기본 스콘보다 조금 넓고(반각 37°) 낮다(높이 0.40). 꼭지는 앞에서 살짝 오른쪽(레퍼런스 1번).
윗면 금은 칼로 그은 듯한 곧은 선 둘(뒤 왼쪽 → 앞 오른쪽 사선 하나 + 왼쪽에서 만나는 짧은 선).
레퍼런스 실측: 윗면 #E8B25D~#EFBC70 · 옆 밝은 쪽 #EAD1A9 · 그늘 #C6AE87 · 초콜릿 #834831~#894F37(밀크, 윤기).
덩어리 자리는 레퍼런스 3번(위에서)에서 꼭지 원점·바깥 호 = 1 로 읽었다.
단면 덩어리: 프롬프트 v3은 단면을 비웠다(생성기가 면마다 정중앙 등간격 세 점을 찍어 기각) —
  여기선 크기·높이를 달리한 두 개만, 한쪽으로 치우쳐 둔다.
"""
import math
import random

from mathutils import Vector
from wedge import build_wedge, chunk, chunk_material, place_all, press_into, scone_material

SEED = 4
H = 0.40
HALF = math.radians(37)
CRACKS = [
    ('seg', (-0.285, 1.0), (0.177, 0.27), 0.75),
    ('seg', (-0.48, 0.64), (0.028, 0.43), 0.6),
]
# 윗면 덩어리 — (x, y, 크기, 밑면 변 수, 법선 기울임 x·y°, 회전°). 레퍼런스 3번은 비스듬히 찍혀 쐐기가
# 왼쪽 43°·오른쪽 32°로 기울었다 — 꼭지에서 잰 각을 이등분선 기준으로 되돌려 읽었다(r1은 그대로 읽어 테 밖으로 비어져 나옴)
TOP = [
    (-0.291, 0.669, 0.135, 4, (4, -3), 20),  # 왼쪽 큰 덩어리
    (0.154, 0.765, 0.125, 4, (-3, 3), 65),  # 뒤 오른쪽 큰 덩어리
    (-0.071, 0.807, 0.062, 3, (3, 5), 10),  # 뒤 작은 세모
    (0.003, 0.520, 0.092, 4, (-5, -2), 35),  # 가운데
    (0.229, 0.500, 0.070, 3, (3, -4), 80),  # 오른쪽 작은 세모
    (-0.216, 0.360, 0.085, 4, (-3, 4), 5),  # 앞 왼쪽
    (-0.037, 0.237, 0.066, 3, (5, 2), 50),  # 꼭지 쪽 작은 세모
]
# 단면 덩어리 — (면 'L'|'R', 꼭지에서 비율, 높이 비율, 크기)
# 작은 두 점(0.055·0.036)은 64px에서 구멍·티로 읽혔다(r1) — 왼쪽 단면에 큰 조각 하나만
SIDE = []  # 단면 조각은 앞 모서리에 튀어나온 혹으로 읽혀 뺐다(본세션 검수) — 레퍼런스는 윗면에만


def build(lib):
    lib.reset(SEED)
    rnd = random.Random(SEED)
    crumb = scone_material(lib, H,
                           top_stops=[(0.25, '#E29A3A'), (0.50, '#EEB050'), (0.75, '#F8C468')],
                           side_stops=[(0.30, '#F4D7A4'), (0.50, '#FBE2B6'), (0.72, '#F7DBAC')])
    # r2 #5A2C19 · 거칠기 0.3은 젖은 비닐처럼 번들거렸다 — 레퍼런스 밀크 초콜릿(#834831)에 맞춰 밝히고 윤기를 낮춘다
    choco = chunk_material(lib, 'choco', [(0.3, '#6A3520'), (0.7, '#80462C')], rough=0.36)
    body, _, _ = build_wedge(lib, crumb, H=H, half=HALF, seed=2.1, cracks=CRACKS, tris=11500)
    parts = [body]
    for i, (x, y, size, n, tilt, spin) in enumerate(TOP):
        ob, h = chunk(lib, f'chip{i}', size, rnd, sides=n, height=0.62, flat=0.62)  # 기본(0.8·0.55)은 곧추선 각설탕으로 읽혔다(r3)
        press_into(lib, body, ob, h, at_xy=(x, y), sink=0.36, tilt=tuple(math.radians(t) for t in tilt),
                   spin=math.radians(spin))
        parts.append(lib.assign(ob, choco))
    for i, (face, u, zf, size) in enumerate(SIDE):
        s = -1 if face == 'L' else 1
        along = Vector((s * math.sin(HALF), math.cos(HALF), 0.0))
        out = Vector((s * math.cos(HALF), -math.sin(HALF), 0.0))
        org = along * u + out * 0.5 + Vector((0, 0, H * zf))
        ob, h = chunk(lib, f'cut{i}', size, rnd, sides=4, height=0.4, flat=0.75)
        press_into(lib, body, ob, h, side_hit=(org, -out), sink=0.72, spin=math.radians(30 + 40 * i))
        parts.append(lib.assign(ob, choco))
    place_all(parts, tip_alpha=3)  # 10은 꼭지가 오른쪽으로 비켜 호가 왼쪽 뒤로 돌았다(r1)
    for p in parts:
        print(f'  {p.name:12s} {lib.tri_count(p):6d} tri')
    return parts, dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.5, 'choco': 0.5},
                       uv_weight={'crumb': 1.0, 'choco': 1.6})
