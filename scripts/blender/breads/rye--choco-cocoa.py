"""초코 호밀빵 (rye--choco-cocoa) — 형상 · 껍질은 rye_kit.build_rye, 단면은 rye_kit.crumb.

실물: 네이버 이미지 「초코 호밀빵」(2026-11-16) — 코코아 반죽이라 껍질이 한 톤 짙고 단면 속살이 코코아 갈색, 군데군데 녹은 초콜릿 덩이가 윤나게 박힌다.
구성: 껍질은 코코아 쪽으로 살짝 짙게(캐러웨이 뺌) · 왼끝을 앞으로 비스듬히 썬 단면 = 코코아 속살 + 접혀 든 녹은 초콜릿 결(윤기).
"""
import loaf_kit as lk
import rye_kit as rk

PAL = dict(crust=('#4C2410', '#5C2E16', '#6E3A1C'), dark='#341606', ear='#86563A',
           cut=('#7A5038', '#8C5E44'), pore='#4A2C1C', shade='#2E180A')
def crumb(lib):
    # 둥근 덩이(r1)는 밝은 속살에 뚫린 구멍으로 읽혔다 → 접혀 든 초콜릿 결(윤기)로
    return rk.crumb(lib, crumb=('#5E3C2A', '#6E4834'), pore='#3A2216', rim=('#3A1A08', 0.009), fills=[
        dict(mask=lk.marble(scale=4.0, width=0.075, warp=2.2, stretch=(1, 1.4, 0.8), seed=3.0),
             col=('#26120A', '#3C2012'), halo=('#4A2C1C', 0.45), gloss=0.4)])


def build(lib):
    return rk.build_rye(lib, seed=43, crust=dict(pal=PAL, caraway=False), cut=('end', -0.3, (-1, -0.6, 0.25)),
                        crumb=crumb, opts=dict(uv_weight={'crumb': 1.8}))
