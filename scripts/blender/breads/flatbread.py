"""플랫브레드 (flatbread) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/flatbread{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 지름 1(살짝 타원), 바닥 z=0, 정면 = Blender −Y. 형상 · 재질 · 조립은 flat_top.build_flatbread(변형과 같이 쓴다).
구성: 얇은 둥근 판(두께 0.045) · 크게 부푼 기포 물집 9(꼭대기가 탐) · 작은 물집 14 · 납작한 탄 반점 18.
      탄 자국 = 짙은 고동~검정 가운데 + 갈색 번짐 테. 옛 모델은 민 원반에 점을 찍어 쿠키로 읽혔다(2026-11-14).
"""
import flat_top

SEED = 13


def build(lib):
    lib.reset(SEED)
    return flat_top.build_flatbread(lib, SEED)
