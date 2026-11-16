"""건포도 통밀빵 — 실물 사진(네이버 이미지 검색 「건포도 통밀빵」, 2026-11-16)을 보고 지음. 조립 = breads.wholewheat.variant.

실물: 대표 사진은 썬 면 — 베이지 갈색 속살에 쭈글쭈글 길쭉한 건포도가 짙은 와인빛 덩이로 여기저기 박힌다(한 알씩, 번짐 없음).
구성: 통밀 껍질 · 왼쪽 쐐기를 덜어낸 두 단면 = 통밀 속살 + 와인빛 건포도(길쭉하게 눕히고 주름 결, 크기 섞어 수는 줄임, 윤기).
      작은 짙은 점을 고르게 뿌리면 벌레로 읽혀서 알을 키우고 드물게 둔다.
"""
import wedge
from breads.wholewheat import blobs, crumb, variant


def raisins(m, p, col, rough, h):
    d, rnd, keep = blobs(m, p, 8.0, 0.4, seed=9.0, stretch=(1.4, 1.0, 0.8), warp=0.3)
    r = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(d, 0.34, 0.36)), keep)
    v = wedge.veins(m, p, scale=40, width=0.12, warp=1.0)  # 주름 결
    rc = m.ramp(m.noise(p, scale=25, detail=2), [(0.3, '#2E1410'), (0.7, '#44201A')])
    rc = m.mix(m.math('MULTIPLY', v, 0.5), rc, '#5E3428')
    col = m.mix(r, col, rc)
    rough = m.mixf(r, rough, 0.55)
    h = m.math('ADD', m.math('MULTIPLY', h, m.math('SUBTRACT', 1.0, r)), m.math('MULTIPLY', r, m.math('SUBTRACT', 0.4, m.math('MULTIPLY', v, 0.3))))
    return col, rough, h


def build(lib):
    return variant(lib, 293, cut=('wedge', -85, -5), tris=12500, crumb=lambda lib: crumb(lib, extra=raisins))
