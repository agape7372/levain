"""비트 호밀빵 (rye--beet-puree) — 형상 · 껍질은 rye_kit.build_rye(넓힌 칼집).

실물: 네이버 이미지 「비트 호밀빵」(2026-11-16) — 비트 퓌레 반죽이라 속살이 자홍 · 분홍, 껍질은 자줏빛이 살짝 도는 갈색.
구성: 통빵 그대로 · 껍질에 자줏빛 적갈 톤(검게 가라앉지 않게) · 캐러웨이 유지 · 칼집을 넓혀 벌어진 속을 채도 낮은 자홍으로.
단면(와인색 r1 · 형광 자홍 + 흰 결 r3)은 햄 · 날고기 · 뇌로 읽혔다 — 단면을 쓰지 않는다.
"""
import rye_kit as rk

PAL = dict(crust=('#5E2618', '#70301E', '#843E28'), dark='#46180E', ear='#A0625A',
           cut=('#A8456A', '#B85878'), pore='#7E3050', shade='#4A1A20')
SLASHES = [(0.0, -0.06, 6, 0.35, 0.062, 0.04, 0.008)]  # 반폭 0.04 → 0.062: 벌어진 속이 넓게 보이게


def build(lib):
    return rk.build_rye(lib, seed=67, crust=dict(pal=PAL, slashes=SLASHES))
