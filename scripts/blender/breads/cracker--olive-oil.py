"""올리브유 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16) · 프롬프트 JSON 을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 크릭(CRICH)류 — 얇고 길쭉한 연금빛 판 · 고른 바늘 구멍 · 기름이 밴 자리가 짙은 금빛으로 번진다 · 토핑이 거의 없다.
구성: 길쭉한 판 · 올리브유가 밴 짙은 올리브 금빛 얼룩(무늬) · 굵은 소금 몇 알만.
"""
import slab


def build(lib):
    L, W = 1.0, 0.62

    def extra(m, col, p, nz):
        soak = m.smooth(m.noise(p, scale=3.5, detail=3, rough=0.5, distortion=0.4), 0.46, 0.64)
        return m.mix(m.math('MULTIPLY', soak, 0.7), col, '#C8923A')  # 기름이 밴 자리

    def top(put, rnd):
        salt = slab.salt_material(lib)
        for k, (x, y) in enumerate(slab.scatter(rnd, 8, L, W, 0.14)):
            sz = rnd.uniform(0.026, 0.040)
            put(slab.salt(lib, f'salt{k}', sz, rnd), salt, x, y, lift=sz * 0.2, lean=25)

    pal = dict(ramp=('#E4AC4C', '#EEBA5A', '#F4C86A'), blist='#FAD88E', speck=None)
    return slab.build_cracker(lib, seed=17, L=L, W=W, rows=3, pal=pal, extra=extra, top=top,
                              opts=dict(uv_weight={'salt': 1.2}))
