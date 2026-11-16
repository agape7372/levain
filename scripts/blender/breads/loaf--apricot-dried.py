"""살구 식빵 (loaf--apricot-dried) — 형상 · 껍질은 loaf_kit.build_loaf, 썬 한 장은 cut_slab, 단면은 crumb_material + pieces,
뚜껑의 말린 살구는 wedge.dried.

실물: 네이버 이미지 「살구 식빵」(2026-11-16) — 썬 속살에 말린 살구 조각이 선명한 주황으로 박혔다(윤기 · 반투명한 가장자리). 뚜껑 위로 반쯤 드러난 알도 있다.
구성: 끝에서 한 장 떠 기대 세운 단면(크림 속살 + 주황 살구 조각 · 옅은 번짐) · 뚜껑에 반쯤 묻힌 납작한 말린 살구 셋.
"""
import loaf_kit as lk
import wedge

APRICOTS = [(-0.12, 0.50, 0.044, 30, 1.4), (0.13, 0.36, 0.040, -25, 1.3), (-0.05, 0.20, 0.034, 70, 1.5),
            (0.18, 0.12, 0.026, 10, 1.4), (-0.21, 0.30, 0.024, -50, 1.3)]


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[dict(
        mask=lk.pieces(APRICOTS, warp=0.45, wscale=24), col=('#DE741A', '#EC8A28'), halo=('#F4BC6C', 0.45), gloss=0.35)])


def tops(lib, body, rnd, x0):
    mat = wedge.chunk_material(lib, 'apricot', [(0.3, '#D46A16'), (0.7, '#E68226')], rough=0.35)
    pts = [(-0.12, -0.05), (0.10, 0.08), (0.30, -0.06)]
    return lk.stud(lib, body, pts, lambda lib, nm, r: wedge.dried(lib, nm, r.uniform(0.046, 0.052), r, long=1.25,
                                                                  squash=0.45, wrinkle=0.1),
                   mat, rnd, sink=0.15, tilt=0.25, name='apricot')


def build(lib):
    return lk.build_loaf(lib, seed=53, cut=-0.28, crumb=crumb, top=tops, slab=dict(t=0.07, lean=28),
                         opts=dict(uv_weight={'crumb': 1.6, 'apricot': 1.2}, grade={'*': 1.0, 'apricot': 0.5}))
