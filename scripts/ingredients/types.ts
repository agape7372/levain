// 재료 빌더 계약 — 서브에이전트 위임 시 이 파일이 정본이다.
//
// 소비 경로: breadlab(하네스, ?family=ingredient) → GLTFExporter → public/ingredients/<id>.glb
//            → 앱 src/render/breadShowcase.ts + scripts/thumbsHarness.ts
//            → 도감 카드는 public/ingredients/thumbs/<id>.png (bake-thumbs.mjs 산출)
//
// 공용 유틸은 scripts/breads/lib.ts를 **그대로 import 한다**(옮기지 않았다 — 빵 10종이 검증한
// 자산이고 bread 전용 로직이 0이라 이동은 바이트 결정론에 드리프트 위험만 준다):
//   import { facet, hashId, jitterVertices, mergeByMaterial, mulberry32, stdMaterial, uvTopPlanar } from '../breads/lib';
//
// ## 빵 계약에서 그대로 계승하는 것 (scripts/breads/types.ts 원문 참조)
//
// 1. 반환 Group 안의 Mesh는 **머티리얼 기준 ≤2개**. mergeByMaterial()로 합쳐서 반환한다.
//    쇼케이스 draw call 예산 ≤4는 빵과 **공유**한다(2배가 아니다, VISUAL §8).
// 2. 머티리얼은 lib.stdMaterial()만. 런타임이 MeshLambertMaterial로 강제 교체하며
//    **map과 color만 승계**된다. ⚠ 버텍스 컬러·PBR 채널·flatShading은 전부 죽는다.
// 3. 페이셋 룩은 지오메트리에 베이크: indexed에서 jitterVertices → facet()으로 non-indexed + 플랫 노멀.
// 4. 모든 지오메트리에 UV 필수(lib.uv* 프로젝터) — mergeByMaterial의 attribute 일관성 조건.
// 5. 난수는 인자 rng만(Math.random 금지) — GLB 바이트 결정론.
// 6. 절대 스케일 무의미(런타임이 최장축 1.6으로 리핏) — **비율만 엄수**. Y-up,
//    "정면"이 3/4 카메라 (-1.6, 2.2, 2.6) 쪽을 향하게.
// 7. 팔레트 hex는 assets/prompts/ingredients/<id>.json에서 **손 전사**하고 출처 주석을 남길 것
//    (JSON import 금지 — hex가 산문 안에 박혀 있어 구조적 파싱 불가).
//    JSON에 없는 색은 lib.scaleHex 결정론 유도 + 출처 주석.
// 8. LatheGeometry 금지(φ-seam 실금) — lib.buildRevolvedShell, 프로필 t는 단조 유지.
//
// ## 재료 전용 개정 4조 — 빵과 다른 부분만
//
// ### R1. 군집이 예외가 아니라 다수다
// 12종 중 7종이 다중 인스턴스 피사체다(올리브 3알 · 초코칩 여러 개 · 크랜베리 뭉치 ·
// 치즈 큐브 3개 · 블루베리 3알 · 로즈마리 바늘잎 배열 · 계피 스틱 2 + 가루 더미).
// 빵에는 없던 형태라 계약에 명시한다 — 명시하지 않으면 빌더마다 배치 방식을 재발명한다.
//
//   - N개 인스턴스를 **한 빌더 안에서** rng 지터 트랜스폼(위치·회전·미세 스케일)으로 배치한다.
//   - 인스턴스는 **공유 지면 y=0**에 앉는다. 뜨는 파트 금지 — 부감 카메라에서 즉시 들킨다.
//   - 인스턴스끼리 그룹 실루엣을 서로 가리지 않게 한다(프롬프트 JSON의 silhouette 서술 준수).
//   - ⚠ 파트를 **따로 만들어 각각 지터하면 공유 링이 찢어진다.** 한 덩어리 indexed로 만들고
//     facet 후 lib.sliceTriangles로 삼각형 구간을 가르는 게 정본 순서다(pancake 선례).
//
// ### R2. 예산 — 빵과 같다 (정본은 scripts/lib/families.mjs)
//
//   하드 상한: **개당 ≤250KB · ≤8000 tri** (check-budget.mjs가 집행)
//   합계: 개수 비례 **160KB/개** — 자라는 패밀리라 고정 상수를 안 쓴다.
//
//   ★2026-08-26 상향(100KB/2500tri → 250KB/8000tri). 원래 "재료는 빵보다 단순하니 조인다"였는데
//   **그 전제가 틀렸다.** 조인 진짜 이유는 도감 썸네일이 작아서였고, 재료도 빵과 **똑같은 쇼케이스에서**
//   **똑같은 크기로 확대돼 감상된다**는 걸 계산에 안 넣었다(breadShowcase.ts의 FIT_SIZE는 패밀리를 안 가린다).
//   결과: 64px에서는 멀쩡하고 전체 화면에서는 각지고 조잡했다 — 실기기에서 드러났다.
//   **폴리곤을 아껴서 각지게 만들지 마라.** 전체 화면에서 매끄러운 게 우선이다.
//
//   ⚠ **세그먼트를 올리면 지터 진폭도 같이 내려라.** 지터가 극 근처 링의 컬럼 간격(≈π·r/segments)을
//   넘으면 극 팬 삼각형이 뒤집힌다. 실측: fig 안쪽향 17장 → amp 0.017→0.011에서 2장, pumpkin 7 → 0.
//
// ### R3. 텍스처는 기본 0장, ≤256²
// 순색 stdMaterial({ color }) 버킷 2개가 표준이다. lib.bakeTexture는 **탈출구**다.
// ⚠ 원래 근거였던 "64px 썸네일이 최종 소비처다"는 **틀렸다** — 최종 소비처는 전체 화면 쇼케이스다(R2 참조).
// 그래도 ≤256²를 유지하는 건 예산 때문이지 해상도가 충분해서가 아니다. 필요하면 근거를 대고 올려라.
//
//   프롬프트 JSON의 hex는 재료당 3~5개다(실측: 3개 = olive·choco·cranberry·walnut·blueberry /
//   4개 = cheese·chestnut·cinnamon·rosemary / 5개 = fig·pumpkin·strawberry).
//   ≤2 머티리얼 계약과 충돌하므로 **hue → 버킷 매핑을 스펙 작성 시점에 확정한다.**
//   구현 중에 발견하면 늦다 — 지오메트리를 다시 갈라야 한다.
//
//   해법 순서:
//     ① 큰 색 영역이 2개면 순색 머티리얼 2개 (baguette·pancake 패턴)
//     ② 3개 이상이면 **한 버킷에 작은 텍스처를 얹어** 나머지를 평면 영역으로 싣는다
//        (campagne·rye·wholewheat 패턴). 3번째 머티리얼을 만들지 않는다.
//     확정 후보 = pumpkin(껍질·홈그늘·자른면·씨방·꼭지 5색): 머티리얼 2개(껍질·자른면) +
//     껍질 버킷 텍스처가 꼭지·홈그늘을 싣는다.
//
// ### R4. 얇은 파트에 빵 지터 진폭을 그대로 먹이지 마라
// jitterVertices의 amp는 빵 크러스트 스케일로 튜닝돼 있다. 로즈마리 바늘잎·계피 스틱 벽에
// 그대로 쓰면 실루엣이 뭉개진다. **파트별 amp 축소 또는 지터 생략**으로 해결한다 —
// lib.ts를 고치지 말 것(빵 10종의 바이트가 바뀐다).
//
// ## 최종 게이트: 64px 판독
// 썸네일은 512²로 굽지만 도감 그리드에선 **~64px**로 뜬다. tri·KB를 다 통과하고도
// 갈색 얼룩으로 읽힐 수 있다. 안 읽히면 폴리곤이 아니라 **실루엣을 단순화**한다
// (인스턴스 개수를 줄이고 하나를 키운다). rosemary·cinnamon이 1순위 위험군.
import type * as THREE from 'three';

/** 재료 1종 = 순수 팩토리. 같은 rng 시드면 같은 지오메트리(바이트 결정론). */
export type IngredientBuilder = (rng: () => number) => THREE.Group;
