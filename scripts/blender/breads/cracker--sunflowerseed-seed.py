"""해바라기씨 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 시그달 크리스프브레드 — 구멍 없는 통곡물 갈색 판에 잿빛 베이지 해바라기씨 알맹이가 빽빽이 솟는다.
구성: 구멍 없는 통밀 갈색 판 · 눌러 박은 굵은 해바라기씨 알맹이 34알(크기 · 방향 제각각).
"""
import slab


def build(lib):
    def top(put, rnd):
        seed = slab.plain_mat(lib, 'seed', '#A49878', '#C2B694', rough=0.6, scale=70)  # 흰 쌀알빛은 구더기로 읽혔다 — 잿빛 베이지로
        for k, (x, y) in enumerate(slab.scatter(rnd, 34, 1.0, 1.0, 0.075)):
            a = rnd.uniform(0.07, 0.1)
            put(slab.pebble(lib, f'sf{k}', a, a * 0.6, 0.028, rnd, jit=0.06, taper=0.5), seed, x, y, lift=0.001, lean=16)

    pal = dict(ramp=('#9C6430', '#AC743C', '#BC8448'), edge='#80501E', blist='#C69458', hole='#7A4C1E',
               side='#8E5A28', speck='#5A3818')
    return slab.build_cracker(lib, seed=21, pal=pal, top=top, dock=False, opts=dict(uv_weight={'seed': 1.2}))
