"""유자 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 옅은 노란 유자청 아이싱 줄 · 길게 썬 유자 껍질.
구성: 옅은 노란 유자청 아이싱 줄 · 길게 썬 유자 껍질.
"""
import slab
import wedge


def build(lib):
    lib.reset(52)
    zest = slab.plain_mat(lib, 'bit', '#F0A818', '#F8C030', rough=0.45)
    bits = [dict(make=lambda lib, nm, s, r: (slab.pebble(lib, nm, s * 2, 0.018, 0.010, r, jit=0.15), 0.010), mat=zest,
                 n=18, size=(0.035, 0.055), sink=-0.4, mark=False)]
    return wedge.build_scone(lib, 52, bits=bits, drizzle=('#F8E7A0', -30, 7.5, 0.085))
