"""말차 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 반죽 전체가 선명한 녹색 · 윗면도 녹색이 남고 흰 초콜릿 줄을 뿌린다.
구성: 녹색 속살 · 짙은 녹색 윗면 · 박힌 화이트 초콜릿 조각.
"""
import wedge


def build(lib):
    lib.reset(42)
    mat = wedge.chunk_material(lib, 'bit', [(0.3, '#F4E8CC'), (0.7, '#FFF8E6')], rough=0.5)
    bits = [dict(make=lambda lib, nm, s, r: wedge.chunk(lib, nm, s, r, sides=4, height=0.5, flat=0.7), mat=mat,
                 n=8, size=(0.04, 0.07), sink=0.42, gap=0.02, mark=False)]
    tones = dict(edge='#6A8228', crack='#566E20', pit='#74882C', pore='#8EA048', bot='#8E9E3C')
    return wedge.build_scone(lib, 42, top=('#7E9A34', '#90AC40', '#A4BC52'), side=('#A8C058', '#B8CE68', '#AEC65E'),
                             tones=tones, bits=bits)
