"""아마씨 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 반죽이 거의 아마씨뿐이라 판 전체가 윤 도는 적갈색 씨앗 덩어리다(구멍 없음 · 손으로 부순 듯한 판).
구성: 구멍 없는 판 · 판 전체를 덮은 윤기 있는 아마씨 결(무늬, 씨마다 색이 다르다) · 위에 솟은 아마씨 알.
금빛 판에 갈색 씨를 박은 초안은 밝은 면의 짙은 점(벌레)이라 버렸다.
"""
import slab


def build(lib):
    def extra(m, col, p, nz):
        vp = m.mapping(p, scale=(1.0, 1.7, 1.0))  # 씨는 길쭉하다
        d = m.voronoi(vp, scale=46, randomness=1.0)
        tone = m.ramp(m.sep(m.voronoi(vp, scale=46, randomness=1.0, out='Color'))[0],
                      [(0.2, '#5A2C14'), (0.55, '#88481E'), (0.9, '#B07030')])
        seed = m.math('SUBTRACT', 1.0, m.smooth(d, 0.30, 0.40))
        return m.mix(seed, col, tone), seed, 0.42

    def top(put, rnd):
        seed = slab.plain_mat(lib, 'seed', '#7A3E1A', '#A46028', rough=0.4, scale=90)
        for k, (x, y) in enumerate(slab.scatter(rnd, 46, 1.0, 1.0, 0.06)):
            a = rnd.uniform(0.042, 0.060)
            put(slab.pebble(lib, f'fx{k}', a, a * 0.56, 0.016, rnd, jit=0.06, taper=0.5), seed, x, y, lift=0.001, lean=14)

    pal = dict(ramp=('#6A3A1C', '#7C4824', '#8E5630'), edge='#52280E', blist='#9A6234', hole='#4E2810',
               side='#62341A', speck=None)
    return slab.build_cracker(lib, seed=14, pal=pal, rough=(0.72, 0.68), extra=extra, top=top, dock=False,
                              opts=dict(uv_weight={'seed': 1.2}))
