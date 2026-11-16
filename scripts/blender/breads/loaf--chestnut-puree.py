"""밤 식빵 (loaf--chestnut-puree) — 형상 · 껍질은 loaf_kit.build_loaf(비스듬히 썰기), 단면은 crumb_material + pieces,
아몬드 슬라이스는 loaf_kit.flake.

실물: 네이버 이미지 「밤 식빵」(2026-11-16) — 윤기 나는 짙은 금갈색 뚜껑 위에 아몬드 슬라이스가 마루를 따라 얹혀 구워졌고, 썬 속살에 노란 밤 조각이 큼직하게 박혔다.
구성: 윤기 도는 짙은 뚜껑(rough 0.5) + 마루를 따라 얹은 아몬드 슬라이스(어깨는 비움) · 비스듬히 썬 단면(크림 속살 + 큼직한 노란 밤 조각).
"""
import loaf_kit as lk
import slab

PAL = dict(crust=('#A85A1C', '#B66626', '#C27230'), ridge='#904A16', shoulder='#CE8A44', rough=0.5)
CHESTNUT = [(-0.13, 0.48, 0.050, 30, 1.3), (0.12, 0.34, 0.044, -20, 1.4), (-0.06, 0.18, 0.038, 60, 1.2),
            (0.19, 0.56, 0.030, 0, 1.5), (-0.21, 0.26, 0.030, 80, 1.3)]


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#9A501C'), fills=[dict(
        mask=lk.pieces(CHESTNUT, warp=0.45, wscale=22), col=('#D89A34', '#E6B04C'), halo=('#F0D294', 0.45), gloss=0.55)])


def almonds(lib, body, rnd, x0):
    mat = slab.plain_mat(lib, 'almond', '#E2C894', '#F0DCB0', rough=0.7, scale=60)
    pts = lk.cover_pts(lib, rnd, x0, 70, 0.04, edge=0.17, fade=0.08, seed=2.0, holes=0.3)

    def sliver(lib, nm, r):
        s = r.uniform(0.8, 1.15)
        return lk.flake(lib, nm, 0.064 * s, 0.040 * s, 0.006, r, n=10, jit=0.08, taper=0.3)

    return lk.stud(lib, body, pts, sliver, mat, rnd, sink=(-0.6, 0.3), tilt=0.4, name='almond')


def build(lib):
    return lk.build_loaf(lib, seed=43, pal=PAL, cut=-0.30, cut_no=(-1, -0.4, 0), crumb=crumb, top=almonds,
                         opts=dict(uv_weight={'crumb': 1.5, 'almond': 1.2}, ao_strength={'*': 0.25, 'almond': 0.4}))
