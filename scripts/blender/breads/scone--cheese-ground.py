"""치즈 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 녹은 체더가 윗면 · 옆면에 주황 얼룩으로 비치고 가장자리가 갈색으로 눌어붙는다.
구성: 녹은 체더 얼룩 · 윗면에 얹어 구운 주황 치즈 채.
"""
import slab
import wedge


def build(lib):
    lib.reset(35)
    shred = slab.plain_mat(lib, 'bit', '#FFD25A', '#FFE48A', rough=0.6)
    bits = [dict(make=lambda lib, nm, s, r: (slab.pebble(lib, nm, s * 2, 0.016, 0.010, r, jit=0.2), 0.010), mat=shred,
                 n=44, size=(0.03, 0.055), sink=-0.3, gap=-0.05, mark=False)]
    extra = wedge.fruit(('#FF9A0C', '#FFB624'), '#B8600E', scale=5.0, cover=0.25, halo=0.05, seed=35.0)
    return wedge.build_scone(lib, 35, top=('#DDA048', '#EAB45C', '#F4C674'), extra=extra, bits=bits)
