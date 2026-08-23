// 썸네일 하니스 — ?id=<recipeId>의 GLB를 고정 카메라·조명으로 1프레임 렌더.
// 완료 시 window.__done = true (puppeteer가 대기 후 캔버스 캡처).
// 앱 아이콘용은 ?icon=1 — 병+도우 히어로 구도 대신 GLB 단독 구도만 v1 지원.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

declare global {
  interface Window {
    __done?: boolean;
    __error?: string;
  }
}

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'campagne';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(512, 512, false);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 30);
camera.position.set(-1.6, 2.2, 2.6); // 3/4 top-front — 프롬프트 카메라 지문과 일치
camera.lookAt(0, 0, 0);

const key = new THREE.DirectionalLight(0xffe2b0, 1.4);
key.position.set(-2, 6, 2);
scene.add(key);
scene.add(new THREE.AmbientLight(0xfff0dc, 0.75));
const fill = new THREE.DirectionalLight(0xdce8ff, 0.2);
fill.position.set(2.5, 3, -2);
scene.add(fill);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader
  .loadAsync(`/breads/${id}.glb`)
  .then((gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        o.material = new THREE.MeshLambertMaterial({ map: m.map ?? null, color: m.color ?? new THREE.Color(0xffffff) });
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1.6 / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(s);
    root.position.copy(center).multiplyScalar(-s);
    scene.add(root);
    renderer.render(scene, camera);
    window.__done = true;
  })
  .catch((e: unknown) => {
    window.__error = String(e);
    window.__done = true;
  });
