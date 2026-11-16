"""살구 호밀빵 (rye--apricot-dried) — 형상 · 껍질은 rye_kit.build_rye, 단면은 rye_kit.crumb.

실물: 네이버 이미지 「살구 호밀빵」(2026-11-16) — 대표 모습이 썬 단면: 기공 있는 회갈 속살에 주황 말린 살구 조각이 크기 섞여 또렷이 박힌다(가장자리 진한 주황, 살짝 윤기).
구성: 왼끝을 앞 · 위로 비스듬히 썬 단면 하나 · 회갈 속살 + 크기 섞인 각진 주황 살구 조각(주름 줄 · 윤기 · 옅은 주황 번짐).
갈라 벌린 두 쪽 + 둥근 노란 점은 밤 호밀과 겹쳤다(r2) — 가르지 않고 각지게.
"""
import loaf_kit as lk
import rye_kit as rk

APRICOT = lk.pieces([(-0.13, 0.11, 0.045, -25, 1.4), (0.03, 0.15, 0.034, 40, 1.2), (-0.04, 0.05, 0.022, 70, 1.5),
                     (0.11, 0.08, 0.028, -10, 1.3), (-0.2, 0.18, 0.02, 20, 1.6), (0.07, 0.21, 0.016, -50, 1.3),
                     (-0.08, 0.2, 0.014, 15, 1.2)], warp=1.1, box=True, wscale=22)  # 반듯한 네모(r3)는 타일, warp 2.5 · 잡음 45(r4)는 녹 얼룩 — 낮은 주파수로 윤곽만 꺾는다


def crumb(lib):
    return rk.crumb(lib, fills=[
        dict(mask=APRICOT, col=('#D0661A', '#EA8A24'), halo=('#7A5A3E', 0.35), gloss=0.42),
        dict(mask=rk.veined(APRICOT, scale=30, width=0.07, warp=1.5), col=('#963C0A', '#A2440C'), gloss=0.5)])


def build(lib):
    return rk.build_rye(lib, seed=61, cut=('end', -0.22, (-1, -0.55, 0.35)), crumb=crumb,
                        opts=dict(uv_weight={'crumb': 1.6}))
