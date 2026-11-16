"""코코넛 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 흰 아이싱 위에 가는 코코넛 채가 수북 · 일부는 노릇하게 구워진다.
구성: 흰 아이싱 · 가는 코코넛 채(흰 것 · 노릇한 것).
"""
import slab
import wedge


def build(lib):
    lib.reset(38)
    def shred(lib, nm, s, r):
        return slab.pebble(lib, nm, s * 2, 0.009, 0.006, r, jit=0.2), 0.006

    bits = [dict(make=shred, mat=slab.plain_mat(lib, 'bit', '#F4ECD8', '#FFFBEE', rough=0.8), n=70, size=(0.03, 0.05),
                 sink=-0.4, gap=-0.06, mark=False),
            dict(make=shred, mat=slab.plain_mat(lib, 'bit2', '#D8A050', '#E8BC70', rough=0.8), n=40, size=(0.03, 0.05),
                 sink=-0.4, gap=-0.06, mark=False)]
    return wedge.build_scone(lib, 38, bits=bits, glaze='#F8F0DC', opts=dict(uv_weight={'crumb': 1.0, 'bit': 1.2}))
