"""깜빠뉴 (campagne) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/campagne{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 지름 1, 바닥 z=0, 정면 = Blender −Y. 높이/지름 ≈ 0.58(레퍼런스 정면도 0.62에서 귀 높이를 뺐다).
구성: 둥근 불 1메시(초타원 회전체) · X 칼집 홈(벌어진 속살) + 귀 · 바네통 동심 고리 + 밀가루(재질).
공용 형상·재질 = scripts/blender/boule.py · 조립 = boule_variant.build_campagne_variant(변형 campagne--* 도 같은 함수)
"""
from boule_variant import build_campagne_variant

SEED = 3


def build(lib):
    return build_campagne_variant(lib, SEED)
