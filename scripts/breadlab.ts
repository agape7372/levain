// breadlab — 절차 모델링 하네스 (dev 전용). 계약: scripts/breads/types.ts · scripts/ingredients/types.ts.
// 씬·조명·카메라·Lambert 강제 = scripts/thumbsHarness.ts와 동일(프로덕션 룩 파리티).
//
// ⚠ 이름 빚: 파일명은 breadlab이지만 **빵·재료 두 패밀리를 다 굽는다**(?family=). 개명하면
//   CRIB.md·핸드오프·문서의 명령줄이 전부 깨지는데 얻는 게 이름뿐이라 두었다 (docs/INGREDIENTS.md 참조).
//
// URL 파라미터가 전체 상태(HMR 리로드·puppeteer 재사용 안전):
//   ?family=bread|ingredient   자산 패밀리 (기본 bread — 기존 빵 명령줄 무변경)
//   ?id=<id|debug>       대상 (debug = lib 검증용 내장 블롭)
//   ?view=34|front|top|orbit   카메라 (34 = thumbsHarness 수치 복제, 기본값)
//   ?azimuth=<도>        카메라를 Y축 기준 회전(턴테이블 게이트용 — view=34 기준 각도 오프셋)
//   ?overlay=0..1        레퍼런스 3/4뷰를 캔버스 위 반투명 오버레이
//   ?roundtrip=1         GLTFExporter→GLB→GLTFLoader 재로드 후 표시 = 런타임 파리티 최종 판정
//   ?compare=1           레퍼런스(좌)+렌더(우) 1024×512 콜라주 — 반복당 이미지 1장용
//   ?readability=1       판독 게이트 — 512² 렌더를 64²로 줄여 색 군집별 연결성분을 세고
//                        __stats.readability에 싣는다. #stage에 실제 카드 배경 위 확대 시트를 그린다.
//   ?shot=1              UI 숨김, 렌더 후 window.__done (스크린샷 자동화)
//   ?export=<id,..|all>  각 빵 GLB를 window.__glbs = { id: base64 }로 노출 후 __done
// 신호: window.__done / __error / __stats(JSON 문자열) / __glbs / __ids
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BREAD_BUILDERS, BREAD_ORDER } from './breads/index';
import { INGREDIENT_BUILDERS, INGREDIENT_ORDER } from './ingredients/index';
import { facet, hashId, jitterVertices, mergeByMaterial, mulberry32, stdMaterial, uvTopPlanar } from './breads/lib';
import { FAMILIES } from './lib/families.mjs';

declare global {
  interface Window {
    __done?: boolean;
    __error?: string;
    __stats?: string;
    __glbs?: Record<string, string>;
    __ids?: string[];
  }
}

const params = new URLSearchParams(location.search);
// 패밀리 분기 — 기본 bread라 family 없는 기존 빵 명령줄이 그대로 통한다(회귀 게이트)
const familyKey = params.get('family') === 'ingredient' ? 'ingredient' : 'bread';
const family = FAMILIES[familyKey];
const BUILDERS: Record<string, (rng: () => number) => THREE.Group> =
  familyKey === 'ingredient' ? INGREDIENT_BUILDERS : BREAD_BUILDERS;
const ORDER: readonly string[] = familyKey === 'ingredient' ? INGREDIENT_ORDER : BREAD_ORDER;

const id = params.get('id') ?? 'debug';
const view = params.get('view') ?? '34';
const overlay = Number(params.get('overlay') ?? '0');
const azimuth = Number(params.get('azimuth') ?? '0');
const roundtrip = params.get('roundtrip') === '1';
const compare = params.get('compare') === '1';
const shot = params.get('shot') === '1';
const readability = params.get('readability') === '1';
const exportParam = params.get('export');

window.__ids = Object.keys(BUILDERS);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(512, 512, false);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 30);
applyView(view);

