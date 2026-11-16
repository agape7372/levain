"""귀리 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 윗면에 납작한 귀리 플레이크를 눌러 붙여 굽는다.
구성: 밀빛 윗면 · 수북이 눌러 붙인 귀리 플레이크.
"""
import slab
import wedge


def build(lib):
    lib.reset(43)
    oat = slab.plain_mat(lib, 'bit', '#E6D0A0', '#F6E8C6', rough=0.85, scale=50)
    bits = [dict(make=lambda lib, nm, s, r: (slab.pebble(lib, nm, s * 2, s * 1.4, 0.009, r, jit=0.16), 0.009), mat=oat,
                 n=64, size=(0.026, 0.035), sink=-0.3, gap=-0.035, mark=False)]
    return wedge.build_scone(lib, 43, top=('#DDA04A', '#E8B25C', '#F0C070'), bits=bits)
