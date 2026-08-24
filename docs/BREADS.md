# 빵 GLB 파이프라인 — 절차 정본

빵 10종(`public/breads/<id>.glb` + `thumbs/<id>.png`)의 제작·수정 절차. 2026-08-24 구축.
소비 계약(런타임 Lambert 강제·예산·리핏)은 `scripts/breads/types.ts` 주석이 정본 — 코드 작성 전 필독.

## 구성 요소

| 것 | 위치 | 역할 |
|---|---|---|
| 빌더 | `scripts/breads/<id>.ts` | 빵 1종 = `BreadBuilder` 순수 팩토리. 레지스트리 `index.ts` |
| 공유 유틸 | `scripts/breads/lib.ts` | PRNG·facet·jitter·UV 프로젝터·mergeByMaterial·sliceTriangles 등 |
| breadlab 하네스 | `breadlab.html` + `scripts/breadlab.ts` | dev 전용 프리뷰·검수·내보내기 벤치. URL 파라미터가 전체 상태(파일 머리 주석 참조: id·view·azimuth·overlay·roundtrip·compare·shot·export) |
| 스크린샷 CLI | `scripts/breadlab-shot.mjs` | `node scripts/breadlab-shot.mjs "<query>" out.png` — stdout에 stats JSON |
| 배치 내보내기 | `scripts/export-breads.mjs` | `npm run breads:export [-- id…]` → GLB 저장 (GLTFExporter는 canvas 의존이라 puppeteer 경유가 유일 경로) |
| 예산 검사 | `scripts/check-budget.mjs` | 개당 ≤250KB · 합 ≤2560KB · ≤8000 tri |
| 썸네일 | `scripts/bake-thumbs.mjs` (`npm run thumbs`) | 512² 투명 PNG, 도감 카드용 |
| 모델링 스펙 | `assets/breads/specs/<id>.json` | img2threejs ObjectSculptSpec 보존본(수치 정본 — 코드는 전사) |
| 레퍼런스 | `assets/breads/src/<id>[-2|-3].png` | 형태·비율 정본(3/4·정면·탑다운). **색 정본은 prompts JSON** |
| 워크스페이스 | `assets/breads/work/<id>/` | 스킬 state·author_spec.py·검증 스크립트·렌더. `work/CRIB.md` = 위임용 요약 크립 |

## 새 빵 추가·기존 빵 수정 절차

1. **모델링 엔진 = img2threejs 스킬** (`~/.claude/skills/img2threejs`, 4단계 state 게이트). 절차·스킵 규칙·함정은 `assets/breads/work/CRIB.md`가 요약 정본 — 스펙 프라이어(`assets/prompts/breads/<id>.json` geometry)를 주입해 비전 최소화, complexity=simple, 6패스.
2. 팩토리를 `scripts/breads/<id>.ts`로 어댑트: indexed에서 지터 → `facet` → UV → `stdMaterial` → `mergeByMaterial`(메시 ≤2). 수치를 고칠 땐 **스펙(author_spec.py) 먼저, 코드는 전사**.
3. 검수: `breadlab.html?id=<id>&compare=1`(레퍼런스 콜라주) → `&roundtrip=1`(런타임 파리티 최종 판정) → azimuth 90/180/270 턴테이블.
4. `npm run breads:export -- <id>` → `npm run check-budget` → `npm run thumbs`.
5. 검증: `npm test` + `npm run build` + dev 앱에서 도감 카드·쇼케이스 Screen 확인.

## 함정 (실측 유래 — 상세는 CRIB.md와 각 빌더 머리 주석)

- 런타임이 모든 머티리얼을 `MeshLambertMaterial({map, color})`로 강제 교체 — **버텍스컬러·PBR·flatShading 죽음**. 페이셋은 지오메트리에 베이크, 색은 map/color만.
- displacement 디테일은 정점 간격보다 작으면 조용히 사라진다 — 격자 셀 단위로 팔 것, 벽 기울기 ≥30°.
- `LatheGeometry` 금지(φ-seam 실금). 링 수동 구성(`lib.buildRevolvedShell`). 프로필 t는 **단조** 유지(비단조면 접힌 주름 — domeShell 사례).
- 투톤은 한 덩어리 indexed → facet → 삼각형 구간 분리(`sliceTriangles`). 흩어진 색 영역은 삼각형 생성 순서를 통제해 구간화(flatbread char / focaccia oil 참조).
- 비대칭 빵은 **방향을 1반복차에 확인**(scone: 180° 회전만으로 IoU 0.659→0.821).
- GLB 크기 ≈ non-indexed vert × 32B(선형). 텍스처는 basecolor 1장 ≤512² PNG(GLTFExporter는 PNG만 굽는다, VISUAL §8).
- vite 스폰 스크립트: "Local:" 배너는 ANSI 스트립 후 파싱, Windows에서 자식 종료는 taskkill 트리킬(`scripts/export-breads.mjs` killTree 참조). puppeteer Chrome 캐시 손상 대비 폴백 = `scripts/lib/launch-browser.mjs`.
- 스킬 python은 Bash로 실행 + `PYTHONIOENCODING=utf-8`(PowerShell은 exit 49 / cp949 사망).

## 결정 이력 (2026-08-24)

- higgsfield generate_3d 폐기 → three.js 절차 모델링(사용자 확정). GLB 내보내기는 breadlab 담당(스킬은 코드 전용).
- 색 정본 = 프롬프트 JSON hex(이미지는 형태·비율만). JSON에 없는 색은 `scaleHex` 결정론 유도 + 출처 주석.
- meshopt 인코딩 미도입 — 합계 1090KB/2560KB로 여유. 예산 압박 시 @gltf-transform 도입이 릴리프 밸브.
