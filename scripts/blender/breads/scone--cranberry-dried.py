"""크랜베리 스콘 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 말린 크랜베리가 껍질 밖으로 쭈글쭈글한 선홍 조각째 드러난다(크기 제각각 · 듬성듬성) · 흰 아이싱 줄을 뿌린 것이 흔하다.
구성: 흰 아이싱 줄(드리즐) · 반쯤 묻혀 솟은 말린 크랜베리 조각 7개. 묻힌 붉은 얼룩 판은 살색 면의 상처로 읽혀 뺐다.
"""
import wedge


def build(lib):
    lib.reset(39)
    berry = wedge.chunk_material(lib, 'bit', [(0.3, '#981A2A'), (0.7, '#B82C3A')], rough=0.58)
    bits = [dict(make=lambda lib, nm, s, r: wedge.dried(lib, nm, s, r, long=1.6, squash=0.55, wrinkle=0.28),
                 mat=berry, n=8, size=(0.026, 0.042), sink=0.35, gap=0.06, mark=False)]
    return wedge.build_scone(lib, 39, bits=bits, drizzle=('#FBF6EE', 25, 6.5, 0.075))
