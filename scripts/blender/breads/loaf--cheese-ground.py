"""치즈 식빵 (loaf--cheese-ground) — 형상 · 껍질은 loaf_kit.build_loaf(가운데서 썰기), 단면 치즈 주머니는 crumb_material + pieces,
넘친 치즈는 loaf_kit.blob_chain.

실물: 네이버 이미지 「치즈 식빵」(2026-11-16) — 대표 모습은 단면 속에 녹아 고인 주황빛 치즈 주머니(불규칙하게 흘러 굳은 덩이, 윤기). 윗면 갈라진 데로 조금 넘쳐 구워진 치즈는 가장자리가 갈색으로 그을렸다.
구성: 가운데쯤 썬 단면(크림 속살 + 크기 섞인 주황 치즈 주머니 · 기름 번짐 · 윤기) · 뚜껑에 조금 넘쳐 그을린 치즈 두 군데.
윗면에 노란 띠를 길게 얹은 첫 판은 겨자 · 애벌레로 읽혔다(두뇌 검토 11-16).
"""
import loaf_kit as lk

# 단면 (y, z) 위 치즈 주머니 — (u, v, 반지름, 각°, 길쭉함). 흘러 굳은 꼴이라 윤곽을 크게 일렁인다
POCKETS = [(-0.13, 0.50, 0.060, 80, 1.6), (0.12, 0.36, 0.046, 20, 1.9), (-0.05, 0.20, 0.040, -30, 1.7),
           (0.17, 0.12, 0.030, 60, 1.5), (-0.20, 0.27, 0.028, 100, 1.4), (0.04, 0.58, 0.024, 0, 1.6)]


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[dict(
        mask=lk.pieces(POCKETS, warp=0.9, wscale=10), col=('#F2B034', '#FAC652'), halo=('#DCA858', 0.5), gloss=0.28)])


def cheese_mat(lib):
    m = lib.Mat('cheese')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=12, detail=3), [(0.3, '#EAA232'), (0.7, '#F4B846')])
    toast = m.smooth(m.noise(p, scale=10, detail=4, distortion=0.4), 0.40, 0.56)  # 넓게 그을린 얼룩(점 아님)
    col = m.mix(m.math('MULTIPLY', toast, 0.9), col, '#94481A')
    h = m.math('ADD', m.noise(p, scale=30, detail=3), m.math('MULTIPLY', toast, -0.4))
    return m.out(col, m.mixf(toast, 0.38, 0.62), m.bump(h, strength=0.4, distance=0.004))


def cheese(lib, body, rnd, x0):
    elems = []
    for xc, n, L in ((0.04, 6, 0.16), (0.30, 4, 0.09)):  # 갈라진 두 자리에서 조금 넘침
        for k in range(n):
            x = xc + L * (k / (n - 1) - 0.5) + rnd.uniform(-0.01, 0.01)
            y = rnd.uniform(-0.03, 0.03)
            z = lk.top_z(body, x, y)[0]
            elems.append(((x, y, z - 0.006), rnd.uniform(0.05, 0.068), (1.4, 1.8, 0.22)))
    ob = lk.blob_chain(lib, 'cheese', elems, tris=2400)
    lk.bury(lib, body, ob)
    return [lib.assign(ob, cheese_mat(lib))]


def build(lib):
    return lk.build_loaf(lib, seed=31, cut=-0.08, crumb=crumb, top=cheese,
                         opts=dict(ao_strength={'*': 0.25, 'cheese': 0.4}, uv_weight={'crumb': 1.6, 'cheese': 1.2},
                                   grade={'*': 1.0, 'cheese': 0.3, 'crumb': 0.6}))
