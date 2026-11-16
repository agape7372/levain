"""바게트 (baguette) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/baguette{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 길이 1(국소 X), 바닥 z=0. 배치에서 길이축을 az(ANGLE)로 돌려 레퍼런스처럼 화면 왼쪽 아래 → 오른쪽 위.
구성: 몸통 1(loft — 납작한 바닥 · 뾰족하게 둥근 양끝) + 사선 칼집 4(속살 렌즈 · 한쪽 테가 들린 귀).
색: 레퍼런스 실측 껍질 #BE6E22 · 귀 #E4AC5E · 속살 #F9DCA6 · 끝 #9A571A~#A55E1B.
형상 · 재질은 baguette_kit.py(변형 baguette--* 가 함께 쓴다).
"""
import baguette_kit


def build(lib):
    return baguette_kit.build_baguette(lib)
