"""초코 깜빠뉴 — 실물 사진(네이버 이미지 검색 「초코 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 코코아 반죽이라 껍질이 붉은 짙은 갈색, 썬 면도 짙은 코코아색에 녹은 초콜릿 덩이가 여럿 박혀 있다.
      흰 가루를 친 것이 흔하지만 짙은 껍질 위 흰 가루는 곰팡이로 읽혀 고리는 옅은 코코아빛으로만 둔다.
구성: 코코아 껍질(칼집 속살도 코코아) · 오른쪽 앞을 덜어낸 둥근 단면 = 코코아 속살 + 윤나는 납작한 초콜릿 덩이(여럿, 크기 섞어).
"""
from boule import campagne_crust
from boule_variant import SCORE, SHAPE, build_campagne_variant, crumb_material

PAL = dict(ramp=('#4A1E10', '#5E2816', '#72341E'), ring='#3A160A', low='#2C1008', base='#381A0E', ear='#7A3C20',
           lip='#220C04', flour='#9A6448', inner=('#8A4E32', '#74402A', '#54281A', '#30140A'), pore='#4A2416')
CHOCO = dict(scale=6.5, cover=0.5, r=0.34, cols=('#22100A', '#32180E'), rough=0.4, seed=7.0, stretch=(1, 1, 1.8))


def build(lib):
    return build_campagne_variant(
        lib, 79, cut=('cap', 40, 0.26), tris=13500,
        crust=lambda lib: campagne_crust(lib, SHAPE, SCORE, pal=PAL, flour_a=0.6),
        crumb=lambda lib: crumb_material(lib, SHAPE, base=('#6E3A26', '#824830'), pore='#4A2416', rim='#5A2C18', deep_col='#2A1008',
                                         pieces=CHOCO))
