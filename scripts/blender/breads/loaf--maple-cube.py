"""메이플 큐브 식빵 (loaf--maple-cube) — 형상 · 껍질은 loaf_kit.build_loaf(가운데서 썰기), 단면은 crumb_material + pieces(box),
뚜껑의 메이플 큐브는 wedge.chunk.

실물: 네이버 이미지 「메이플 큐브 식빵」 · 레시피(2026-11-16) — 반죽에 넣은 메이플 설탕 큐브가 구우며 녹아 단면에 호박색 네모 웅덩이로 남고, 뚜껑 위로 드러난 큐브는 윤기 나게 캐러멜화된다.
구성: 윤기 도는 뚜껑(rough 0.5) + 반쯤 묻힌 호박색 큐브 다섯 · 가운데쯤 썬 단면(크림 속살 + 네모난 호박색 메이플 웅덩이 · 스며든 번짐).
(허니 = 흘러내린 꿀 윤기, 이쪽 = 네모 큐브로 가른다)
"""
import loaf_kit as lk
import wedge

CUBES = [(-0.13, 0.48, 0.036, 15, 1.0), (0.12, 0.38, 0.032, -20, 1.1), (-0.04, 0.20, 0.034, 30, 1.0),
         (0.18, 0.14, 0.024, 8, 1.1), (-0.20, 0.26, 0.022, -35, 1.0), (0.05, 0.60, 0.020, 40, 1.2)]


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#A85E20'), fills=[dict(
        mask=lk.pieces(CUBES, warp=0.2, box=True), col=('#B6641C', '#CA7A28'), halo=('#E2B470', 0.5), gloss=0.25)])


def cubes(lib, body, rnd, x0):
    mat = wedge.chunk_material(lib, 'maple', [(0.3, '#B4621A'), (0.7, '#CC7C28')], rough=0.28)
    pts = [(-0.02, -0.08), (0.14, 0.06), (0.30, -0.04), (0.06, 0.15), (0.38, 0.10)]
    return lk.stud(lib, body, pts, lambda lib, nm, r: wedge.chunk(lib, nm, r.uniform(0.036, 0.042), r, sides=4,
                                                                  height=0.9, flat=0.8),
                   mat, rnd, sink=0.3, tilt=0.25, name='maple')


def build(lib):
    return lk.build_loaf(lib, seed=65, pal=dict(rough=0.5), cut=-0.08, crumb=crumb, top=cubes,
                         opts=dict(uv_weight={'crumb': 1.6, 'maple': 1.2}, grade={'*': 1.0, 'maple': 0.5}))
