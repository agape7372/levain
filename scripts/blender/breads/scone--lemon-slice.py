"""레몬 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 윗면에 반투명한 흰 레몬 아이싱을 부어 옆으로 흘러내리고 노란 껍질 채를 뿌린다.
구성: 흰 레몬 아이싱 · 노란 껍질 채.
"""
import slab
import wedge


def build(lib):
    lib.reset(41)
    zest = slab.plain_mat(lib, 'bit', '#F2C81E', '#FADC48', rough=0.5)
    bits = [dict(make=lambda lib, nm, s, r: (slab.pebble(lib, nm, s * 2, 0.014, 0.008, r, jit=0.15), 0.008), mat=zest,
                 n=26, size=(0.022, 0.034), sink=-0.4, mark=False)]
    return wedge.build_scone(lib, 41, bits=bits, glaze=('#FBF6E2', 1.0))
