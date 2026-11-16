"""호두 호밀빵 (rye--walnut-piece) — 형상 · 껍질은 rye_kit.build_rye, 단면은 rye_kit.crumb.

실물: 네이버 이미지 「호두 호밀빵」(2026-11-16) — 대표 모습이 썰어 늘어놓은 단면: 회갈 속살(호두 물로 살짝 보랏빛 회색)에 주름진 연갈색 호두 조각이 크기 섞여 박혀 있다.
구성: 왼끝을 썰고, 썬 한 장을 단면이 위로 가게 앞에 눕힘 · 회갈 속살 + 주름진 호두 조각(연갈 · 짙은 결) + 옅은 보랏빛 번짐.
"""
import rye_kit as rk

NUT = [(-0.10, 0.08, 0.046, 15, 1.4, 0, 0), (0.09, 0.15, 0.04, -55, 1.3, 0, 0), (0.13, 0.05, 0.028, 40, 1.5, 0, 0),
       (-0.06, 0.19, 0.03, 80, 1.2, 0, 0)]


def crumb(lib):
    nut = rk.bits(NUT, warp=0.9)
    return rk.crumb(lib, fills=[
        dict(mask=nut, col=('#B07C46', '#C8965C'), halo=('#4E3C34', 0.4), gloss=0.7),
        dict(mask=rk.veined(nut, scale=30, width=0.07), col=('#6A4020', '#7A4C28'), gloss=0.7)])


def build(lib):
    return rk.build_rye(lib, seed=53, cut=('slice', -0.3, 0.05, (-0.25, -0.36), 35), crumb=crumb,
                        opts=dict(uv_weight={'crumb': 1.8}))