// 조명 = thumbsHarness 동일. 파리티 캘리브레이션(2026-08-30, docs/VISUAL.md §1-3): 중성 화이트밸런스
// (0xffffff 3灯 전부) + 세기만으로 노출을 맞춘다 — 이전 앰버 키(0xffe2b0)는 B채널을 ×0.69로 깎아
// 정본 hex가 렌더에서 항상 어둡고 채널별로 편향되게 만든 원인이었다. 유도: MeshLambertMaterial의
// top face(normal +Y) 출력은 albedo·(dotNL_key·Ik + dotNL_fill·If + Ia)/π — 이 항이 정확히 π가
// 되면 정면으로 빛을 받는 면(윗면)이 정본 hex 그대로 렌더된다. 키·필 위치가 고정이라
// dotNL_key≈0.9045·dotNL_fill≈0.6838(둘 다 상수), 세 세기를 그 식에 맞춰 역산했다(Ik=2.4/If=0.3/Ia≈0.7656).
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-2, 6, 2);
scene.add(key);
scene.add(new THREE.AmbientLight(0xffffff, 0.7656));
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(2.5, 3, -2);
scene.add(fill);
// 측면 노출 캘리브레이션(2026-08-30 2차, VISUAL §1-3): 위 3灯은 윗면(normal +Y)만 타깃으로 역산돼
// 수직 벽(측면)이 레퍼런스보다 어둡게(그레이시하게) 죽었다. HemisphereLight(sky=검정,ground=흰색)를
// 더한다 — three의 getHemisphereLightIrradiance는 mix(ground, sky, 0.5·dot(N,up)+0.5)이고, 이 값은
// (ambient와 동일하게) RE_IndirectDiffuse에서 albedo/π를 곱해 최종 출력에 더해진다. N=(0,1,0)인
// 윗면은 dot=1 → 가중치가 sky(검정)에 100% 쏠려 기여 0/π=0(윗면 파리티 불변, 산수로 보장). 수직 벽은
// dot≈0 → 0.5·ground/π만큼 순증(sky=0이라 앰비언트 재조정 불필요). 세기 1.7 → 수직면 +0.5·1.7/π≈0.27
// 이론치, 실측(scone/loaf 측벽)으론 +0.16 — 레퍼런스 실측 측/윗면 비(0.886~1.05, 평균 0.175 언더슈트)에
// 렌더를 맞춘 값(비선형 sRGB 인코딩 탓에 이론치와 실측이 정확히 일치하진 않는다). 검증표는 VISUAL §1-3.
scene.add(new THREE.HemisphereLight(0x000000, 0xffffff, 1.7));

let controls: OrbitControls | null = null;
if (view === 'orbit') {
  controls = new OrbitControls(camera, canvas);
  controls.addEventListener('change', () => renderer.render(scene, camera));
}

function applyView(v: string): void {
  camera.up.set(0, 1, 0);
  if (v === 'front') camera.position.set(0, 0.15, 3.4);
  else if (v === 'top') {
    camera.position.set(0, 3.4, 0);
    camera.up.set(0, 0, -1);
  } else camera.position.set(-1.6, 2.2, 2.6); // 34 · orbit 시작점
  if (azimuth !== 0 && v !== 'top') {
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), (azimuth * Math.PI) / 180);
  }
  camera.lookAt(0, 0, 0);
}

/** 런타임(breadShowcase.ts)과 동일한 Lambert 강제 교체. */
function forceLambert(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial;
      o.material = new THREE.MeshLambertMaterial({ map: m.map ?? null, color: m.color ?? new THREE.Color(0xffffff) });
    }
  });
}

/** 런타임과 동일한 정규화: 중심 원점 + 최장축 1.6. */
function normalize(root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 1.6 / Math.max(size.x, size.y, size.z, 1e-6);
  root.scale.setScalar(s);
  root.position.copy(center).multiplyScalar(-s);
}

function statsOf(root: THREE.Object3D): { tris: number; verts: number; meshes: number } {
  let tris = 0;
  let verts = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      meshes++;
      const g = o.geometry as THREE.BufferGeometry;
      verts += g.attributes.position.count;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  return { tris, verts, meshes };
}

