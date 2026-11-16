"""초코 통밀빵 — 실물 사진(네이버 이미지 검색 「초코 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 코코아를 넣은 통밀 반죽이라 껍질이 붉은 기 도는 짙은 초콜릿색, 밀기울 결은 그대로 보인다. 흰 가루는 거의 없다.
구성: 코코아 통밀 껍질(고리 · 밀기울 결 유지, 한 단 짙은 적갈색) · 고리 위 가루는 옅은 코코아빛(짙은 껍질 위 흰 가루 = 곰팡이).
"""
from breads.wholewheat import crust_material, variant

PAL = dict(ramp=('#3A160A', '#4E2010', '#642C16'), low='#1E0A04', base='#261006', groove='#220C04', mottle='#7A3E22',
           dark='#180804', light='#94583A', dust='#8C5A40')


def build(lib):
    return variant(lib, 241, crust=lambda lib: crust_material(lib, pal=PAL, dust_a=0.45))
