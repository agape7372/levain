"""식빵 (loaf) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/loaf{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 길이 1(국소 X), 바닥 z=0. 길이축을 az(ANGLE)로 돌려 레퍼런스처럼 짧은 끝면이 화면 왼쪽, 긴 옆면이 오른쪽.
구성: 몸통 1(loft) — 단면 = 납작한 바닥 · 둥근 아래 모서리 · 곧은 팬 옆벽 · 팬 테 위로 살짝 부푼 뚜껑(돔).
  길이 방향은 끝으로 갈수록 단면을 무게중심 쪽으로 줄여(지수 10) 끝면이 평평한 둥근 모서리 상자가 된다.
색: 레퍼런스 실측 돔 #E79C56·#C87F40(그늘) · 옆면 #FDE5BE(밝은 쪽)·#E2C79D(그늘 쪽).
형상 · 재질은 loaf_kit.py(변형 loaf--* 가 함께 쓴다).
"""
import loaf_kit


def build(lib):
    return loaf_kit.build_loaf(lib)
