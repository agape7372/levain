"""치즈 플랫브레드 — 실물 사진(네이버 이미지 「치즈 플랫브레드」, 2026-11-16)을 보고 지음. 판은 flat_top.build_flatbread.

실물: 간 치즈를 가장자리만 남기고 판 가운데에 고루 뿌려 구우면 한 겹으로 녹아 붙고, 부푼 물집 위는 갈색으로 그을린다.
구성: 가운데를 덮은 녹은 치즈 층(크림빛 노랑, 가장자리 들쭉날쭉 · 군데군데 노릇한 얼룩) · 맨 반죽 테 · 물집 · 탄 자국.
"""
import flat_top


def build(lib):
    lib.reset(57)

    def cheese(m, col, p, nz):
        s = m.sep(p)
        r = m.math('ADD', m.vmath('LENGTH', m.combine(s[0], m.math('DIVIDE', s[1], 0.9))),
                   m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=5, detail=4), 0.5), 0.12))
        cover = m.math('SUBTRACT', 1.0, m.smooth(r, 0.33, 0.37))
        melt = m.ramp(m.noise(p, scale=14, detail=3), [(0.35, '#F8E2A0'), (0.65, '#FCEAB4')])
        melt = m.mix(m.math('MULTIPLY', m.smooth(m.noise(p, scale=9, detail=4, distortion=0.5), 0.6, 0.75), 0.7),
                     melt, '#D09040')  # 노릇한 얼룩
        return m.mix(cover, col, melt)

    return flat_top.build_flatbread(lib, 57, counts=(8, 8, 0), char_k=0.8, extra=cheese)
