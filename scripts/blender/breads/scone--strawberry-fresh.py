"""딸기 스콘 — 실물 사진(네이버 이미지 검색 화면 「딸기 스콘」 · 「딸기잼 크림 스콘」, 2026-11-16)을 보고 지음. 쐐기 · 껍질 · 무늬는 wedge.build_scone.

실물: 스콘을 가로로 갈라 생크림을 두툼히 바르고 딸기잼을 얹어 덮는다 — 옆에서 보면 크림 층이 굵고 잼이 들쭉날쭉 배어난다.
구성: 생크림 + 딸기잼 샌드: 옆면을 가로지르는 두툼한 흰 크림 층과 그 가운데 굵기가 들쭉날쭉한 잼 줄 · 윗면 한쪽에 슈가파우더.
윗면에 붉은 얼룩 · 크림 덩이를 얹은 판은 사용자 「징그럽고 이상해」(살색 면의 붉은 반점 = 상처). 고른 가는 잼 줄 판은 자로 그은 리본으로 읽혀 굵기를 흩었다.
"""
import wedge


def build(lib):
    lib.reset(48)
    def extra(m, top_c, side_c, p, crust):
        side_c = wedge.layer(m, p, side_c, '#FFF9EE', 0.215, 0.07, wave=0.04, vary=0.3)  # 생크림
        side_c = wedge.layer(m, p, side_c, '#D8323E', 0.21, 0.026, wave=0.03, vary=0.6)  # 크림 사이 딸기잼
        return wedge.dust(m, top_c, p, '#FFFAF4', ang=20.0), side_c

    return wedge.build_scone(lib, 48, extra=extra)
