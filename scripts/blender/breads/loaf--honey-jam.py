"""허니 식빵 (loaf--honey-jam) — 형상 · 껍질은 loaf_kit.build_loaf(뚜껑 rough 낮춤 + 흘러내린 꿀 fx), 단면은 crumb_material + marble.

실물: 네이버 이미지 「허니 식빵」(2026-11-16) — 꿀을 발라 구운 뚜껑이 윤이 나는 호박 금빛이고 가장자리로 꿀이 흘러내렸다. 속살엔 꿀 결이 노랗게 스몄다.
구성: 윤기 도는 호박빛 뚜껑(rough 0.3) · 어깨에서 옆벽으로 몇 줄기 흘러내린 꿀(길이 들쭉날쭉) · 끝을 썬 단면(크림 속살 + 금빛 꿀 결).
"""
import loaf_kit as lk

PAL = dict(crust=('#C06A1C', '#CE7A26', '#DA8A30'), shoulder='#E4A04A', rough=0.3)


def drips(m, p, cap, col, rough, h):
    px = m.sep(p)
    streak = m.noise(m.mapping(p, scale=(16.0, 16.0, 1.0)), scale=1.0, detail=2)
    L = m.math('ADD', 0.006, m.math('MULTIPLY', m.smooth(streak, 0.48, 0.66), 0.09))
    k = m.smooth(m.math('ADD', m.math('SUBTRACT', px[2], lk.HS), L), 0.0, 0.006)
    k = m.math('MULTIPLY', k, m.math('SUBTRACT', 1.0, cap))
    col = m.mix(m.math('MULTIPLY', k, 0.7), col, '#E0A238')
    return col, m.mixf(k, rough, 0.22), h


def crumb(lib):
    return lk.crumb_material(lib, rim_top=(lk.HS, '#AE6020'), fills=[dict(
        mask=lk.marble(scale=1.9, width=0.035, warp=2.6, stretch=(1.0, 1.4, 1.0), seed=9.0),
        col=('#DE9E2E', '#EAB442'), halo=('#F2CE86', 0.45), gloss=0.3)])


def build(lib):
    return lk.build_loaf(lib, seed=71, pal=PAL, fx=drips, cut=-0.40, crumb=crumb,
                         opts=dict(uv_weight={'crumb': 1.5}))
