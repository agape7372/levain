"""더블초코 포카치아 — 실물 사진(네이버 이미지 「초코 포카치아」, 2026-11-16) · 프롬프트 assets/prompts/breads/focaccia--choco-cocoa.json.
판은 slab.build_focaccia, 초콜릿 조각은 wedge.chunk.

실물: 코코아 반죽이라 판 전체가 갈색 · 굵은 초콜릿 조각이 윗면에 솟고 일부는 녹아 딤플에 윤기 있게 고인다.
      짙은 판 위 흰 가루는 곰팡이로 읽혀 슈가파우더 · 소금 · 허브는 뺐다. 깊이 묻은 덩이 · 짙게 칠한 빈 딤플은 구멍,
      각진 다크 덩이 7개는 검은 돌로 읽혔다(두뇌 검수) → 납작하고 모서리 무른 판 초콜릿 조각 + 녹아 고인 웅덩이.
구성: 코코아 갈색 판 · 얕은 딤플 · 판 초콜릿 조각 5(밀크~다크 갈색, 낮게) · 녹아 딤플에 고인 초콜릿 웅덩이 2(윤기).
"""
import random

import flat_top
import slab
import wedge
from mathutils import Matrix

SEED = 67
L, W, T = 1.0, 0.74, 0.12


def build(lib):
    lib.reset(SEED)
    seats = slab.scatter(random.Random(SEED), 15, L - 0.14, W - 0.12, 0.17)  # 앞 7 = 초콜릿 자리, 나머지 = 빈 딤플

    def top(put, rnd, seats):
        mat = wedge.chunk_material(lib, 'choco', [(0.3, '#4E2A16'), (0.7, '#6A3A20')], rough=0.35)
        pool = flat_top.melt_mat(lib, 'choco_melt', ('#3A1C10', '#46241A'), '#5A321E', rough=0.3, width=(0.75, 1.0))
        for k, (x, y) in enumerate(seats[:7]):
            if k in (2, 5):
                put(flat_top.dollop(lib, f'pool{k}', rnd, n=4, flat=0.18, lumpy=0.02), pool, x, y, lift=0.004, lean=2,
                    pre=Matrix.Scale(rnd.uniform(0.07, 0.085), 4))
                continue
            ob, h = wedge.chunk(lib, f'choco{k}', rnd.uniform(0.052, 0.066), rnd, sides=6, height=0.42, flat=0.86)
            put(ob, mat, x, y, lift=0.004, lean=22)

    return flat_top.build_focaccia_top(
        lib, SEED, seats=seats, top=top, L=L, W=W, T=T, RC=0.07, olives=[], oil_r=0.07, oil_d=0.016,
        olive_r=0.05, olive_d=0.02, sprigs=0, salt_n=0, ao_crust=0.45,
        crust_kw=dict(top=('#6A3C26', '#7A4630', '#88523A'), brown='#4A2618', dimple='#8E5C3C',  # 딤플 = 기름 밴 밝은 갈색
                      side=('#8A5A40', '#96664A'), pore='#5A3422', bump=0.55),
        opts=dict(ao_strength={'choco': 0.45, 'choco_melt': 0.3}, uv_weight={'choco': 1.3, 'choco_melt': 1.2}))