// ── 판독 게이트 (CRIB.md §판독 게이트 — 숫자 예산 통과 ≠ UI에서 읽힘) ─────────────────────
// 도감 카드 아트는 실제로 60×60이다(src/styles/main.css `.recipe-card .art img`). tri·KB가 전부
// 통과해도 그 크기에서 형상이 한 덩어리로 뭉개지면 자산은 실패다. 빵마다 파이썬을 새로 짜던 절차를
// 하네스 기능으로 승격했다(2026-09-02).
//
// 왜 브라우저 축소인가: 실제 표시 경로가 브라우저 축소다. PIL LANCZOS와 미세하게 다르지만 더 가깝다.
//   판정이 갈리면 파이썬 교차검증을 정본으로 본다(CRIB: DPR 렌더만 보고 통과시키지 말 것).
// 왜 색 군집을 자동으로 뽑는가: "빨강/흰색/초록"처럼 빵마다 다른 분류를 하드코딩하면 다음 빵에서
//   못 쓴다. 모델 자신의 지배 색을 히스토그램으로 뽑아 거기에 픽셀을 붙인다 — 빵 종류를 안 가린다.
const CARD_BG = '#F2E6D3'; // src/styles/main.css --bg-soft (도감 카드 표면). 흰 배경 판정은 다르게 나온다.
const READ_PX = 64;

interface ReadCluster {
  hex: string;
  px: number;
  blobs: number;
  largest: number;
}
interface ReadReport {
  px: number;
  coverage: number;
  blobs: number;
  dominantShare: number;
  clusters: ReadCluster[];
}

/** 4-이웃 연결성분. 3px 미만 조각은 세지 않는다 — 64²에서 1~2px은 안티에일리어싱 찌꺼기다. */
function componentsOf(mask: Uint8Array, w: number, h: number): { count: number; largest: number } {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let count = 0;
  let largest = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || seen[i] === 1) continue;
    seen[i] = 1;
    stack.length = 0;
    stack.push(i);
    let size = 0;
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      size++;
      const x = cur % w;
      const y = (cur - x) / w;
      if (x > 0 && mask[cur - 1] === 1 && seen[cur - 1] === 0) { seen[cur - 1] = 1; stack.push(cur - 1); }
      if (x < w - 1 && mask[cur + 1] === 1 && seen[cur + 1] === 0) { seen[cur + 1] = 1; stack.push(cur + 1); }
      if (y > 0 && mask[cur - w] === 1 && seen[cur - w] === 0) { seen[cur - w] = 1; stack.push(cur - w); }
      if (y < h - 1 && mask[cur + w] === 1 && seen[cur + w] === 0) { seen[cur + w] = 1; stack.push(cur + w); }
    }
    if (size >= 3) count++;
    if (size > largest) largest = size;
  }
  return { count, largest };
}

function hexOf(r: number, g: number, b: number): string {
  const two = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + two(r) + two(g) + two(b);
}

function downsampled(): ImageData {
  const small = document.createElement('canvas');
  small.width = READ_PX;
  small.height = READ_PX;
  const sctx = small.getContext('2d') as CanvasRenderingContext2D;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, READ_PX, READ_PX);
  return sctx.getImageData(0, 0, READ_PX, READ_PX);
}

/**
 * 렌더를 카드 크기로 줄여 판독성을 잰다.
 * ⚠ 측정은 **알파 마스크 위에서만** 한다 — 카드 배경(#F2E6D3)을 먼저 합성해 버리면 배경이
 *   밝은 크럼 색으로 분류돼 숫자가 오염된다. 배경 합성은 사람이 보는 시트에만 쓴다.
 *
 * 읽는 법: `dominantShare`가 크면(대략 0.5 이상) 실루엣이 색 하나에 먹혔다는 뜻이고,
 * `blobs`가 적으면 디테일이 서로 붙어 한 덩어리가 됐다는 뜻이다. 둘 다 나쁘면 폴리곤을
 * 올릴 게 아니라 **개수를 줄이고 하나를 키운다**(CRIB: 군집 실질 상한 3).
 */
