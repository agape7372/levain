"""살구 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 과육이 솟지 않고 터져 납작하게 묻힌 불규칙한 얼룩 · 크기 제각각 · 둘레로 과즙이 번진다 · 칼 단면에도 비친다.
구성: 윗면에 얹은 살구 조각 · 살구잼을 얇게 발라 윤이 도는 윗면.
"""
import wedge


def build(lib):
    lib.reset(31)
    mat = wedge.chunk_material(lib, 'bit', [(0.3, '#F07A10'), (0.7, '#FF9C28')], rough=0.45)
    bits = [dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=4, height=0.5, flat=0.7), mat=mat,
                 n=8, size=(0.05, 0.08), sink=0.42, gap=0.02, mark=False)]
    return wedge.build_scone(lib, 31, bits=bits, glaze=('#F0A024', 0.35))
