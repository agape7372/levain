"""구운 딸기 스콘 — 실물 사진(네이버 이미지 검색 화면 「딸기 스콘」, 2026-11-16)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 딸기 스콘 위에 분홍 딸기 아이싱을 덮고 말린 딸기 조각을 얹은 것이 흔하다(조각은 크기 제각각 · 듬성듬성).
구성: 윗면을 덮고 흘러내린 분홍 딸기 아이싱 · 그 위 말린 딸기 조각 12개(크기를 크게 섞음).
윗면 가운데 붉은 잼 웅덩이는 사용자 「징그럽고 이상해」(상처 · 생고기로 읽힘). 잔 부스러기 34개 판은 고르게 뿌린 점이라 수를 줄이고 키웠다.
"""
import slab
import wedge


def build(lib):
    lib.reset(49)
    bit = slab.plain_mat(lib, 'bit', '#C42A3C', '#EC7484', rough=0.8, scale=45)  # 바삭한 동결건조 조각 — 무광 · 옅은 속살이 비친다
    bits = [dict(make=lambda lib, nm, s, r: wedge.dried(lib, nm, s, r, long=1.3, squash=0.8, wrinkle=0.35), mat=bit,
                 n=10, size=(0.018, 0.04), sink=0.05, gap=0.04, mark=False)]  # 납작하게 묻은 판은 분홍 위 붉은 반점(두드러기)으로 읽혔다
    return wedge.build_scone(lib, 49, bits=bits, glaze=('#F4A8B6', 0.92))
