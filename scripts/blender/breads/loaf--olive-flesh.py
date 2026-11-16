"""올리브 식빵 (loaf--olive-flesh) — 형상 · 껍질은 loaf_kit.build_loaf(비스듬히 썰기), 단면은 crumb_material + pieces.

실물: 네이버 이미지 「올리브 식빵」(2026-11-16) — 흰 속살에 블랙 올리브 썬 조각이 박혔다(가운데 씨 구멍이 빈 고리 · 반달 조각, 크기 제각각). 뚜껑에도 고리 조각을 눌러 구운 판이 흔하다.
구성: 비스듬히 썬 단면(크림 속살 + 블랙 · 그린 올리브 고리 조각, 구멍은 속살빛) · 뚜껑에 눌러 구운 고리 조각 넷.
"""
import loaf_kit as lk
import wedge

# (u, v, 반지름, 각°, 길쭉함) — 고리 = 바깥 조각 + 같은 자리 작은 속살 조각 · 반달은 구멍 없이
BLACK = [(-0.15, 0.52, 0.040, 20, 1.25), (0.13, 0.30, 0.034, -35, 1.3), (-0.08, 0.16, 0.030, 70, 1.2),
         (0.20, 0.55, 0.026, 10, 1.6)]
GREEN = [(0.02, 0.40, 0.032, -10, 1.3), (-0.21, 0.30, 0.024, 50, 1.5)]
HOLES = [(u, v, r * 0.42, a, e) for u, v, r, a, e in BLACK[:3] + GREEN[:1]]


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[
        dict(mask=lk.pieces(BLACK, warp=0.2), col=('#2E2228', '#44323A'), halo=('#D8C4A0', 0.35), gloss=0.35),
        dict(mask=lk.pieces(GREEN, warp=0.2), col=('#6E7430', '#7E863A'), halo=('#DCCDA0', 0.35), gloss=0.4),
        dict(mask=lk.pieces(HOLES, warp=0.15), col=('#EED29C', '#F2D8A8'), halo=None, gloss=0.9)])


def ring_mat(lib):
    m = lib.Mat('olive')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, '#34202C'), (0.7, '#4A2E3C')])
    return m.out(col, 0.45, m.bump(m.noise(p, scale=90, detail=2), strength=0.1, distance=0.001))


def rings(lib, body, rnd, x0):
    pts = [(-0.10, 0.06), (0.06, -0.10), (0.20, 0.08), (0.36, -0.03)]

    def ring(lib, nm, r):
        ob, h = wedge.coin(lib, nm, r.uniform(0.038, 0.044), r, thick=0.5)
        lib.delete_faces(ob, lambda c, n: abs(n.z) > 0.5 and c.x * c.x + c.y * c.y < 0.012 ** 2)  # 씨 구멍
        return ob, h

    return lk.stud(lib, body, pts, ring, ring_mat(lib), rnd, sink=0.45, tilt=0.15, name='olive')


def build(lib):
    return lk.build_loaf(lib, seed=35, cut=-0.30, cut_no=(-1, -0.4, 0), crumb=crumb, top=rings,
                         opts=dict(uv_weight={'crumb': 1.6}))
