# 르방이

실제 사워도우 스타터(르방)의 리듬을 그대로 옮긴 **실시간 다마고치**.
하루 1~2번 밥을 주고, 4~8시간 뒤 피크를 맞추고, 성숙해지면 레시피를 해금해 떼어 굽는다.
무캐릭터 · 코지 톤 · 영구 사망 없음 · 완전 로컬(백엔드 0).

Grok 프로토타입(셰이더 반죽 + 탭 2개, 160줄)에서 출발 — 반죽 셰이더·팔레트·입력 모델을
보존·확장해 출시 품질로 리팩터링했다. 원본은 git 최초 커밋(`b04f729`).

## 스택

TypeScript(strict) · Vite · three.js(npm) · vitest · Capacitor 8 (Android, 로컬 번들 셸)

## 실행

```bash
npm install
npm run dev      # 웹 개발 서버
npm test         # sim 코어 vitest
npm run build    # dist/ (Capacitor webDir)
```

Android 빌드·에뮬·서명·Play 제출은 [docs/RELEASE.md](docs/RELEASE.md).

## 문서 (정본 지도)

| 문서 | 관할 |
|---|---|
| [docs/GDD.md](docs/GDD.md) | 게임 규칙·수치·콘텐츠 **정본** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 코드 계약·레이어링·저장·플랫폼 **정본** |
| [docs/VISUAL.md](docs/VISUAL.md) | 씬·uniform·연출·UI 룩 **정본** |
| [docs/RELEASE.md](docs/RELEASE.md) | 빌드·서명·Play 제출 절차 |
| [docs/QA.md](docs/QA.md) | 수동 QA 릴리스 게이트 |
| docs/design/ | 설계 워크플로 원문 (정본 아님 — 참고용) |

세 정본이 충돌하면 각자의 관할 영역이 이긴다.
