"""비트 깜빠뉴 (campagne--beet-fresh) — 실물 사진(네이버 이미지 검색 「비트 깜빠뉴」, 2026-11-16)을 보고 지음. 조립 = boule_variant.

실물: 겉은 밀가루 묻은 깜빠뉴, 썬 면이 진분홍 반죽색이다(비트 즙).
구성: 깜빠뉴 껍질 · 앞 쐐기 단면 = 채도 낮춘 분홍빛 자홍 속살 + 뚜렷한 기공. 형광 자홍(정식 1판)은 날고기로 읽혔다.
"""
from boule_variant import SHAPE, build_campagne_variant, crumb_material

def build(lib):
    return build_campagne_variant(
        lib, 173, cut=('wedge', -30, 60), tris=13500,
        crumb=lambda lib: crumb_material(lib, SHAPE, base=('#A85A74', '#B4667E'), pore='#8A4A60', deep_col='#6A3048', holes=1.2))
