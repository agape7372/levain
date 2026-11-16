"""고구마 플랫브레드 — 실물 사진(네이버 이미지 「고구마 플랫브레드」, 2026-11-16)을 보고 지음. 판은 flat_top.build_flatbread.

실물: 고구마를 으깨 넣은 반죽은 판 전체가 따뜻한 노랑~주황으로 물들고, 굽는 동안 부푼 물집 꼭대기가 그을린다.
      으깬 고구마가 덜 섞인 자리는 더 진한 주황 결로 남는다.
      흰 판 위에 퓌레 덩이를 얹은 첫 판은 「으깬 무언가 · 스크램블」로 읽혔다(두뇌 검수) — 퓌레는 반죽 재료다.
구성: 고구마 반죽색 판(베이스보다 진한 주황, 물집 · 탄 자국은 베이스 그대로) · 반죽에 덜 섞인 진한 주황 결(넓고 흐리게).
"""
import flat_top
import wedge


def build(lib):
    lib.reset(83)

    def marble(m, col, p, nz):  # 덜 섞인 퓌레 결 — 잡음 등고선 한 줄을 넓고 흐리게(점이 아니라 띠)
        v = wedge.veins(m, p, scale=2.6, width=0.1, warp=2.5)  # 진한 주황(#E86C10) 0.55 결은 화면에서 안 보였다
        return m.mix(m.math('MULTIPLY', v, 0.75), col, '#FFC23A')

    pal = dict(ramp=('#EE8424', '#F49632', '#F8A842'), fine='#D2701E', edge='#C4641C', side='#E08834')
    return flat_top.build_flatbread(lib, 83, counts=(7, 7, 0), char_k=0.55, pal=pal, extra=marble)
