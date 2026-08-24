// 빵 빌더 계약 — M2 서브에이전트 위임 시 이 파일이 정본이다.
//
// 소비 경로: breadlab(하네스) → GLTFExporter → public/breads/<id>.glb
//            → 앱 src/render/breadShowcase.ts + scripts/thumbsHarness.ts
//
// ## 불변 계약 (어기면 런타임에서 조용히 깨진다)
//
// 1. 반환 Group 안의 Mesh는 **머티리얼 기준 ≤2개** (쇼케이스 draw call 예산 ≤4 = 빵 1~2 + 섀도).
//    img2threejs 팩토리 산출물은 다중 파트여도 되지만(스킬 게이트가 요구),
//    이 빌더가 반환하기 전에 lib.mergeByMaterial()로 합칠 것. 팩토리 원본을 직접 merge하지 말 것.
// 2. 머티리얼은 lib.stdMaterial()만 — MeshStandardMaterial({ map, color, roughness:1, metalness:0 }).
//    런타임이 로드 후 MeshLambertMaterial로 강제 교체하며 **map과 color만 승계**된다.
//    ⚠ 버텍스 컬러(vertexColors)는 죽는다. img2threejs가 vertex paint를 쓰면 반드시
//    캔버스 텍스처(lib.bakeTexture) 또는 머티리얼 분리로 변환할 것.
// 3. 페이셋 룩은 지오메트리에 베이크: 지터는 indexed 상태에서(lib.jitterVertices),
//    그 다음 lib.facet()으로 non-indexed + 플랫 노멀. flatShading 플래그는 Lambert 교체에서
//    승계되지 않으므로 의미 없다.
// 4. 모든 지오메트리에 UV 필수(lib.uv* 프로젝터) — mergeByMaterial의 attribute 일관성 조건.
// 5. 난수는 인자 rng만 사용(Math.random 금지) — GLB 바이트 결정론(재수출 diff 안정성).
// 6. tri 목표 600~1500, 상한 8000/개. 파일 ≤250KB, 10종 합 ≤2560KB (scripts/check-budget.mjs).
// 7. 절대 스케일 무의미(런타임이 최장축 1.6으로 리핏) — **스펙 비율만 엄수**
//    (assets/prompts/breads/<id>.json geometry 필드가 비율·색 정본). Y-up,
//    "정면"이 3/4 카메라 (-1.6, 2.2, 2.6) 쪽을 향하게.
// 8. 팔레트 hex는 prompts JSON에서 손 전사하고 출처 주석을 남길 것 (JSON import 금지 —
//    hex가 문장 안에 박혀 있어 구조적 파싱 불가).
// 9. 텍스처는 basecolor 1장 ≤512²만(PBR 맵 금지, docs/VISUAL.md §8). 순색 ≤2로 충분하면 텍스처 0.
import type * as THREE from 'three';

/** 빵 1종 = 순수 팩토리. 같은 rng 시드면 같은 지오메트리(바이트 결정론). */
export type BreadBuilder = (rng: () => number) => THREE.Group;
