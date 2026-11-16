"""포피시드 플랫브레드 — 실물 사진(네이버 이미지 「포피시드 플랫브레드」 · 포피시드 브레드, 2026-11-16)을 보고 지음.
판은 flat_top.build_flatbread.

실물: 양귀비씨를 반죽에 섞어 밀면 판 전체(윗면 · 옆면)가 잔 청흑색 씨로 촘촘히 박힌 회백 반죽이 되고, 물집 위만 노릇하다.
      포피시드 포카치아(윗면에 덮은 씨)와는 「반죽 속 씨 · 옆면까지」로 갈린다.
구성: 씨 박힌 옅은 반죽(잔 씨 빽빽 · 옆면까지) · 물집 · 탄 자국.
"""
import flat_top


def build(lib):
    lib.reset(86)

    def seeds(m, col, p, nz):
        d = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=180), 0.34, 0.46))
        return m.mix(m.math('MULTIPLY', d, 0.9), col, m.ramp(m.noise(p, scale=240), [(0.4, '#262A34'), (0.6, '#3C404C')]))

    pal = dict(ramp=('#EEC27A', '#F4CC88', '#F8D696'), fine='#DDA458', edge='#D49A4E', side='#E0B070')
    return flat_top.build_flatbread(lib, 86, counts=(8, 10, 0), char_k=0.8, pal=pal, extra=seeds)
