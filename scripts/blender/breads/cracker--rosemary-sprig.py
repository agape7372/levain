"""로즈마리 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 로즈마리 크래커 상자 · 접시 사진은 생 로즈마리 잔가지를 크래커 위에 올려 보여 준다 · 길쭉한 판 · 굵은 소금(로즈마리 & 씨솔트).
구성: 길쭉한 판 · 눌러 구운 생 로즈마리 잔가지 4개(방향 제각각) · 굵은 소금 몇 알.
"""
import slab


def build(lib):
    L, W = 1.0, 0.62

    def top(put, rnd):
        rose, salt = slab.rosemary_material(lib), slab.salt_material(lib)
        for k, (x, y) in enumerate(slab.scatter(rnd, 4, L - 0.3, W - 0.2, 0.24)):
            put(slab.rosemary(lib, f'rose{k}', rnd.uniform(0.2, 0.27), rnd), rose, x, y, lift=0.0015, lean=0)
        for k, (x, y) in enumerate(slab.scatter(rnd, 8, L, W, 0.12)):
            sz = rnd.uniform(0.026, 0.038)
            put(slab.salt(lib, f'salt{k}', sz, rnd), salt, x, y, lift=sz * 0.2, lean=25)

    return slab.build_cracker(lib, seed=20, L=L, W=W, rows=3, top=top,
                              opts=dict(uv_weight={'rosemary': 1.6, 'salt': 1.2}))
