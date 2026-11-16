"""고구마 식빵 (loaf--sweetpotato-puree) — 형상 · 껍질은 loaf_kit.build_loaf(색 · 비스듬히 썰기), 단면은 crumb_material + swirl,
뚜껑의 고구마 깍둑은 wedge.chunk.

실물: 네이버 이미지 「고구마 식빵」(2026-11-16) — 한국 고구마 식빵은 노르스름한 속살에 고구마 앙금이 노란 띠로 말려 들었고, 뚜껑 위로 깍둑 고구마(노란 속 + 자주 껍질)가 드러나 구워졌다. 자색 속살은 자색고구마 판이라 고르지 않았다.
구성: 반죽색은 단면으로 — 금빛 뚜껑 + 반쯤 묻힌 깍둑 고구마 넷(노랑, 군데군데 자주 껍질) · 옅은 노랑 옆벽 · 비스듬히 썬 단면(노르스름한 속살 + 굵은 고구마 앙금 띠).
"""
import loaf_kit as lk
import wedge

PAL = dict(side=('#F8E2A6', '#FAE8B6'), kiss='#E6BC6E', shred='#FCEAC0', pore='#DEC07E')


def crumb(lib):
    return lk.crumb_material(lib, crumb=('#F2D68E', '#F6DEA0'), pore='#D6B262', rim=('#DAAA58', 0.012),
                             rim_top=(lk.HS, '#B86A28'), fills=[dict(
                                 mask=lk.swirl(c=(0.0, 0.32), pitch=0.11, r=0.27, w=0.5, wob=2.2, wscale=2.5, aspect=1.0),
                                 col=('#E6AA36', '#EEBA4A'), halo=('#F4D07E', 0.4), gloss=0.6)])


def cube_mat(lib):
    m = lib.Mat('potato')
    p = m.lpos()
    col = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, '#E8B442'), (0.7, '#F2C656')])
    skin = m.smooth(m.noise(p, scale=22, detail=2), 0.62, 0.68)  # 자주 껍질이 남은 조각
    col = m.mix(skin, col, '#6E3254')
    return m.out(col, 0.55, m.bump(m.noise(p, scale=70, detail=2), strength=0.2, distance=0.002))


def cubes(lib, body, rnd, x0):
    pts = [(-0.14, 0.06), (0.04, -0.09), (0.20, 0.07), (0.36, -0.05)]
    return lk.stud(lib, body, pts, lambda lib, nm, r: wedge.chunk(lib, nm, r.uniform(0.044, 0.05), r, sides=4,
                                                                  height=0.85, flat=0.8),
                   cube_mat(lib), rnd, sink=0.3, tilt=0.25, name='potato')


def build(lib):
    return lk.build_loaf(lib, seed=67, pal=PAL, cut=-0.30, cut_no=(-1, -0.4, 0), crumb=crumb, top=cubes,
                         opts=dict(uv_weight={'crumb': 1.5, 'potato': 1.2}, grade={'*': 1.0, 'crumb': 0.6}))