function measureReadability(): ReadReport {
  const data = downsampled().data;
  const n = READ_PX * READ_PX;
  const objectIdx: number[] = [];
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] > 128) objectIdx.push(i);

  // 3비트/채널 히스토그램으로 지배 색 6개 — 빵 무관 자동 분류.
  const hist = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const i of objectIdx) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = hist.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    e.count++;
    e.r += r;
    e.g += g;
    e.b += b;
    hist.set(key, e);
  }
  const centroids = [...hist.values()]
    .sort((a, z) => z.count - a.count)
    .slice(0, 6)
    .map((e) => ({ r: e.r / e.count, g: e.g / e.count, b: e.b / e.count }));

  const assign = new Int8Array(n).fill(-1);
  for (const i of objectIdx) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const dr = r - centroids[c].r;
      const dg = g - centroids[c].g;
      const db = b - centroids[c].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    assign[i] = best;
  }

  const clusters: ReadCluster[] = [];
  let blobs = 0;
  let largestOverall = 0;
  for (let c = 0; c < centroids.length; c++) {
    const mask = new Uint8Array(n);
    let px = 0;
    for (let i = 0; i < n; i++) {
      if (assign[i] === c) {
        mask[i] = 1;
        px++;
      }
    }
    const comp = componentsOf(mask, READ_PX, READ_PX);
    blobs += comp.count;
    if (comp.largest > largestOverall) largestOverall = comp.largest;
    clusters.push({
      hex: hexOf(centroids[c].r, centroids[c].g, centroids[c].b),
      px,
      blobs: comp.count,
      largest: comp.largest,
    });
  }

  return {
    px: READ_PX,
    coverage: Math.round((objectIdx.length / n) * 1000) / 1000,
    blobs,
    dominantShare: Math.round((largestOverall / Math.max(objectIdx.length, 1)) * 1000) / 1000,
    clusters,
  };
}

/** 사람이 보는 시트 — 실제 카드 배경 위에 원래 크기 1장 + 최근접 8배 1장. #stage에 겹친다. */
function drawReadabilitySheet(): void {
  const stage = document.getElementById('stage') as HTMLElement;
  const sheet = document.createElement('canvas');
  sheet.id = 'read-sheet';
  sheet.width = 512;
  sheet.height = 512;
  sheet.style.cssText = 'position:absolute;inset:0;width:512px;height:512px;z-index:2;';
  const ctx = sheet.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, 512, 512);
  const small = document.createElement('canvas');
  small.width = READ_PX;
  small.height = READ_PX;
  (small.getContext('2d') as CanvasRenderingContext2D).putImageData(downsampled(), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, READ_PX, READ_PX, 24, 232, 60, 60); // 실물 크기(카드 60px)
  ctx.drawImage(small, 0, 0, READ_PX, READ_PX, 112, 16, 384, 384); // 6배 확대 — 어디가 뭉쳤는지
  stage.appendChild(sheet);
}

async function exportGLB(group: THREE.Object3D): Promise<ArrayBuffer> {
  const out = await new GLTFExporter().parseAsync(group, { binary: true });
  if (!(out instanceof ArrayBuffer)) throw new Error('GLTFExporter가 binary를 내지 않음');
  return out;
}

function toB64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** lib 자가검증용 내장 블롭 — 빌더 없이 하네스 단독 테스트. */
function debugBuilder(rng: () => number): THREE.Group {
  const g = new THREE.CylinderGeometry(0.9, 1, 0.5, 14, 3);
  jitterVertices(g, rng, 0.04);
  const baked = facet(g);
  uvTopPlanar(baked);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(baked, stdMaterial({ color: 0xc68958 })));
  return mergeByMaterial(group);
}

// lib.mergeByMaterial의 와인딩 사전 경고를 브라우저 콘솔에서 건져 stats로 올린다.
// 경고가 콘솔에만 남으면 puppeteer 경유(breadlab-shot)에서는 아무도 안 본다 —
// 검수 판정은 stdout `stats {json}` 숫자로 하기 때문이다(CRIB §검수 루프).
const buildWarnings: string[] = [];

function buildModel(modelId: string): THREE.Group {
  if (modelId === 'debug') return debugBuilder(mulberry32(hashId('debug')));
  const builder = BUILDERS[modelId];
  if (!builder) {
    throw new Error(
      `미등록 빌더: ${modelId} (family=${familyKey}) — 등록됨: [${Object.keys(BUILDERS).join(', ') || '없음'}]`,
    );
  }
  const realWarn = console.warn;
  console.warn = (...args: unknown[]): void => {
    buildWarnings.push(args.map(String).join(' '));
    realWarn.apply(console, args as []);
  };
  try {
    return builder(mulberry32(hashId(modelId)));
  } finally {
    console.warn = realWarn;
  }
}

