"""비트 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 비트 퓌레로 반죽 전체가 짙은 진홍 · 자줏빛이고 니겔라(검은 씨) 잔 반점이 섞인다. 소금은 안 보인다.
구성: 진홍 판(가장자리 더 짙게) · 반죽에 섞인 검은 씨 반점(무늬). 흰 소금 알 초안은 버렸다.
"""
import slab


def build(lib):
    pal = dict(ramp=('#8E1E3A', '#A42C48', '#B83C58'), edge='#6A1428', blist='#B6445E', hole='#701830',
               side='#7E1C34', speck='#241418')
    return slab.build_cracker(lib, seed=11, pal=pal)
