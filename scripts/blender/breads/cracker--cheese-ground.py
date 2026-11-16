"""치즈 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 한국 치즈 크래커의 대표는 게리 · 아이비류 — 구멍 난 금빛 크래커 두 장 사이에 노란 치즈 크림을 낀 샌드. 체더 주황 네모(칙스잇)도 있다.
구성: 치즈빛이 도는 금빛 판 두 장 · 사이에 낀 노란 치즈 크림 층(옆으로 살짝 비어져 나옴).
주황 판 + 눌어붙은 치즈 얼룩 초안은 흙때로 읽혔고, 치즈 가닥 64개 초안은 고르게 뿌린 점이라 버렸다.
"""
import slab


def build(lib):
    pal = dict(ramp=('#EAA236', '#F4B446', '#F8C25A'), edge='#CC8028', blist='#FCD27E', speck=None)
    return slab.build_cracker(lib, seed=12, pal=pal, filling=('#FFCC30', '#FFDC60'),
                              opts=dict(uv_weight={'filling': 1.3}, ao_strength={'*': 0.45, 'filling': 0.2}))