// ---------- 모드 실행 ----------

async function runExport(spec: string): Promise<void> {
  const ids = spec === 'all' ? Object.keys(BUILDERS) : spec.split(',').map((s) => s.trim()).filter(Boolean);
  const glbs: Record<string, string> = {};
  for (const modelId of ids) {
    // 빌더별 격리 — 하나 실패해도 나머지는 낸다 (실패는 __error에 누적)
    try {
      glbs[modelId] = toB64(await exportGLB(buildModel(modelId)));
    } catch (e) {
      window.__error = `${window.__error ?? ''}${modelId}: ${String(e)}\n`;
    }
  }
  window.__glbs = glbs;
}

async function runView(): Promise<void> {
  let model: THREE.Object3D = buildModel(id);
  const glb = await exportGLB(model);
  const kb = glb.byteLength / 1024;

  if (roundtrip) {
    const gltf = await new GLTFLoader().parseAsync(glb, '');
    model = gltf.scene;
  }
  forceLambert(model);
  // ★리핏 전 치수를 잡아 둔다 — 런타임은 **최장축**을 1.6으로 맞추므로(normalize 참조),
  //   폭보다 높은 모델은 높이가 리핏을 잡아 카드에서 폭이 그만큼 줄어든다. 예산은 통과하는데
  //   카드에서만 작아지는 함정이라 숫자로 남긴다(2026-09-02 신설).
  const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const dims: Record<'x' | 'y' | 'z', number> = { x: rawSize.x, y: rawSize.y, z: rawSize.z };
  const refitAxis = (['x', 'y', 'z'] as const).reduce((a, k) => (dims[k] > dims[a] ? k : a), 'x' as 'x' | 'y' | 'z');
  const aspect = dims.y / Math.max(dims.x, dims.z, 1e-6);
  normalize(model);
  scene.add(model);

  const s = statsOf(model);
  // ★예산은 패밀리마다 다르다 — 여기를 하드코딩으로 되돌리면 재료가 빵의 헐거운 상한(250KB/8000tri)으로
  //   조용히 통과한다. 정본은 scripts/lib/families.mjs.
  const over = kb > family.perKB || s.tris > family.maxTri;
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  const statPayload: Record<string, unknown> = {
    family: familyKey, id, ...s, kb: Math.round(kb * 10) / 10, over, roundtrip,
    bbox: { x: round3(dims.x), y: round3(dims.y), z: round3(dims.z) },
    refitAxis,
    aspect: round3(aspect),
  };
  // 와인딩 사전 경고는 **있으면 반드시 보이게** 한다 — merge 이후엔 check-winding이 못 잡는다.
  if (buildWarnings.length > 0) statPayload.warnings = buildWarnings;

  if (!shot && !compare) buildUI(kb, s, over, glb, { refitAxis, aspect });
  if (compare) await buildCompare();

  renderer.render(scene, camera);
  if (controls) controls.update();

  if (readability) {
    // 측정 직전에 한 번 더 그린다 — preserveDrawingBuffer가 없어 컴포지트 뒤 버퍼가 비어 있을 수 있다.
    renderer.render(scene, camera);
    statPayload.readability = measureReadability();
    drawReadabilitySheet();
  }
  window.__stats = JSON.stringify(statPayload);
}

function refSrc(n: 0 | 1 | 2): string {
  return `/assets/${family.refDir}/src/${id}${n === 0 ? '' : `-${n + 1}`}.png`;
}

