"""바나나 플랫브레드 — 실물 사진(네이버 이미지 「바나나 플랫브레드」 · 플랫브레드 바나나피자, 2026-11-16)을 보고 지음.
판은 flat_top.build_flatbread, 조각은 wedge.coin.

실물: 바나나를 동글게 썰어 판 위에 둥글게 둘러 얹고 구우면 윗면이 캐러멜처럼 노릇해진다 — 크림빛 원반에 갈색 윗면.
구성: 바나나 원반 9(크게 · 판 가운데를 두르는 고리로, 간격 · 크기 들쭉날쭉) · 물집 · 탄 자국(옅게).
"""
import math

import flat_top
import wedge


def build(lib):
    lib.reset(65)

    def top(put, rnd, big):
        mat = flat_top.toast_mat(lib, 'banana', ('#F2DEA2', '#F6E6B4'), '#C4802E', rough=0.6, amount=0.65)
        a0 = rnd.uniform(0, math.tau)
        for k in range(9):
            a = a0 + math.tau * k / 9 + rnd.uniform(-0.15, 0.15)
            d = rnd.uniform(0.22, 0.27)
            ob, h = wedge.coin(lib, f'banana{k}', rnd.uniform(0.056, 0.066), rnd, thick=0.32)
            put(ob, mat, d * math.cos(a), d * math.sin(a) * 0.9, lift=-h * 0.1, lean=6)

    return flat_top.build_flatbread(lib, 65, counts=(6, 6, 0), char_k=0.7, top=top,
                                    opts=dict(ao_strength={'banana': 0.35}, uv_weight={'banana': 1.4}))
