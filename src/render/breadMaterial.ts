// 빵·재료 GLB 재질 정책 — 쇼케이스(breadShowcase.ts)와 썸네일 하네스(scripts/thumbsHarness.ts)가 공유.
//
// 두 갈래 (docs/VISUAL.md §8):
// - PBR 자산: GLB 재질에 normalMap 또는 roughnessMap이 실려 있다(2026-11 Blender 파이프라인,
//   docs/BREADS.md). MeshStandardMaterial을 그대로 쓰고 방 환경맵을 물린다. 시럽·과일·초콜릿의
//   윤기는 여기서만 난다 — Lambert는 정반사가 0이라 소스가 고무처럼 보였다(2026-11-14 딸기 팬케이크).
//   환경맵은 반사만 싣는다: IBL 확산을 셰이더에서 빼서 확산은 옛 자산과 같은 램버트 캘리브레이션이다
//   (넣으면 확산이 통째로 밝아져 껍질 갈색·속살 크림색이 허옇게 바랬다 — 2026-11-14 실측).
// - 옛 자산(basecolor만): MeshLambertMaterial로 강제 교체. 2026-08-30 파리티 캘리브레이션 그대로.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** 환경맵 반사 세기 — 노출은 직광(SHOWCASE_LIGHT)이 맡는다. 실측 조정값 */
const ENV_INTENSITY = 0.5;

// three r185 lights_fragment_maps 의 IBL 확산 한 줄을 지운 판 — 못 찾으면(three 갱신) 원본 그대로 + 경고
const IBL_DIFFUSE = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
const SPECULAR_ONLY_MAPS = THREE.ShaderChunk.lights_fragment_maps.replace(IBL_DIFFUSE, '');
if (SPECULAR_ONLY_MAPS === THREE.ShaderChunk.lights_fragment_maps) {
  console.warn('[breadMaterial] IBL 확산 줄을 못 찾았다 — three 갱신 뒤 lights_fragment_maps 확인');
}

function specularOnlyEnv(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', SPECULAR_ONLY_MAPS);
}

/** 노멀·거칠기 맵이 있으면 PBR 자산 */
function isPbrMaterial(m: THREE.Material): boolean {
  const s = m as THREE.MeshStandardMaterial;
  return Boolean(s.normalMap || s.roughnessMap);
}

/**
 * 로드 직후 1회 — 재질을 정책대로 바꾼다. getEnv는 PBR 재질을 만났을 때만 부른다
 * (옛 자산만 보는 동안엔 PMREM 셰이더를 컴파일하지 않는다).
 */
export function applyBreadMaterials(root: THREE.Object3D, getEnv: () => THREE.Texture): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (isPbrMaterial(m)) {
      // 금속성 0 고정 — glTF는 거칠기·금속성을 한 장에 싣는데 금속성 채널은 늘 0이라 샘플링만 아낀다
      m.metalness = 0;
      m.metalnessMap = null;
      m.envMap = getEnv();
      m.envMapIntensity = ENV_INTENSITY;
      m.onBeforeCompile = specularOnlyEnv;
      m.customProgramCacheKey = () => 'bread-specular-env';
      return;
    }
    o.material = new THREE.MeshLambertMaterial({ map: m.map ?? null, color: m.color ?? new THREE.Color(0xffffff) });
    m.dispose();
  });
}

/** 재질과 그 텍스처를 버린다 — 공유 환경맵은 남긴다(렌더러 수명) */
export function disposeBreadMaterial(m: THREE.Material): void {
  const s = m as THREE.MeshStandardMaterial;
  s.map?.dispose();
  s.normalMap?.dispose();
  s.roughnessMap?.dispose();
  m.dispose();
}

/** 방 환경맵(PMREM) — 텍스처 파일 0. 렌더러당 1장 만들어 재사용한다 */
export function createRoomEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return env;
}
