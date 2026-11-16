"""크래커 (cracker) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/cracker{,-2,-3}.png — 정면(1번)이 정체성 기준, 구멍 격자는 위에서 본 3번.
단위: 한 변 1, 바닥 z=0, 정면 = Blender −Y. 판 형상은 slab.py.
구성: 얇은 정사각 판(두께 0.04) · 도킹 홀 5×5(깔때기 + 가운데 바늘 구멍) · 연한 기포 물집 · 검은 깨알 반점 ·
      가장자리로 갈수록 짙게 구운 금빛. 옛 모델은 구멍 대신 각진 돌기 판이라 고무 매트로 읽혔다(2026-11-14).
"""
import slab


def build(lib):
    return slab.build_cracker(lib)
