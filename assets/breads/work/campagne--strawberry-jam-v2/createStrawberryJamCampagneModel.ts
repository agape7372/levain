import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function buildLatheGeometry(profile: { points: [number, number][]; segments?: number }): THREE.LatheGeometry {
  const points = profile.points.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y));
  return new THREE.LatheGeometry(points, profile.segments ?? 24);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Strawberry Jam Campagne
// Sculpt build pass: structural-pass
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createStrawberryJamCampagneModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Strawberry Jam Campagne";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6], "note": "Fixed by scripts/breadlab.ts."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["crust"] = createSculptMaterial(
    "crust",
    {"id": "crust", "name": "Campagne crust (banded rings + starburst ears)", "type": "standard", "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color", "baseColor": "#A9713F", "color": "#A9713F", "albedo": {"dominant": "#A9713F", "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/campagne--strawberry-jam.json geometry (types.ts section 8 -- JSON import banned, hex is embedded in prose)."}, "colorVariation": {"palette": ["#A9713F"], "pattern": "quantized bands", "amplitude": 0.3, "heightCorrelation": 0.4}, "textureResolution": 512, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "All three logical materials (crust/crumb/jam) are baked into ONE shared 512px basecolor atlas canvas and rendered as a single mesh/material at build time (types.ts sections 1+9) -- crust occupies its own atlas region"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "dome silhouette / wedge cutaway", "carrier": "geometry"}, {"id": "meso", "frequency": 8.0, "amplitude": 0.05, "role": "banneton rings / starburst slash ears", "carrier": "geometry+texture"}, {"id": "micro", "frequency": 20.0, "amplitude": 0.026, "role": "jam channel / pore dimples / flecks", "carrier": "geometry+texture"}], "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "smooth vertex normals", "strength": 1.0, "scale": 1.0, "space": "object"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "whole dome crust surface, baked into the shared atlas", "amplitude": 0.026, "scale": 1.0, "silhouetteAffects": true}, "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"}, "localOverrides": [], "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading."], "notes": "whole dome crust surface, baked into the shared atlas. Basecolor canvas texture, no vertex color (scripts/breads/types.ts section 9)."},
    options
  );
  materialMap["crumb"] = createSculptMaterial(
    "crumb",
    {"id": "crumb", "name": "Cut-face crumb background", "type": "standard", "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color", "baseColor": "#F4EAD4", "color": "#F4EAD4", "albedo": {"dominant": "#F4EAD4", "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/campagne--strawberry-jam.json geometry (types.ts section 8 -- JSON import banned, hex is embedded in prose)."}, "colorVariation": {"palette": ["#F4EAD4"], "pattern": "quantized bands", "amplitude": 0.3, "heightCorrelation": 0.4}, "textureResolution": 512, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "All three logical materials (crust/crumb/jam) are baked into ONE shared 512px basecolor atlas canvas and rendered as a single mesh/material at build time (types.ts sections 1+9) -- crumb occupies the atlas's face region"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "dome silhouette / wedge cutaway", "carrier": "geometry"}, {"id": "meso", "frequency": 8.0, "amplitude": 0.05, "role": "banneton rings / starburst slash ears", "carrier": "geometry+texture"}, {"id": "micro", "frequency": 20.0, "amplitude": 0.026, "role": "jam channel / pore dimples / flecks", "carrier": "geometry+texture"}], "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "smooth vertex normals", "strength": 1.0, "scale": 1.0, "space": "object"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "cut-face background around the jam spiral, baked into the shared atlas", "amplitude": 0.026, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"}, "localOverrides": [], "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading."], "notes": "cut-face background around the jam spiral, baked into the shared atlas. Basecolor canvas texture, no vertex color (scripts/breads/types.ts section 9)."},
    options
  );
  materialMap["jam"] = createSculptMaterial(
    "jam",
    {"id": "jam", "name": "Strawberry jam spiral", "type": "standard", "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color", "baseColor": "#B23A4E", "color": "#B23A4E", "albedo": {"dominant": "#B23A4E", "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/campagne--strawberry-jam.json geometry (types.ts section 8 -- JSON import banned, hex is embedded in prose)."}, "colorVariation": {"palette": ["#B23A4E"], "pattern": "quantized bands", "amplitude": 0.3, "heightCorrelation": 0.4}, "textureResolution": 512, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "All three logical materials (crust/crumb/jam) are baked into ONE shared 512px basecolor atlas canvas and rendered as a single mesh/material at build time (types.ts sections 1+9) -- jam is painted within the crumb's atlas region, following the same distance field as the geometry channel"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "dome silhouette / wedge cutaway", "carrier": "geometry"}, {"id": "meso", "frequency": 8.0, "amplitude": 0.05, "role": "banneton rings / starburst slash ears", "carrier": "geometry+texture"}, {"id": "micro", "frequency": 20.0, "amplitude": 0.026, "role": "jam channel / pore dimples / flecks", "carrier": "geometry+texture"}], "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "smooth vertex normals", "strength": 1.0, "scale": 1.0, "space": "object"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "cut-face jam swirl band + halo + edge flecks, baked into the shared atlas", "amplitude": 0.026, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"}, "localOverrides": [{"id": "jam-edge-fleck-mask", "name": "Jam edge bleed/fleck mask", "maskSource": "geometry", "description": "A thin band just outside the jam-swirl signed-distance boundary gets scattered jam-colored flecks (jam-edge-flecks repetition system), reading as fruit bleeding slightly into the surrounding crumb rather than a hard painted edge.", "evidenceRefs": ["view-front"], "appliesTo": ["cut-face"]}], "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading."], "notes": "cut-face jam swirl band + halo + edge flecks, baked into the shared atlas. Basecolor canvas texture, no vertex color (scripts/breads/types.ts section 9)."},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Strawberry Jam Campagne Boule__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Strawberry Jam Campagne Boule", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "Transform-only assembly node carrying the dome body and cut faces; it emits no geometry of its own (campagne.ts precedent).", "geometryDescriptor": {"topologyIntent": "transform node only", "gridProfile": {"note": "No geometry of its own; children own the lathe profile and cut-face grids."}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"}, "parent": null, "attachment": null, "dimensions": {"width": 2.0, "height": 0.76, "depth": 2.0, "units": "relative", "confidence": 0.95}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}}, "material": "crust", "materialLayers": ["crust"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(244, 234, 212, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).", "zone": "assembly node, inherits from children", "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"]}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)", "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)", "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel", "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": "Assembly node; no surface of its own."}, "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": [], "fidelityTier": "blockout"};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 8, 4)
    : buildLatheGeometry({"points": [[0.3, -0.5], [0.15, 0.0], [0.3, 0.5]], "segments": 24});
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["crust"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Strawberry Jam Campagne Boule";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Strawberry Jam Campagne Boule", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "Transform-only assembly node carrying the dome body and cut faces; it emits no geometry of its own (campagne.ts precedent).", "geometryDescriptor": {"topologyIntent": "transform node only", "gridProfile": {"note": "No geometry of its own; children own the lathe profile and cut-face grids."}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"}, "parent": null, "attachment": null, "dimensions": {"width": 2.0, "height": 0.76, "depth": 2.0, "units": "relative", "confidence": 0.95}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}}, "material": "crust", "materialLayers": ["crust"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(244, 234, 212, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).", "zone": "assembly node, inherits from children", "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"]}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)", "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)", "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel", "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": "Assembly node; no surface of its own."}, "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": [], "fidelityTier": "blockout"};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);

  const endpoint_dome_1 = makeAttachmentEndpoint(null);
  const node_dome_1 = new THREE.Group();
  node_dome_1.name = "Campagne dome body (dense rings + starburst slash + wedge cutaway)__pivot";
  node_dome_1.scale.set(1, 1, 1);
  if (endpoint_dome_1) {
    node_dome_1.position.copy(endpoint_dome_1.start);
    node_dome_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dome_1.position.set(0.0, 0.0, 0.0);
    node_dome_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_dome_1.userData.sculptComponent = {"id": "dome", "name": "Campagne dome body (dense rings + starburst slash + wedge cutaway)", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass (dome shell) minus one angular sector -- built as a manually-ringed revolved shell (lib.ts buildRevolvedShell, LatheGeometry itself is banned per CRIB phi-seam rule), same family as base campagne.ts/domeShell.ts. Decision tree step 6: a sphere/hemisphere primitive cannot carry the flat base cap, ring-groove profile modulation, or the removed wedge sector.", "geometryDescriptor": {"topologyIntent": "low-poly prop, smooth-shaded after generation", "gridProfile": {"note": "Lathe profile computed procedurally from grooveCount/grooveZone/grooveDepth (scripts/breads/domeShell.ts buildDomeProfile) -- this spec records the authoring parameters, not the sampled point array.", "segments": 32, "grooveCount": 16, "grooveZone": [0.08, 0.97], "grooveHalfWidthT": 0.009, "grooveDepth": 0.022}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "banneton-rings", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.022, "notes": "16 concentric V-notch rings baked into the lathe profile, axially symmetric (no sector grid needed)."}, {"id": "starburst-slash", "type": "angular-falloff-displacement", "axis": [0, -1, 0], "amplitude": 0.1, "notes": "4-fold cosine angular falloff trench with a raised ear ridge on either side, running from the apex down to tFrac=SLASH_T_END -- taller/narrower than the base campagne's cross for a pointed-blade/starburst read."}, {"id": "wedge-cutaway", "type": "sector-removal", "axis": [0, 1, 0], "amplitude": 1.0, "notes": "6 of 32 sectors (67.5 degrees) deleted between the 45deg and 135deg slash arms, exposing the interior via two new cut-face components."}], "uvStrategy": "shared basecolor atlas canvas, top-down polar projection for the crust region (scripts/breads/lib.ts uvDome-style projection, computed before the wedge sectors are deleted so the projection center/radius are not skewed)", "normalStrategy": "smooth normals computed before splitting to non-indexed (2026-08-30 finish contract, order load-bearing)"}, "parent": "root", "attachment": null, "dimensions": {"width": 2.0, "height": 0.76, "depth": 2.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dome", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}}, "material": "crust", "materialLayers": ["crust"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(244, 234, 212, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).", "zone": "whole dome crust surface", "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"]}, "deformations": ["banneton-rings", "starburst-slash", "wedge-cutaway"], "joints": [], "seams": [{"id": "dome-cut-face-boundary", "kind": "material-boundary", "notes": "Wedge boundary columns are shared vertices with the two cut-face components -- no gap, no re-displacement after cutting."}], "localFeatures": [{"id": "dome-banneton-rings", "name": "Dense concentric banneton ring field", "kind": "ridge", "description": "16 closely-packed concentric V-notch rings across nearly the whole dome -- the single most identity-defining crust trait for this variant vs the base campagne's 8 grooves.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "banneton-rings"}, {"id": "dome-starburst-slash", "name": "Pointed 4-blade starburst slash", "kind": "ridge", "description": "4 sharp, tall, pointed ears meeting at one apex -- reads as a starburst/pinwheel rather than the base campagne's soft rounded cross.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "slash-ears"}, {"id": "dome-wedge-cutaway", "name": "Quarter-wedge cutaway", "kind": "hole", "description": "One sector removed down to the base, sitting squarely between two slash arms, exposing the jam-swirl cross-section on two new flat faces.", "evidenceRefs": ["view-top", "view-three-quarter", "view-front"], "confidence": 0.95, "repetitionSystemRef": "cut-face-pair"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.022, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)", "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)", "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel", "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": "assets/prompts/breads/campagne--strawberry-jam.json geometry.crust: 'spiral banneton ring markings pressed concentrically across the whole top surface (the defining feature)' + 'a cross-shaped slash cut into the center of the dome, opened into a raised burst ear along each cut line'."}, "evidenceRefs": ["view-top", "view-three-quarter", "view-front"], "details": ["dome-banneton-rings", "dome-starburst-slash", "dome-wedge-cutaway"], "fidelityTier": "surface-pass"};
  node_dome_1.userData.actionProfile = {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dome", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}};
  (nodes["root"] ?? root).add(node_dome_1);
  nodes["dome"] = node_dome_1;
  const mesh_dome_1Geometry = endpoint_dome_1
    ? new THREE.CylinderGeometry(endpoint_dome_1.endRadius, endpoint_dome_1.baseRadius, endpoint_dome_1.length, 8, 4)
    : buildLatheGeometry({"points": [[0.3, -0.5], [0.15, 0.0], [0.3, 0.5]], "segments": 24});
  if (!endpoint_dome_1) {
    mesh_dome_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_dome_1 = new THREE.Mesh(
    mesh_dome_1Geometry,
    materialMap["crust"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dome_1.name = "Campagne dome body (dense rings + starburst slash + wedge cutaway)";
  if (endpoint_dome_1) {
    mesh_dome_1.position.copy(endpoint_dome_1.midpoint);
    mesh_dome_1.quaternion.copy(endpoint_dome_1.quaternion);
  }
  mesh_dome_1.castShadow = options.castShadow ?? true;
  mesh_dome_1.receiveShadow = options.receiveShadow ?? true;
  mesh_dome_1.userData.sculptComponent = {"id": "dome", "name": "Campagne dome body (dense rings + starburst slash + wedge cutaway)", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass (dome shell) minus one angular sector -- built as a manually-ringed revolved shell (lib.ts buildRevolvedShell, LatheGeometry itself is banned per CRIB phi-seam rule), same family as base campagne.ts/domeShell.ts. Decision tree step 6: a sphere/hemisphere primitive cannot carry the flat base cap, ring-groove profile modulation, or the removed wedge sector.", "geometryDescriptor": {"topologyIntent": "low-poly prop, smooth-shaded after generation", "gridProfile": {"note": "Lathe profile computed procedurally from grooveCount/grooveZone/grooveDepth (scripts/breads/domeShell.ts buildDomeProfile) -- this spec records the authoring parameters, not the sampled point array.", "segments": 32, "grooveCount": 16, "grooveZone": [0.08, 0.97], "grooveHalfWidthT": 0.009, "grooveDepth": 0.022}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "banneton-rings", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.022, "notes": "16 concentric V-notch rings baked into the lathe profile, axially symmetric (no sector grid needed)."}, {"id": "starburst-slash", "type": "angular-falloff-displacement", "axis": [0, -1, 0], "amplitude": 0.1, "notes": "4-fold cosine angular falloff trench with a raised ear ridge on either side, running from the apex down to tFrac=SLASH_T_END -- taller/narrower than the base campagne's cross for a pointed-blade/starburst read."}, {"id": "wedge-cutaway", "type": "sector-removal", "axis": [0, 1, 0], "amplitude": 1.0, "notes": "6 of 32 sectors (67.5 degrees) deleted between the 45deg and 135deg slash arms, exposing the interior via two new cut-face components."}], "uvStrategy": "shared basecolor atlas canvas, top-down polar projection for the crust region (scripts/breads/lib.ts uvDome-style projection, computed before the wedge sectors are deleted so the projection center/radius are not skewed)", "normalStrategy": "smooth normals computed before splitting to non-indexed (2026-08-30 finish contract, order load-bearing)"}, "parent": "root", "attachment": null, "dimensions": {"width": 2.0, "height": 0.76, "depth": 2.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "body", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dome", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}}, "material": "crust", "materialLayers": ["crust"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(244, 234, 212, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).", "zone": "whole dome crust surface", "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"]}, "deformations": ["banneton-rings", "starburst-slash", "wedge-cutaway"], "joints": [], "seams": [{"id": "dome-cut-face-boundary", "kind": "material-boundary", "notes": "Wedge boundary columns are shared vertices with the two cut-face components -- no gap, no re-displacement after cutting."}], "localFeatures": [{"id": "dome-banneton-rings", "name": "Dense concentric banneton ring field", "kind": "ridge", "description": "16 closely-packed concentric V-notch rings across nearly the whole dome -- the single most identity-defining crust trait for this variant vs the base campagne's 8 grooves.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "banneton-rings"}, {"id": "dome-starburst-slash", "name": "Pointed 4-blade starburst slash", "kind": "ridge", "description": "4 sharp, tall, pointed ears meeting at one apex -- reads as a starburst/pinwheel rather than the base campagne's soft rounded cross.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "slash-ears"}, {"id": "dome-wedge-cutaway", "name": "Quarter-wedge cutaway", "kind": "hole", "description": "One sector removed down to the base, sitting squarely between two slash arms, exposing the jam-swirl cross-section on two new flat faces.", "evidenceRefs": ["view-top", "view-three-quarter", "view-front"], "confidence": 0.95, "repetitionSystemRef": "cut-face-pair"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.022, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)", "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)", "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel", "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": "assets/prompts/breads/campagne--strawberry-jam.json geometry.crust: 'spiral banneton ring markings pressed concentrically across the whole top surface (the defining feature)' + 'a cross-shaped slash cut into the center of the dome, opened into a raised burst ear along each cut line'."}, "evidenceRefs": ["view-top", "view-three-quarter", "view-front"], "details": ["dome-banneton-rings", "dome-starburst-slash", "dome-wedge-cutaway"], "fidelityTier": "surface-pass"};
  node_dome_1.add(mesh_dome_1);
  meshes["dome"] = mesh_dome_1;
  colliders["dome"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."};
  destructionGroups["dome"] ??= [];
  destructionGroups["dome"].push(node_dome_1);

  const endpoint_cut_face_2 = makeAttachmentEndpoint(null);
  const node_cut_face_2 = new THREE.Group();
  node_cut_face_2.name = "Wedge cut face (jam-swirl cross-section, repeated archetype)__pivot";
  node_cut_face_2.scale.set(1, 1, 1);
  if (endpoint_cut_face_2) {
    node_cut_face_2.position.copy(endpoint_cut_face_2.start);
    node_cut_face_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_cut_face_2.position.set(0.0, 0.0, 0.0);
    node_cut_face_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_cut_face_2.userData.sculptComponent = {"id": "cut-face", "name": "Wedge cut face (jam-swirl cross-section, repeated archetype)", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A flat radial fan slice sharing the parent dome's revolved profile at one fixed phi value (not a solid of revolution itself) -- same primitive family as the pancake.ts precedent (disk-top-face uses primitive 'lathe' for a flat disk face). Carries real 3D relief (jam channel + pore dimples + crumb bump), not a flat billboard, so 'plane-card' would misrepresent it.", "geometryDescriptor": {"topologyIntent": "low-poly prop, smooth-shaded after generation, custom radial x vertical grid (not the parent's ring/sector grid)", "gridProfile": {"note": "22 radial x 26 vertical uniform grid, positioned analytically from the dome's own profile function (not copied ring geometry) so the interior grid resolution is independent of the dome's grooved-and-clumped ring spacing.", "radial": 22, "rows": 26}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "jam-swirl-channel", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.026, "notes": "Recessed channel (not a painted-on flat band) following a 3.7-turn spiral with wobbling radius/thickness -- CRIB lesson from the rejected build: a flat colored band alone reads as a 'sticker'; a physically channeled groove whose color and relief read the SAME distance field does not."}, {"id": "crumb-pore-dimples", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.014, "notes": "18 small elliptical pit dimples sharing their positions with the texture's dark pore specks, so the shading dip lands on the painted pore, not beside it."}, {"id": "crumb-low-freq-bump", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.007, "notes": "Very low-frequency (wavelength >> jam-band width) sine bump so the crumb face is not a dead flat plane, without disturbing the jam channel's own relief."}], "uvStrategy": "parametric (rho-fraction, height-fraction) atlas coordinates, computed BEFORE relief displacement so the vertex-displacement channels never drift the painted texture off its own relief", "normalStrategy": "smooth normals computed before splitting to non-indexed"}, "parent": "dome", "attachment": null, "dimensions": {"width": 2.0, "height": 0.76, "depth": 0.01, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cut-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}}, "material": "jam", "materialLayers": ["crust", "crumb", "jam"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(244, 234, 212, 1.0)", "secondaryAlbedo": "rgba(178, 58, 78, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).", "zone": "cut-face crumb background + jam spiral band + outer crust rim", "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"]}, "deformations": ["jam-swirl-channel", "crumb-pore-dimples", "crumb-low-freq-bump"], "joints": [], "seams": [{"id": "cut-face-outer-rim", "kind": "material-boundary", "notes": "Outer boundary column is shared exactly with the dome's own wedge-boundary ring vertices (post-jitter world coordinates), so there is zero seam gap."}], "localFeatures": [{"id": "cut-face-jam-swirl", "name": "Strawberry jam spiral (color+relief shared field)", "kind": "hole", "description": "~3.7-turn spiral channel through the pale crumb -- color and recess depth are both driven by the SAME signed-distance-to-band function so the painted band can never drift off the carved channel.", "evidenceRefs": ["view-front", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": null}, {"id": "cut-face-pores", "name": "Crumb pore dimples", "kind": "hole", "description": "18 small dark pore dimples scattered through the crumb, some overlapping the jam band edge to make the boundary read as baked-in rather than a clean painted edge.", "evidenceRefs": ["view-three-quarter"], "confidence": 0.75, "repetitionSystemRef": "crumb-pore-dimples"}, {"id": "cut-face-flecks", "name": "Jam edge flecks", "kind": "ridge", "description": "20 small jam-colored flecks scattered just outside the main band, reading as jam bleed into the surrounding crumb.", "evidenceRefs": ["view-front"], "confidence": 0.6, "repetitionSystemRef": "jam-edge-flecks"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.026, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)", "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)", "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel", "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": "assets/prompts/breads/campagne--strawberry-jam.json geometry.crust: 'on the exposed cross-section, a deep red strawberry jam swirl #B23A4E spirals through the pale open crumb'."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["cut-face-jam-swirl", "cut-face-pores", "cut-face-flecks"], "fidelityTier": "surface-pass"};
  node_cut_face_2.userData.actionProfile = {"animationRole": "surface", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cut-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}};
  (nodes["dome"] ?? root).add(node_cut_face_2);
  nodes["cut-face"] = node_cut_face_2;
  const mesh_cut_face_2Geometry = endpoint_cut_face_2
    ? new THREE.CylinderGeometry(endpoint_cut_face_2.endRadius, endpoint_cut_face_2.baseRadius, endpoint_cut_face_2.length, 8, 4)
    : buildLatheGeometry({"points": [[0.3, -0.5], [0.15, 0.0], [0.3, 0.5]], "segments": 24});
  if (!endpoint_cut_face_2) {
    mesh_cut_face_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_cut_face_2 = new THREE.Mesh(
    mesh_cut_face_2Geometry,
    materialMap["jam"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cut_face_2.name = "Wedge cut face (jam-swirl cross-section, repeated archetype)";
  if (endpoint_cut_face_2) {
    mesh_cut_face_2.position.copy(endpoint_cut_face_2.midpoint);
    mesh_cut_face_2.quaternion.copy(endpoint_cut_face_2.quaternion);
  }
  mesh_cut_face_2.castShadow = options.castShadow ?? true;
  mesh_cut_face_2.receiveShadow = options.receiveShadow ?? true;
  mesh_cut_face_2.userData.sculptComponent = {"id": "cut-face", "name": "Wedge cut face (jam-swirl cross-section, repeated archetype)", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A flat radial fan slice sharing the parent dome's revolved profile at one fixed phi value (not a solid of revolution itself) -- same primitive family as the pancake.ts precedent (disk-top-face uses primitive 'lathe' for a flat disk face). Carries real 3D relief (jam channel + pore dimples + crumb bump), not a flat billboard, so 'plane-card' would misrepresent it.", "geometryDescriptor": {"topologyIntent": "low-poly prop, smooth-shaded after generation, custom radial x vertical grid (not the parent's ring/sector grid)", "gridProfile": {"note": "22 radial x 26 vertical uniform grid, positioned analytically from the dome's own profile function (not copied ring geometry) so the interior grid resolution is independent of the dome's grooved-and-clumped ring spacing.", "radial": 22, "rows": 26}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "jam-swirl-channel", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.026, "notes": "Recessed channel (not a painted-on flat band) following a 3.7-turn spiral with wobbling radius/thickness -- CRIB lesson from the rejected build: a flat colored band alone reads as a 'sticker'; a physically channeled groove whose color and relief read the SAME distance field does not."}, {"id": "crumb-pore-dimples", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.014, "notes": "18 small elliptical pit dimples sharing their positions with the texture's dark pore specks, so the shading dip lands on the painted pore, not beside it."}, {"id": "crumb-low-freq-bump", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.007, "notes": "Very low-frequency (wavelength >> jam-band width) sine bump so the crumb face is not a dead flat plane, without disturbing the jam channel's own relief."}], "uvStrategy": "parametric (rho-fraction, height-fraction) atlas coordinates, computed BEFORE relief displacement so the vertex-displacement channels never drift the painted texture off its own relief", "normalStrategy": "smooth normals computed before splitting to non-indexed"}, "parent": "dome", "attachment": null, "dimensions": {"width": 2.0, "height": 0.76, "depth": 0.01, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "cut-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"}}, "material": "jam", "materialLayers": ["crust", "crumb", "jam"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(244, 234, 212, 1.0)", "secondaryAlbedo": "rgba(178, 58, 78, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).", "zone": "cut-face crumb background + jam spiral band + outer crust rim", "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"]}, "deformations": ["jam-swirl-channel", "crumb-pore-dimples", "crumb-low-freq-bump"], "joints": [], "seams": [{"id": "cut-face-outer-rim", "kind": "material-boundary", "notes": "Outer boundary column is shared exactly with the dome's own wedge-boundary ring vertices (post-jitter world coordinates), so there is zero seam gap."}], "localFeatures": [{"id": "cut-face-jam-swirl", "name": "Strawberry jam spiral (color+relief shared field)", "kind": "hole", "description": "~3.7-turn spiral channel through the pale crumb -- color and recess depth are both driven by the SAME signed-distance-to-band function so the painted band can never drift off the carved channel.", "evidenceRefs": ["view-front", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": null}, {"id": "cut-face-pores", "name": "Crumb pore dimples", "kind": "hole", "description": "18 small dark pore dimples scattered through the crumb, some overlapping the jam band edge to make the boundary read as baked-in rather than a clean painted edge.", "evidenceRefs": ["view-three-quarter"], "confidence": 0.75, "repetitionSystemRef": "crumb-pore-dimples"}, {"id": "cut-face-flecks", "name": "Jam edge flecks", "kind": "ridge", "description": "20 small jam-colored flecks scattered just outside the main band, reading as jam bleed into the surrounding crumb.", "evidenceRefs": ["view-front"], "confidence": 0.6, "repetitionSystemRef": "jam-edge-flecks"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.026, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)", "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)", "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel", "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": "assets/prompts/breads/campagne--strawberry-jam.json geometry.crust: 'on the exposed cross-section, a deep red strawberry jam swirl #B23A4E spirals through the pale open crumb'."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["cut-face-jam-swirl", "cut-face-pores", "cut-face-flecks"], "fidelityTier": "surface-pass"};
  node_cut_face_2.add(mesh_cut_face_2);
  meshes["cut-face"] = mesh_cut_face_2;
  colliders["cut-face"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."};
  destructionGroups["cut-face"] ??= [];
  destructionGroups["cut-face"].push(node_cut_face_2);
  // repetition system "banneton-rings" describes 1 parts that are already built individually; not instanced.
  // repetition system "slash-ears" describes 1 parts that are already built individually; not instanced.
  // repetition system "cut-face-pair" describes 1 parts that are already built individually; not instanced.
  // repetition system "crumb-pore-dimples" describes 1 parts that are already built individually; not instanced.
  // repetition system "jam-edge-flecks" describes 1 parts that are already built individually; not instanced.

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "runtime-budget", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": false, "normalOrBumpRequired": false, "localOverridesRequired": true, "minimumTextureResolution": 0, "preferredTextureResolution": 512, "independentMapChannels": [], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.0, "stopOnLowConfidence": false, "script": "not run", "acceptedLimitation": "Runtime keeps only map+color, PBR maps banned (types.ts section 2). All relief lives in geometry; crust/crumb/jam are baked into one shared basecolor atlas."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Fixed by scripts/breadlab.ts / scripts/thumbsHarness.ts (recalibrated 2026-08-30, docs/VISUAL.md section 1-3 -- do not add gain/parity correction unless a fresh measured 3-tuple justifies it).", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render", "re-adding a blanket channel-gain correction across the whole surface (kills contrast on features that need it, per CRIB)"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createStrawberryJamCampagneLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Strawberry Jam Campagne look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "harness-key", "role": "key light", "observation": "Neutral white directional key at (-2, 6, 2), no exposure control, no tone mapping.", "usage": "Fixed by the harness.", "exposure": "no exposure control, no tone mapping."}, {"id": "harness-ambient", "role": "ambient fill", "observation": "Neutral white-balanced ambient plus a black-sky hemisphere light for vertical-surface fill (recalibrated 2026-08-30).", "usage": "Fixed by the harness.", "contactShadow": "none - no shadow map or ground plane, so no contact shadow or ground shadow is rendered."}, {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill, low intensity.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."}];
  lights.userData.lookDevTargets = {"qualityPriority": "runtime-budget", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": false, "normalOrBumpRequired": false, "localOverridesRequired": true, "minimumTextureResolution": 0, "preferredTextureResolution": 512, "independentMapChannels": [], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.0, "stopOnLowConfidence": false, "script": "not run", "acceptedLimitation": "Runtime keeps only map+color, PBR maps banned (types.ts section 2). All relief lives in geometry; crust/crumb/jam are baked into one shared basecolor atlas."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Fixed by scripts/breadlab.ts / scripts/thumbsHarness.ts (recalibrated 2026-08-30, docs/VISUAL.md section 1-3 -- do not add gain/parity correction unless a fresh measured 3-tuple justifies it).", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render", "re-adding a blanket channel-gain correction across the whole surface (kills contrast on features that need it, per CRIB)"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createStrawberryJamCampagneEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameStrawberryJamCampagneCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createStrawberryJamCampagnePresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureStrawberryJamCampagneRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createStrawberryJamCampagneInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
