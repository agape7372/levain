"""건포도 식빵 (loaf--raisin-flesh) — 형상 · 껍질은 loaf_kit.build_loaf(비스듬히 썰기), 단면은 crumb_material.

실물: 네이버 이미지 「건포도 식빵」(2026-11-16) — 썬 단면에 계피 설탕을 만 옅은 갈색 소용돌이가 돌고 그 결을 따라 건포도가 박혔다(크기 제각각, 쭈글한 적갈색). 뚜껑에도 반쯤 묻힌 알이 몇 개 보인다.
구성: 비스듬히 썬 단면(옅은 계피 소용돌이 띠 + 띠 위 건포도 — 크기 섞음 · 쭈글한 윤곽 · 짙은 자갈색) · 뚜껑에 반쯤 묻힌 알 몇.
크림 면에 짙은 타원만 흩은 첫 판은 「밝은 면의 짙은 점 = 벌레」였다(두뇌 검토 11-16).
"""
import math

import loaf_kit as lk
import wedge

C, PITCH, ASPECT = (0.0, 0.33), 0.095, 0.95


def on_band(k, deg):
    """소용돌이 띠 가운데 (u, v) — k 번째 감김 · 각 deg°"""
    th = math.radians(deg)
    rho = PITCH * (k + 0.5 - th / math.tau)
    return C[0] + rho * math.cos(th) / ASPECT, C[1] + rho * math.sin(th)


# (감김, 각°, 반지름, 기울기°, 길쭉함) — 띠를 따라 크기 · 간격을 흩는다
AT = [(1, 20, 0.030, 30, 1.6), (1, 160, 0.022, -20, 1.4), (2, -60, 0.034, 70, 1.5), (2, 70, 0.020, 10, 1.3),
      (2, 175, 0.028, -45, 1.7), (3, -110, 0.024, 15, 1.5), (3, 0, 0.032, -60, 1.4)]
RAISINS = [(*on_band(k, d), r, a, e) for k, d, r, a, e in AT]


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#B86A28'), fills=[
        dict(mask=lk.swirl(c=C, pitch=PITCH, r=0.30, w=0.34, wob=1.4, wscale=3.0, aspect=ASPECT),
             col=('#C3935C', '#D2A46C'), halo=('#E2C08E', 0.35), gloss=0.85),
        dict(mask=lk.pieces(RAISINS, warp=0.55, wscale=70), col=('#6A3020', '#84402C'), halo=('#B88A5E', 0.3), gloss=0.4)])


def raisins(lib, body, rnd, x0):
    mat = wedge.chunk_material(lib, 'raisin', [(0.3, '#74381E'), (0.7, '#92502C')], rough=0.45)
    pts = [(-0.10, 0.08), (0.12, -0.10), (0.30, 0.05)]
    return lk.stud(lib, body, pts, lambda lib, nm, r: wedge.dried(lib, nm, r.uniform(0.032, 0.038), r, squash=0.45, wrinkle=0.26),
                   mat, rnd, sink=0.3, tilt=0.3, name='raisin')


def build(lib):
    return lk.build_loaf(lib, seed=25, cut=-0.30, cut_no=(-1, -0.4, 0), crumb=crumb, top=raisins,
                         opts=dict(uv_weight={'crumb': 1.6}))
