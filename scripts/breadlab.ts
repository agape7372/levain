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
const exportParam = params.get('export');

window.__ids = Object.keys(BUILDERS);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(512, 512, false);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 30);
applyView(view);

// 조명 = thumbsHarness 동일
const key = new THREE.DirectionalLight(0xffe2b0, 1.4);
key.position.set(-2, 6, 2);
scene.add(key);
scene.add(new THREE.AmbientLight(0xfff0dc, 0.75));
const fill = new THREE.DirectionalLight(0xdce8ff, 0.2);
fill.position.set(2.5, 3, -2);
scene.add(fill);

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

function buildModel(modelId: string): THREE.Group {
  if (modelId === 'debug') return debugBuilder(mulberry32(hashId('debug')));
  const builder = BUILDERS[modelId];
  if (!builder) {
    throw new Error(
      `미등록 빌더: ${modelId} (family=${familyKey}) — 등록됨: [${Object.keys(BUILDERS).join(', ') || '없음'}]`,
    );
  }
  return builder(mulberry32(hashId(modelId)));
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
  normalize(model);
  scene.add(model);

  const s = statsOf(model);
  // ★예산은 패밀리마다 다르다 — 여기를 하드코딩으로 되돌리면 재료가 빵의 헐거운 상한(250KB/8000tri)으로
  //   조용히 통과한다. 정본은 scripts/lib/families.mjs.
  const over = kb > family.perKB || s.tris > family.maxTri;
  window.__stats = JSON.stringify({
    family: familyKey, id, ...s, kb: Math.round(kb * 10) / 10, over, roundtrip,
  });

  if (!shot && !compare) buildUI(kb, s, over, glb);
  if (compare) await buildCompare();

  renderer.render(scene, camera);
  if (controls) controls.update();
}

function refSrc(n: 0 | 1 | 2): string {
  return `/assets/${family.refDir}/src/${id}${n === 0 ? '' : `-${n + 1}`}.png`;
}

function buildUI(kb: number, s: { tris: number; verts: number; meshes: number }, over: boolean, glb: ArrayBuffer): void {
  const stats = document.getElementById('stats') as HTMLDivElement;
  stats.textContent =
    `${familyKey}/${id}  ${roundtrip ? '[roundtrip]' : '[direct]'}\n` +
    `tri ${s.tris} / ${family.maxTri}   vert ${s.verts}   mesh ${s.meshes} (≤2)\n` +
    `GLB ${kb.toFixed(1)}KB / ${family.perKB}KB ${over ? '  ⚠ 예산 초과' : ''}`;
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
