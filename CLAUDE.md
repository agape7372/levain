# 르방이 — Claude 작업 규칙

르방(사워도우 스타터) 키우기 실시간 다마고치. TS + Vite + three.js + Capacitor 8 Android(로컬 번들 셸).
백엔드 0, 완전 로컬, CI 없음(검증 전부 로컬).

## 정본 지도 — 코드 작성 전 반드시 해당 관할 문서를 따른다

- 게임 규칙·수치·문구 톤: `docs/GDD.md`
- 코드 계약·레이어링·저장·Capacitor: `docs/ARCHITECTURE.md`
- 씬·uniform·연출·색 토큰: `docs/VISUAL.md`
- `docs/design/`은 원문 참고용 — 정본과 충돌하면 정본이 이긴다.

## 불변 규칙 (어기면 안 되는 것)

1. **sim은 순수**: `src/sim/`은 three/DOM/Capacitor/`Date.now()` import·호출 0. now는 항상 인자.
   ESLint `no-restricted-imports`가 잠근다 — 풀지 말 것.
2. **게임 시간 = wall-clock**: rAF·프레임 델타를 게임 시간에 누적 금지. rAF는 렌더 화장품 전용.
3. **닫힌 함수 모델**: 파생 가능한 값은 저장하지 않는다. 적분 루프·고정 스텝 금지.
4. **시계 역행 = 전 타임스탬프 재정박** (GDD §3-8). 새 타임스탬프 필드를 추가하면 재정박 목록에도 추가.
5. **모달은 중앙 팝업** — 바닥 시트 금지 (사용자 확정 규칙, `ui/components/modal.ts` 주석 참조).
6. **문구는 `src/ui/copy.ts` 한 파일** — 담백한 한국어, 시스템어·내부 용어·죄책감 유발·빨강 경고 금지.
7. **무캐릭터**: 눈·표정·하트·별 이펙트 금지. 연출은 전부 다이제틱(밀가루·기포·김).
8. **셰이더 범프 배열은 단일 uniform 소스** — 버텍스/프래그먼트 리스트를 따로 두지 말 것 (VISUAL §0).
9. 밸런스 상수는 전부 `src/sim/constants.ts` — 다른 곳에 수치 하드코딩 금지.
10. **appId는 Play 등록 후 변경 불가** — 사용자 확정 없이 바꾸지 말 것.

## 검증

`npm test`(vitest) → `npm run build` → 수동은 `docs/QA.md`. Android는 `docs/RELEASE.md` 절차
(JDK21 = `D:/android-toolchain/jdk21`, 에뮬 함정 6종 포함).

## 진행 기록

구현 중 결정·이탈은 `implementation-notes.md`(커밋 제외, .gitignore)에. 마일스톤 완료 시 커밋.
