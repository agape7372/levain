"""깜빠뉴 (campagne) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/campagne{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 지름 1, 바닥 z=0, 정면 = Blender −Y. 높이/지름 ≈ 0.58(레퍼런스 정면도 0.62에서 귀 높이를 뺐다).
구성: 둥근 불 1메시(초타원 회전체) · X 칼집 홈(벌어진 속살) + 귀 · 바네통 동심 고리 + 밀가루(재질).
공용 형상·재질 = scripts/blender/boule.py
"""
from boule import Score, Shape, boule_mesh, campagne_crust, drop_base
from lib import az

SEED = 3
SHAPE = Shape()
SCORE = Score([az(45), az(-45)])  # 화면에서 X — 팔이 왼쪽 위·오른쪽 위·왼쪽 아래·오른쪽 아래


def build(lib):
    lib.reset(SEED)
    crust = campagne_crust(lib, SHAPE, SCORE)
    ob = lib.assign(boule_mesh(lib, 'boule', SHAPE, SCORE.disp, target=13000), crust)
    drop_base(lib, ob)
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    return [ob], dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45})
