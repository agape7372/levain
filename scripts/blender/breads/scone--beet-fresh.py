"""비트 스콘 — 실물 사진(구글 이미지 검색, 2026-11-15)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 반죽 전체가 분홍 · 윗면은 장밋빛으로 구워지고 흰 아이싱 줄을 뿌린다.
구성: 분홍 속살 · 장밋빛 윗면 · 한쪽에 체로 친 슈가파우더.
"""
import wedge


def build(lib):
    lib.reset(33)
    def extra(m, top_c, side_c, p, crust):
        return wedge.dust(m, top_c, p, '#FFF8F2', ang=25.0), side_c

    tones = dict(edge='#9C4050', crack='#8A3044', pit='#A84858', pore='#C86A88', bot='#C0607A')
    return wedge.build_scone(lib, 33, top=('#B85060', '#C86272', '#D87A88'), side=('#E48AA4', '#EE9CB4', '#E890AA'),
                             tones=tones, extra=extra)
