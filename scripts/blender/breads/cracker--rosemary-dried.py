"""말린 로즈마리 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 크릭 로즈마리 · 트리스킷 로즈마리 — 연금빛 판에 잘게 부순 로즈마리가 군데군데 뭉쳐 박힌다. 잎이 판 전체에 고르게 퍼지지 않는다.
구성: 연금빛 판 · 반죽에 섞인 잔 허브 조각(무늬) · 부순 로즈마리 낱잎을 몇 군데 뭉치로(뭉치마다 3~7장, 방향 제각각). 소금은 빼서 잔가지(sprig) 판과 가른다.
"""
import slab


def build(lib):
    def extra(m, col, p, nz):  # 반죽에 섞인 잔 허브 조각 — 가늘고 길쭉하게, 방향은 잡음으로 흔든다
        vp = m.mapping(p, rot=(0, 0, 0.6), scale=(1.0, 3.0, 1.0))
        d = m.voronoi(vp, scale=18, randomness=1.0)
        keep = m.smooth(m.sep(m.voronoi(vp, scale=18, randomness=1.0, out='Color'))[0], 0.45, 0.47)
        fleck = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.12, 0.2)), keep)
        return m.mix(m.math('MULTIPLY', fleck, m.smooth(nz, 0.5, 0.8)), col, '#56702E')

    def top(put, rnd):
        herb = slab.plain_mat(lib, 'rosemary', '#5E7438', '#7E9450', rough=0.6)
        k = 0
        for cx, cy in slab.scatter(rnd, 10, 0.86, 0.86, 0.24):
            for _ in range(rnd.randint(4, 8)):
                x, y = cx + rnd.gauss(0, 0.035), cy + rnd.gauss(0, 0.035)
                put(slab.rosemary(lib, f'nd{k}', rnd.uniform(0.05, 0.085), rnd, n_pairs=0), herb, x, y, lift=0.001, lean=0)
                k += 1

    pal = dict(ramp=('#E8B050', '#F2C060', '#F6CC72'), blist='#FCDC98', speck=None)
    return slab.build_cracker(lib, seed=19, pal=pal, extra=extra, top=top, opts=dict(uv_weight={'rosemary': 1.6}))