function buildUI(
  kb: number,
  s: { tris: number; verts: number; meshes: number },
  over: boolean,
  glb: ArrayBuffer,
  fit: { refitAxis: string; aspect: number },
): void {
  const stats = document.getElementById('stats') as HTMLDivElement;
  stats.textContent =
    `${familyKey}/${id}  ${roundtrip ? '[roundtrip]' : '[direct]'}\n` +
    `tri ${s.tris} / ${family.maxTri}   vert ${s.verts}   mesh ${s.meshes} (≤2)\n` +
    `GLB ${kb.toFixed(1)}KB / ${family.perKB}KB ${over ? '  ⚠ 예산 초과' : ''}\n` +
    `리핏축 ${fit.refitAxis}   높이/폭 ${fit.aspect.toFixed(2)}${fit.refitAxis === 'y' ? '  ⚠ 높이가 리핏을 잡는다(카드에서 폭이 줄어듦)' : ''}`;
  if (over) stats.classList.add('over');

  const controlsEl = document.getElementById('controls') as HTMLDivElement;
  const sel = document.createElement('select');
  for (const b of ['debug', ...ORDER]) {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = BUILDERS[b] || b === 'debug' ? b : `${b} (미등록)`;
    if (b === id) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => go({ id: sel.value });
  controlsEl.appendChild(sel);

  // 패밀리 토글 — go()가 location.search를 복사하므로 다른 파라미터는 보존된다
  const fam = document.createElement('button');
  fam.textContent = familyKey === 'bread' ? '→ 재료' : '→ 빵';
  fam.onclick = () => go({ family: familyKey === 'bread' ? 'ingredient' : '', id: 'debug' });
  controlsEl.appendChild(fam);

  for (const v of ['34', 'front', 'top', 'orbit'] as const) {
    const b = document.createElement('button');
    b.textContent = v;
    b.disabled = v === view;
    b.onclick = () => go({ view: v });
    controlsEl.appendChild(b);
  }

  const rt = document.createElement('button');
  rt.textContent = roundtrip ? 'roundtrip 해제' : 'roundtrip';
  rt.onclick = () => go({ roundtrip: roundtrip ? '' : '1' });
  controlsEl.appendChild(rt);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.05';
  slider.value = String(overlay);
  slider.oninput = () => setOverlay(Number(slider.value));
  controlsEl.appendChild(slider);

  const dl = document.createElement('button');
  dl.textContent = `${id}.glb 다운로드`;
  dl.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    a.download = `${id}.glb`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  controlsEl.appendChild(dl);

  if (id !== 'debug') {
    const refs = document.getElementById('refs') as HTMLDivElement;
    for (const n of [0, 1, 2] as const) {
      const img = document.createElement('img');
      img.src = refSrc(n);
      img.onerror = () => img.remove();
      refs.appendChild(img);
    }
  }
  setOverlay(overlay);
}

function setOverlay(v: number): void {
  const img = document.getElementById('overlay-img') as HTMLImageElement;
  if (v > 0 && id !== 'debug') {
    img.src = refSrc(0);
    img.style.opacity = String(v);
    img.hidden = false;
  } else img.hidden = true;
}

async function buildCompare(): Promise<void> {
  document.body.classList.add('compare');
  const layout = document.getElementById('layout') as HTMLDivElement;
  const cmp = document.createElement('div');
  cmp.id = 'cmp';
  const ref = document.createElement('img');
  ref.src = refSrc(0);
  cmp.appendChild(ref);
  cmp.appendChild(canvas);
  layout.replaceChildren(cmp);
  // 레퍼런스 로드 완료 전에 __done이 뜨면 스크린샷이 빈 좌측을 찍는다
  await ref.decode().catch(() => undefined);
  // DOM 이동 후 재렌더 (preserveDrawingBuffer 없이 컴포지터 이미지 갱신)
  renderer.render(scene, camera);
}

function go(patch: Record<string, string>): void {
  const next = new URLSearchParams(location.search);
  next.set('id', id);
  for (const [k, v] of Object.entries(patch)) {
    if (v === '') next.delete(k);
    else next.set(k, v);
  }
  location.search = next.toString();
}

(async () => {
  if (shot || compare) document.body.classList.add('shot');
  if (exportParam) await runExport(exportParam);
  else await runView();
})()
  .catch((e: unknown) => {
    window.__error = String(e);
    const stats = document.getElementById('stats');
    if (stats) stats.textContent = String(e);
  })
  .finally(() => {
    window.__done = true;
  });
