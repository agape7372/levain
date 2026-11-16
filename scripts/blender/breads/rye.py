"""호밀빵 (rye) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/rye{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 길이 1(국소 X), 바닥 z=0. 길이축을 az(ANGLE)로 돌려 레퍼런스처럼 화면 왼쪽 아래 → 오른쪽 위.
구성: 바타르 몸통 1(loft — 둥근 타원, 바닥은 납작) + 긴 칼집 1(귀는 약하게).
캐러웨이 씨는 기하 없이 재질에서 3D 보로노이 씨앗(무작위 방향 타원 + 볼록 범프)으로 — 수백 알을 삼각형 없이.
색: 레퍼런스 실측 밤색 #85593F~#885330 · 짙은 얼룩 #3F2412~#5B341B · 칼집 속 #AC692F.
형상 · 재질은 rye_kit.py(변형 rye--* 가 함께 쓴다).
"""
import rye_kit


def build(lib):
    return rye_kit.build_rye(lib)
