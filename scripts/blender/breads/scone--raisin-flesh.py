"""건포도 스콘 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 달걀물을 발라 윤이 도는 짙은 금빛 윗면 · 통통한 건포도가 껍질 밖으로 몇 알 불룩 솟는다(적갈색 · 크기 제각각).
구성: 달걀물 윤(짙은 금빛 · 낮은 거칠기) · 우박 설탕 몇 알 · 반쯤 묻혀 솟은 건포도 6알. 잔 얼룩 판은 밝은 면의 짙은 점(벌레)으로 읽혀 뺐다.
"""
import slab
import wedge


def build(lib):
    lib.reset(46)
    raisin = wedge.chunk_material(lib, 'bit', [(0.3, '#5A2824'), (0.7, '#7A3C30')], rough=0.46)  # 윤 0.34는 체리 · 파인 상처, 무광 갈색은 초코 덩이로 읽혔다
    sugar = slab.plain_mat(lib, 'sugar', '#F4EEE2', '#FFFCF6', rough=0.5, scale=120)
    bits = [dict(make=lambda lib, nm, s, r: wedge.dried(lib, nm, s, r, long=1.45, squash=0.6, wrinkle=0.3),
                 mat=raisin, n=5, size=(0.034, 0.05), sink=0.15, gap=0.08, mark=False),
            dict(make=lambda lib, nm, s, r: (slab.salt(lib, nm, s * 2, r), s), mat=sugar, n=9, size=(0.016, 0.026),
                 sink=-0.3, gap=0.03, mark=False)]
    return wedge.build_scone(lib, 46, top=('#D0822A', '#E09636', '#ECAA48'), bits=bits, gloss=0.45,
                             opts=dict(uv_weight={'crumb': 1.0, 'bit': 1.5, 'sugar': 1.2}))
