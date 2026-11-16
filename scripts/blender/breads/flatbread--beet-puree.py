"""비트 플랫브레드 — 실물 사진(네이버 이미지 「비트 플랫브레드」, 2026-11-16)을 보고 지음. 판은 flat_top.build_flatbread.

실물: 비트 퓌레를 섞은 반죽은 진한 자홍으로 물들고, 구우면 부푼 물집 둘레가 적갈색으로 익고 꼭대기가 그을린다.
      한 가지 붉은색 판은 날고기로 읽힌다(BRIEF) → 물집 구움 · 짙은 테로 톤을 섞고 위에 허브 · 소금을 얹는다.
구성: 자홍 판(테 · 옆면 더 짙게, 물집 구움 · 탄 자국) · 로즈마리 잔가지 4 · 굵은 소금 14.
"""
import math

import flat_top
import slab


def build(lib):
    lib.reset(75)

    def top(put, rnd, big):
        avoid = [(x, y, r + 0.02) for x, y, r in big]
        flat_top.sprigs(lib, put, rnd, 4, (0.11, 0.14), avoid, 0.82, 0.72, pairs=3)
        mat = slab.salt_material(lib)
        for k in range(14):
            a, d = rnd.uniform(0, math.tau), 0.4 * math.sqrt(rnd.random())
            s = rnd.uniform(0.016, 0.024)
            put(slab.salt(lib, f'salt{k}', s, rnd), mat, d * math.cos(a), d * math.sin(a) * 0.9, lift=s * 0.2, lean=25)

    pal = dict(ramp=('#A23454', '#AE4060', '#B84C6A'), fine='#8A2E40', edge='#74263A', side='#862C48')
    return flat_top.build_flatbread(lib, 75, counts=(8, 10, 6), char_k=0.9, pal=pal, top=top,
                                    opts=dict(ao_strength={'salt': 0.3}))
