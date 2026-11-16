"""피스타치오 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 굵게 다진 피스타치오가 반쯤 묻혀 연두빛으로 비친다.
구성: 윗면을 덮은 흰 아이싱 · 그 위에 뿌린 연두빛 피스타치오 조각.
"""
import wedge


def build(lib):
    lib.reset(44)
    mat = wedge.chunk_material(lib, 'bit', [(0.3, '#86A63E'), (0.7, '#B0C860')], rough=0.6)
    bits = [dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=5, height=0.5, flat=0.7), mat=mat,
                 n=16, size=(0.03, 0.05), sink=0.42, gap=0.02, mark=False)]
    return wedge.build_scone(lib, 44, bits=bits, glaze=('#F8F2E0', 0.95))
