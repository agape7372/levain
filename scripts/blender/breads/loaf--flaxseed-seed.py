"""아마씨 식빵 (loaf--flaxseed-seed) — 형상 · 껍질은 loaf_kit.build_loaf, 씨는 뚜껑 덧칠(fx), 단면은 crumb_material.

실물: 네이버 이미지 「아마씨 식빵」(2026-11-16) — 통곡물빛 반죽에 아마씨가 섞여 뚜껑 겉에 윤기 나는 갈색 납작 씨가 빽빽이 드러났고, 썬 속살은 옅은 통밀색에 씨결이 은은하다.
구성: 껍질 쪽 — 옅은 금빛 뚜껑을 덮은 윤기 갈색 납작 씨결(길쭉한 보로노이 두 방향) · 끝을 썬 통밀빛 단면(씨결은 낮은 대비로만).
(포피시드 = 잿빛 푸른 고운 점결, 이쪽 = 윤기 갈색 길쭉한 씨 + 통밀 단면으로 가른다)
"""
import loaf_kit as lk

PAL = dict(crust=('#D49048', '#DEA056', '#E8AE62'), side=('#F2DCB0', '#F6E4BE'), pore='#D2AC78')


def seeds(m, p, cap, col, rough, h):
    k = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1.0, 2.0, 1.0)), scale=34, randomness=1.0), 0.16, 0.26))
    k2 = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, loc=(2.3, 0.9, 1.1), scale=(2.0, 1.0, 1.0)), scale=34,
                                                    randomness=1.0), 0.14, 0.24))
    cov = m.math('MULTIPLY', cap, m.smooth(m.sep(m.lnrm())[2], 0.35, 0.7))
    k = m.math('MULTIPLY', m.math('MAXIMUM', k, k2), cov)
    sc = m.ramp(m.noise(p, scale=120, detail=1), [(0.3, '#5A2E14'), (0.7, '#7A4620')])
    return m.mix(k, col, sc), m.mixf(k, rough, 0.35), m.math('ADD', h, m.math('MULTIPLY', k, 0.5))


def speck(m, u, v, p):
    d = m.voronoi(m.mapping(p, scale=(1.0, 1.0, 1.6)), scale=60, randomness=1.0)
    return m.math('SUBTRACT', 1.0, m.smooth(d, 0.10, 0.18)), None


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#D6B47E', '#E0C08E'), pore='#B48C58', rim=('#B07C40', 0.012),
                             rim_top=(lk.HS, '#A8682A'), fills=[dict(mask=speck, col=('#A47A48', '#B08654'), gloss=0.6)])


def build(lib):
    return lk.build_loaf(lib, seed=63, pal=PAL, fx=seeds, cut=-0.40, crumb=crumb, opts=dict(uv_weight={'crumb': 1.5}))
