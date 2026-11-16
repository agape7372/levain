"""아마씨 통밀빵 — 실물 사진(네이버 이미지 검색 「아마씨 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 작고 납작한 윤나는 아마씨(적갈색 · 금빛)가 껍질에 빽빽이 붙고 속살에도 점점이 박힌다. 씨가 작아 낱알보다 반짝이는 결로 읽힌다.
구성: 통밀 껍질 · 어깨를 두르는 넓은 띠에 금빛 아마씨를 빽빽이(윤기) — 정수리는 비워 통밀 고리를 남긴다.
      적갈 씨는 짙은 껍질에 묻혀 안 보여서(d1) 금빛만.
"""
import slab
from boule_variant import flake
from breads.wholewheat import crust_material, variant


def build(lib):
    gold = dict(make=lambda lib, nm, s, r: flake(lib, nm, s * 2.0, s * 1.15, 0.004, r, n=5),
                mat=lambda lib: slab.plain_mat(lib, 'bit', '#D8A040', '#F0C868', rough=0.3, scale=40),
                n=430, size=(0.012, 0.017), zone=(0.55, 1.0), bias=1.0, sink=-0.1, gap=-0.012)  # d2 380알은 흩뿌린 점이었다
    return variant(lib, 233, crust=lambda lib: crust_material(lib, dust_a=0.0), bits=[gold],
                   tris=10500, opts=dict(quality=70))  # q76 540알은 538KB · q68도 512KB(예산 500) — 알 수 · 몸통을 줄임
