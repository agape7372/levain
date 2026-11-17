// 썸네일 하니스 — ?family=&?id=<id>의 GLB를 고정 카메라·조명으로 1프레임 렌더.
// 완료 시 window.__done = true (puppeteer가 대기 후 캔버스 캡처).
// 앱 아이콘용은 ?icon=1 — 병+도우 히어로 구도 대신 GLB 단독 구도만 v1 지원.
// 검수용(기본값이면 썸네일과 같은 그림): ?az=<도> 빵을 세로축으로 돌림(턴테이블 게이트) · ?size=<px> 캔버스.
// 빵은 기본이 툰(src/render/toonMaterial.ts). 검수용: ?glb=<루트 기준 URL 경로> GLB 위치 대체
//   · ?style=toon|pbr 강제 · ?line=1.2 외곽선 px(512 캔버스 기준)
// 재질 정책은 앱 쇼케이스와 같은 src/render/breadMaterial.ts(PBR 자산 = Standard + 환경맵).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FAMILIES } from './lib/families.mjs';
import { applyBreadMaterials, createRoomEnvironment } from '../src/render/breadMaterial';
import { applyToon, TOON_LINE } from '../src/render/toonMaterial';

declare global {
  interface Window {
    __done?: boolean;
    __error?: string;
  }
}

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'campagne';
// 기본 bread — family 없는 기존 호출(빵 썸네일)이 그대로 통한다
const family = FAMILIES[params.get('family') === 'ingredient' ? 'ingredient' : 'bread'];
const azimuth = THREE.MathUtils.degToRad(Number(params.get('az') ?? '0'));
const canvasPx = Number(params.get('size') ?? '512');

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(canvasPx, canvasPx, false);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 30);
camera.position.set(-1.6, 2.2, 2.6); // 3/4 top-front — 프롬프트 카메라 지문과 일치
camera.lookAt(0, 0, 0);

// 파리티 캘리브레이션(2026-08-30) — breadlab.ts와 동일 값·근거. docs/VISUAL.md §1-3 참조.
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-2, 6, 2);
scene.add(key);
const ambient = new THREE.AmbientLight(0xffffff, 0.7656);
scene.add(ambient);
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(2.5, 3, -2);
scene.add(fill);
// 측면 노출 2차 캘리브레이션(2026-08-30) — breadlab.ts와 동일 값·근거(sky=검정이라 윗면 기여 0,
// 수직 벽만 순증). docs/VISUAL.md §1-3 참조.
const hemi = new THREE.HemisphereLight(0x000000, 0xffffff, 1.7);
scene.add(hemi);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader
  .loadAsync(params.get('glb') ? `/${params.get('glb')!.replace(/^\/+/, '')}` : `/${family.outDir}/${id}.glb`)
  .then((gltf) => {
    const root = gltf.scene;
    const style = params.get('style');
    if (style === 'toon' || (style !== 'pbr' && family === FAMILIES.bread)) {
      // 툰 조명 — SceneHost TOON_SHOWCASE_LIGHT와 같은 값
      key.position.set(-4, 2.5, -1);
      key.intensity = 2.8;
      ambient.intensity = 0.3;
      hemi.intensity = 0;
      // ?line = 512px 캔버스 기준 px (직교 높이 2.2)
      applyToon(root, params.get('line') ? (Number(params.get('line')) * 2.2) / 512 : TOON_LINE);
    } else {
      let env: THREE.Texture | null = null;
      applyBreadMaterials(root, () => (env ??= createRoomEnvironment(renderer)));
    }
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1.6 / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(s);
    root.position.copy(center).multiplyScalar(-s);
    const spin = new THREE.Group(); // 중심을 맞춘 뒤 돌린다 — 쇼케이스 턴테이블과 같은 축
    spin.rotation.y = azimuth;
    spin.add(root);
    scene.add(spin);
    renderer.render(scene, camera);
    window.__done = true;
  })
  .catch((e: unknown) => {
    window.__error = String(e);
    window.__done = true;
  });
