"""군고구마 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 노란 고구마 깍둑 조각이 묻혀 윗면 · 단면에 비친다 · 반죽은 조금 노랗다.
구성: 묻힌 고구마 얼룩 · 윗면에 얹은 노란 고구마 깍둑 조각.
"""
import wedge


def build(lib):
    lib.reset(50)
    mat = wedge.chunk_material(lib, 'bit', [(0.3, '#FFC81E'), (0.7, '#FFDC4A')], rough=0.6)
    bits = [dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=4, height=0.5, flat=0.7), mat=mat,
                 n=9, size=(0.05, 0.08), sink=0.42, gap=0.02, mark=False)]
    extra = wedge.fruit(('#FFC81E', '#FFDC4A'), '#F0CC70', scale=5.0, cover=0.35, halo=0.04, seed=50.0)
    return wedge.build_scone(lib, 50, side=('#F4D48E', '#FADEA0', '#F6D894'), extra=extra, bits=bits)
