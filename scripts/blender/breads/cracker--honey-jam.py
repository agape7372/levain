"""꿀 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 허니아몬드 크래커 — 꿀 시럽이 캐러멜로 구워져 윤 도는 호박색 윗면 · 얇게 저민 아몬드 조각을 얹는다.
구성: 꿀을 발라 윤 도는 호박색 판(캐러멜 얼룩) · 저민 아몬드 조각 13장(크기 · 방향 제각각, 껍질 테). 흰 참깨 70알 초안은 고르게 뿌린 점이라 바꿨다.
"""
import slab


def build(lib):
    def extra(m, col, p, nz):
        brush = m.smooth(m.noise(p, scale=4, detail=4, rough=0.6, distortion=0.5), 0.48, 0.64)
        return m.mix(m.math('MULTIPLY', brush, 0.55), col, '#D07E16')  # 꿀이 캐러멜화한 얼룩(한 방향으로 늘인 붓 자국은 나뭇결로 읽혔다)

    def top(put, rnd):
        m = lib.Mat('almond')
        nz = m.smooth(m.sep(m.lnrm())[2], 0.55, 0.85)
        meat = m.ramp(m.noise(m.lpos(), scale=60, detail=2), [(0.3, '#EED8AA'), (0.7, '#F8E8C4')])
        almond = m.out(m.mix(nz, '#C49060', meat), 0.6)  # 저민 단면 · 옅은 갈색 껍질 테(짙은 테는 눈 · 벌레로 읽혔다)
        for k, (x, y) in enumerate(slab.scatter(rnd, 13, 1.0, 1.0, 0.13)):
            a = rnd.uniform(0.09, 0.13)
            put(slab.pebble(lib, f'al{k}', a, a * 0.6, 0.010, rnd, jit=0.03, taper=0.35, subdiv=2), almond, x, y,
                lift=0.002, lean=8)

    pal = dict(ramp=('#E2982A', '#EEAA38', '#F6BC4A'), edge='#B86A14', blist='#F6C866', hole='#A85C0C',
               side='#BE7418', speck=None)
    return slab.build_cracker(lib, seed=15, pal=pal, rough=(0.55, 0.5), extra=extra, top=top,
                              opts=dict(uv_weight={'almond': 1.4}))
