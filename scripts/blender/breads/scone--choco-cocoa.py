"""코코아 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 반죽 전체가 짙은 코코아 갈색 · 위에 초콜릿 줄을 지그재그로 뿌린다.
구성: 짙은 갈색 쐐기 · 초콜릿 줄.
"""
import wedge


def build(lib):
    lib.reset(36)
    tones = dict(edge='#4A2A16', crack='#38200E', pit='#523018', pore='#5E3A24', bot='#5A3620')
    return wedge.build_scone(lib, 36, top=('#5E3822', '#6E4228', '#7E4E30'), side=('#7A4A30', '#8A583A', '#805036'),
                             tones=tones, drizzle=('#2E1608', -25, 8.5, 0.08))
