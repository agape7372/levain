"""호두 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 굵게 부순 호두가 반쯤 묻혀 연한 갈색으로 비친다.
구성: 윗면을 덮고 흘러내린 메이플빛 아이싱 · 그 위 호두 조각.
"""
import wedge


def build(lib):
    lib.reset(51)
    mat = wedge.chunk_material(lib, 'bit', [(0.3, '#B8884E'), (0.7, '#D0A468')], rough=0.7)
    bits = [dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=5, height=0.5, flat=0.7), mat=mat,
                 n=9, size=(0.05, 0.08), sink=0.42, gap=0.02, mark=False)]
    return wedge.build_scone(lib, 51, bits=bits, glaze=('#EDD2A4', 0.95))
