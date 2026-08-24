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

// Generated from ObjectSculptSpec target: Pancake Stack
// Sculpt build pass: surface-pass
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createPancakeStackModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Pancake Stack";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6], "note": "Not solved and deliberately not matched to the reference. The review camera is fixed by the consumer harness: an orthographic camera at (-1.6, 2.2, 2.6) looking at the origin (scripts/breadlab.ts applyView). Matching the reference's perspective camera instead would review a framing the product never renders."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["crust-top"] = createSculptMaterial(
    "crust-top",
    {"id": "crust-top", "name": "Griddle-face crust", "type": "standard", "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color", "baseColor": "#C68958", "color": "#C68958", "albedo": {"dominant": "#C68958", "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/pancake.json geometry.crust, the curated prompt that generated these reference images. Deliberately NOT sampled from reference pixels, which carry the generator's baked key light; sampling would import that shading into albedo."}, "colorVariation": {"palette": ["#C68958"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureResolution": 64, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture is emitted. UVs exist only to satisfy the merge step's attribute-consistency requirement (scripts/breads/types.ts section 4)."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "revolved profile: equator bulge and top-face crown", "carrier": "geometry"}, {"id": "meso", "frequency": 5.0, "amplitude": 0.03, "role": "per-sector outline wobble and rim-height noise", "carrier": "geometry"}, {"id": "micro", "frequency": 22.0, "amplitude": 0.031, "role": "pore pits and faceting; on the rim, faceting alone", "carrier": "geometry"}], "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "top face of every disk", "amplitude": 0.031, "scale": 1.0, "silhouetteAffects": true}, "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel: the runtime Lambert material has none. Cavity darkening comes from the pit walls turning away from the key light."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"}, "localOverrides": [{"id": "pore-cavity-shading", "name": "Pore cavity shading", "maskSource": "geometry", "description": "Pit walls tilt away from the key light and darken on their own; no separate mask, map or albedo change is used, because the runtime cannot read one.", "evidenceRefs": ["view-top"], "appliesTo": ["disk-top-face", "disk-middle-face", "disk-bottom-face"]}], "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial with roughness 1, metalness 0.", "Never set vertexColors: the runtime rebuilds every material as MeshLambertMaterial({map, color}), so vertex colors are silently discarded (scripts/breads/types.ts section 2).", "Never set flatShading: that flag is not inherited by the runtime swap either. Faceting must be baked as split vertices."], "notes": "top face of every disk. Two solid colors are enough for the whole object, so no texture is emitted at all (scripts/breads/types.ts section 9)."},
    options
  );
  materialMap["crust-rim"] = createSculptMaterial(
    "crust-rim",
    {"id": "crust-rim", "name": "Rim and underside crust", "type": "standard", "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color", "baseColor": "#A9713F", "color": "#A9713F", "albedo": {"dominant": "#A9713F", "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/pancake.json geometry.crust, the curated prompt that generated these reference images. Deliberately NOT sampled from reference pixels, which carry the generator's baked key light; sampling would import that shading into albedo."}, "colorVariation": {"palette": ["#A9713F"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureResolution": 64, "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture is emitted. UVs exist only to satisfy the merge step's attribute-consistency requirement (scripts/breads/types.ts section 4)."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "revolved profile: equator bulge and top-face crown", "carrier": "geometry"}, {"id": "meso", "frequency": 5.0, "amplitude": 0.03, "role": "per-sector outline wobble and rim-height noise", "carrier": "geometry"}, {"id": "micro", "frequency": 22.0, "amplitude": 0.031, "role": "pore pits and faceting; on the rim, faceting alone", "carrier": "geometry"}], "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "rim wall and underside of every disk", "amplitude": 0.031, "scale": 1.0, "silhouetteAffects": true}, "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel: the runtime Lambert material has none. Cavity darkening comes from the pit walls turning away from the key light."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"}, "localOverrides": [{"id": "two-tone-boundary", "name": "Two-tone crust boundary", "maskSource": "geometry", "description": "The boundary is the shared perimeter ring at radiusFraction 0.93, a hard geometric edge between two separate meshes - not a texture boundary and not a vertex-color ramp.", "evidenceRefs": ["view-three-quarter", "view-front"], "appliesTo": ["disk-top", "disk-middle", "disk-bottom"]}], "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial with roughness 1, metalness 0.", "Never set vertexColors: the runtime rebuilds every material as MeshLambertMaterial({map, color}), so vertex colors are silently discarded (scripts/breads/types.ts section 2).", "Never set flatShading: that flag is not inherited by the runtime swap either. Faceting must be baked as split vertices."], "notes": "rim wall and underside of every disk. Two solid colors are enough for the whole object, so no texture is emitted at all (scripts/breads/types.ts section 9)."},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Pancake Stack__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Pancake Stack", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "Transform-only assembly node carrying the three disk bodies; it emits no geometry of its own. Its primitive mirrors its children's so no other primitive family is implied.", "geometryDescriptor": {"topologyIntent": "transform node only", "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"}, "parent": null, "attachment": null, "dimensions": {"width": 2.0, "height": 0.642, "depth": 2.0, "units": "relative", "confidence": 0.95}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "assembly node, inherits from children", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stack-offset", "name": "Per-layer stack offset", "kind": "assembly-placement", "description": "Each disk sits 0.210 above the one below (a 0.012 overlap against a 0.222 disk height) with its own XZ offset and yaw, so the three rim bands read separately and the wobble phases differ.", "evidenceRefs": ["view-front", "view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "n/a", "displacementPattern": "n/a", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Assembly node; no surface of its own."}, "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": ["stack-offset"], "fidelityTier": "blockout"};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 8, 4)
    : buildLatheGeometry({"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["crust-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Pancake Stack";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Pancake Stack", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "Transform-only assembly node carrying the three disk bodies; it emits no geometry of its own. Its primitive mirrors its children's so no other primitive family is implied.", "geometryDescriptor": {"topologyIntent": "transform node only", "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"}, "parent": null, "attachment": null, "dimensions": {"width": 2.0, "height": 0.642, "depth": 2.0, "units": "relative", "confidence": 0.95}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "assembly node, inherits from children", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stack-offset", "name": "Per-layer stack offset", "kind": "assembly-placement", "description": "Each disk sits 0.210 above the one below (a 0.012 overlap against a 0.222 disk height) with its own XZ offset and yaw, so the three rim bands read separately and the wobble phases differ.", "evidenceRefs": ["view-front", "view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "n/a", "displacementPattern": "n/a", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Assembly node; no surface of its own."}, "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": ["stack-offset"], "fidelityTier": "blockout"};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);

  const endpoint_disk_bottom_1 = makeAttachmentEndpoint(null);
  const node_disk_bottom_1 = new THREE.Group();
  node_disk_bottom_1.name = "Pancake disk (bottom) rim wall and underside__pivot";
  node_disk_bottom_1.scale.set(1, 1, 1);
  if (endpoint_disk_bottom_1) {
    node_disk_bottom_1.position.copy(endpoint_disk_bottom_1.start);
    node_disk_bottom_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_disk_bottom_1.position.set(0.0, 0.0, 0.0);
    node_disk_bottom_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_disk_bottom_1.userData.sculptComponent = {"id": "disk-bottom", "name": "Pancake disk (bottom) rim wall and underside", "level": "macro", "role": "body", "importance": 0.85, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass with no internal seams or panel breaks: the underside, the lower rim, the equator bulge and the upper rim are a single swept profile. Decision tree step 6. A cylinder primitive is structurally wrong here because the widest point sits at mid height, not at the top and bottom edges.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.0, 0.01998], [0.8118, 0.0], [0.96525, 0.05772], [0.99, 0.11544], [0.97515, 0.16428], [0.9207, 0.1998]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Per-sector radius multiplier 1 + 0.028*sin(3t+phi) + 0.018*sin(7t+psi) + rng noise up to 0.012, plus up to 0.015 disk-height noise on the rim ring. Applied identically to the body and face profiles so the shared perimeter ring stays welded."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.98, "height": 0.222, "depth": 1.98, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.0, 0.0, 0.0], "rotation": [0, 0.0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-bottom", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "rim wall and underside", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble"], "joints": [], "seams": [{"id": "disk-bottom-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at radiusFraction 0.93, heightFraction 0.90. Body and face lathe the same ring, so the two-tone boundary is watertight and hard-edged."}], "localFeatures": [{"id": "disk-bottom-equator-bulge", "name": "Rim equator bulge", "kind": "profile-curvature", "description": "Widest radius sits at heightFraction 0.52, with the top-face perimeter inset to radiusFraction 0.93, so the rim reads as a convex band in profile.", "evidenceRefs": ["view-front"], "confidence": 0.9}, {"id": "disk-bottom-outline-wobble", "name": "Hand-poured outline wobble", "kind": "silhouette-modulation", "description": "Radius varies about +/-3% per sector with two low-frequency lobes plus seeded noise; each disk uses a different yaw so the three wobble phases differ.", "evidenceRefs": ["view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "faceted planar shading from split vertices", "displacementPattern": "profile-driven only; the rim carries no pits", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Rim and underside share one flat albedo. The runtime replaces the material with MeshLambertMaterial keeping only map and color, so all relief here is geometric."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-bottom-equator-bulge", "disk-bottom-outline-wobble"], "fidelityTier": "form-refinement"};
  node_disk_bottom_1.userData.actionProfile = {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-bottom", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["root"] ?? root).add(node_disk_bottom_1);
  nodes["disk-bottom"] = node_disk_bottom_1;
  const mesh_disk_bottom_1Geometry = endpoint_disk_bottom_1
    ? new THREE.CylinderGeometry(endpoint_disk_bottom_1.endRadius, endpoint_disk_bottom_1.baseRadius, endpoint_disk_bottom_1.length, 8, 4)
    : buildLatheGeometry({"points": [[0.0, 0.01998], [0.8118, 0.0], [0.96525, 0.05772], [0.99, 0.11544], [0.97515, 0.16428], [0.9207, 0.1998]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_disk_bottom_1) {
    mesh_disk_bottom_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_disk_bottom_1 = new THREE.Mesh(
    mesh_disk_bottom_1Geometry,
    materialMap["crust-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_disk_bottom_1.name = "Pancake disk (bottom) rim wall and underside";
  if (endpoint_disk_bottom_1) {
    mesh_disk_bottom_1.position.copy(endpoint_disk_bottom_1.midpoint);
    mesh_disk_bottom_1.quaternion.copy(endpoint_disk_bottom_1.quaternion);
  }
  mesh_disk_bottom_1.castShadow = options.castShadow ?? true;
  mesh_disk_bottom_1.receiveShadow = options.receiveShadow ?? true;
  mesh_disk_bottom_1.userData.sculptComponent = {"id": "disk-bottom", "name": "Pancake disk (bottom) rim wall and underside", "level": "macro", "role": "body", "importance": 0.85, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass with no internal seams or panel breaks: the underside, the lower rim, the equator bulge and the upper rim are a single swept profile. Decision tree step 6. A cylinder primitive is structurally wrong here because the widest point sits at mid height, not at the top and bottom edges.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.0, 0.01998], [0.8118, 0.0], [0.96525, 0.05772], [0.99, 0.11544], [0.97515, 0.16428], [0.9207, 0.1998]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Per-sector radius multiplier 1 + 0.028*sin(3t+phi) + 0.018*sin(7t+psi) + rng noise up to 0.012, plus up to 0.015 disk-height noise on the rim ring. Applied identically to the body and face profiles so the shared perimeter ring stays welded."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.98, "height": 0.222, "depth": 1.98, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.0, 0.0, 0.0], "rotation": [0, 0.0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-bottom", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "rim wall and underside", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble"], "joints": [], "seams": [{"id": "disk-bottom-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at radiusFraction 0.93, heightFraction 0.90. Body and face lathe the same ring, so the two-tone boundary is watertight and hard-edged."}], "localFeatures": [{"id": "disk-bottom-equator-bulge", "name": "Rim equator bulge", "kind": "profile-curvature", "description": "Widest radius sits at heightFraction 0.52, with the top-face perimeter inset to radiusFraction 0.93, so the rim reads as a convex band in profile.", "evidenceRefs": ["view-front"], "confidence": 0.9}, {"id": "disk-bottom-outline-wobble", "name": "Hand-poured outline wobble", "kind": "silhouette-modulation", "description": "Radius varies about +/-3% per sector with two low-frequency lobes plus seeded noise; each disk uses a different yaw so the three wobble phases differ.", "evidenceRefs": ["view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "faceted planar shading from split vertices", "displacementPattern": "profile-driven only; the rim carries no pits", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Rim and underside share one flat albedo. The runtime replaces the material with MeshLambertMaterial keeping only map and color, so all relief here is geometric."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-bottom-equator-bulge", "disk-bottom-outline-wobble"], "fidelityTier": "form-refinement"};
  node_disk_bottom_1.add(mesh_disk_bottom_1);
  meshes["disk-bottom"] = mesh_disk_bottom_1;
  colliders["disk-bottom"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["disk-bottom"] ??= [];
  destructionGroups["disk-bottom"].push(node_disk_bottom_1);

  const endpoint_disk_bottom_face_2 = makeAttachmentEndpoint(null);
  const node_disk_bottom_face_2 = new THREE.Group();
  node_disk_bottom_face_2.name = "Pancake disk (bottom) griddle face__pivot";
  node_disk_bottom_face_2.scale.set(1, 1, 1);
  if (endpoint_disk_bottom_face_2) {
    node_disk_bottom_face_2.position.copy(endpoint_disk_bottom_face_2.start);
    node_disk_bottom_face_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_disk_bottom_face_2.position.set(0.0, 0.0, 0.0);
    node_disk_bottom_face_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_disk_bottom_face_2.userData.sculptComponent = {"id": "disk-bottom-face", "name": "Pancake disk (bottom) griddle face", "level": "meso", "role": "surface", "importance": 0.6, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single smoothly varying revolved cap - crown at the axis, sag at the perimeter - with the pore pits displaced into it rather than cut as separate solids. Decision tree step 6. It is not conforming-shell because it is the disk's own top surface, not a skin over another form.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.9207, 0.1998], [0.792, 0.21046], [0.6633, 0.21734], [0.5247, 0.22111], [0.3762, 0.22289], [0.198, 0.224], [0.0, 0.22466]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Identical modulation to the parent body so the shared perimeter ring stays welded."}, {"id": "pore-dimples", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.062, "notes": "Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement"}, "parent": "disk-bottom", "attachment": null, "dimensions": {"width": 1.8414, "height": 0.02486, "depth": 1.8414, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-bottom-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-top", "materialLayers": ["crust-top"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(198, 137, 88, 1.0)", "secondaryAlbedo": "rgba(169, 113, 63, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "griddle face", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble", "pore-dimples"], "joints": [], "seams": [{"id": "disk-bottom-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}], "localFeatures": [{"id": "disk-bottom-face-pore-dimples", "name": "Pore dimple field", "kind": "recessed-detail-scatter", "description": "8 concave pits in four size classes (crater d=0.062, medium d=0.046, small d=0.030, tiny d=0.018 in disk-radius units), scattered over radiusFraction 0.2-0.8. Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "pore-scatter"}, {"id": "disk-bottom-face-edge-sag", "name": "Top-face edge sag", "kind": "profile-curvature", "description": "Face crowns to heightFraction 1.012 at the axis and drops to 0.90 at the perimeter ring, a 0.024 crown over one disk height.", "evidenceRefs": ["view-front"], "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.031, "normalPattern": "faceted planar shading from split vertices; each pit contributes its own hard-edged cone", "displacementPattern": "pore pits displaced into the revolved cap", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "assets/prompts/breads/pancake.json notes_ko: without the pits the object reads as a smooth plastic disk, so this field is identity-critical rather than decorative."}, "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-bottom-face-pore-dimples", "disk-bottom-face-edge-sag"], "fidelityTier": "surface-pass"};
  node_disk_bottom_face_2.userData.actionProfile = {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-bottom-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["disk-bottom"] ?? root).add(node_disk_bottom_face_2);
  nodes["disk-bottom-face"] = node_disk_bottom_face_2;
  const mesh_disk_bottom_face_2Geometry = endpoint_disk_bottom_face_2
    ? new THREE.CylinderGeometry(endpoint_disk_bottom_face_2.endRadius, endpoint_disk_bottom_face_2.baseRadius, endpoint_disk_bottom_face_2.length, 8, 4)
    : buildLatheGeometry({"points": [[0.9207, 0.1998], [0.792, 0.21046], [0.6633, 0.21734], [0.5247, 0.22111], [0.3762, 0.22289], [0.198, 0.224], [0.0, 0.22466]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_disk_bottom_face_2) {
    mesh_disk_bottom_face_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_disk_bottom_face_2 = new THREE.Mesh(
    mesh_disk_bottom_face_2Geometry,
    materialMap["crust-top"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_disk_bottom_face_2.name = "Pancake disk (bottom) griddle face";
  if (endpoint_disk_bottom_face_2) {
    mesh_disk_bottom_face_2.position.copy(endpoint_disk_bottom_face_2.midpoint);
    mesh_disk_bottom_face_2.quaternion.copy(endpoint_disk_bottom_face_2.quaternion);
  }
  mesh_disk_bottom_face_2.castShadow = options.castShadow ?? true;
  mesh_disk_bottom_face_2.receiveShadow = options.receiveShadow ?? true;
  mesh_disk_bottom_face_2.userData.sculptComponent = {"id": "disk-bottom-face", "name": "Pancake disk (bottom) griddle face", "level": "meso", "role": "surface", "importance": 0.6, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single smoothly varying revolved cap - crown at the axis, sag at the perimeter - with the pore pits displaced into it rather than cut as separate solids. Decision tree step 6. It is not conforming-shell because it is the disk's own top surface, not a skin over another form.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.9207, 0.1998], [0.792, 0.21046], [0.6633, 0.21734], [0.5247, 0.22111], [0.3762, 0.22289], [0.198, 0.224], [0.0, 0.22466]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Identical modulation to the parent body so the shared perimeter ring stays welded."}, {"id": "pore-dimples", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.062, "notes": "Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement"}, "parent": "disk-bottom", "attachment": null, "dimensions": {"width": 1.8414, "height": 0.02486, "depth": 1.8414, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-bottom-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-top", "materialLayers": ["crust-top"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(198, 137, 88, 1.0)", "secondaryAlbedo": "rgba(169, 113, 63, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "griddle face", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble", "pore-dimples"], "joints": [], "seams": [{"id": "disk-bottom-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}], "localFeatures": [{"id": "disk-bottom-face-pore-dimples", "name": "Pore dimple field", "kind": "recessed-detail-scatter", "description": "8 concave pits in four size classes (crater d=0.062, medium d=0.046, small d=0.030, tiny d=0.018 in disk-radius units), scattered over radiusFraction 0.2-0.8. Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "pore-scatter"}, {"id": "disk-bottom-face-edge-sag", "name": "Top-face edge sag", "kind": "profile-curvature", "description": "Face crowns to heightFraction 1.012 at the axis and drops to 0.90 at the perimeter ring, a 0.024 crown over one disk height.", "evidenceRefs": ["view-front"], "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.031, "normalPattern": "faceted planar shading from split vertices; each pit contributes its own hard-edged cone", "displacementPattern": "pore pits displaced into the revolved cap", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "assets/prompts/breads/pancake.json notes_ko: without the pits the object reads as a smooth plastic disk, so this field is identity-critical rather than decorative."}, "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-bottom-face-pore-dimples", "disk-bottom-face-edge-sag"], "fidelityTier": "surface-pass"};
  node_disk_bottom_face_2.add(mesh_disk_bottom_face_2);
  meshes["disk-bottom-face"] = mesh_disk_bottom_face_2;
  colliders["disk-bottom-face"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["disk-bottom-face"] ??= [];
  destructionGroups["disk-bottom-face"].push(node_disk_bottom_face_2);

  const endpoint_disk_middle_3 = makeAttachmentEndpoint(null);
  const node_disk_middle_3 = new THREE.Group();
  node_disk_middle_3.name = "Pancake disk (middle) rim wall and underside__pivot";
  node_disk_middle_3.scale.set(1, 1, 1);
  if (endpoint_disk_middle_3) {
    node_disk_middle_3.position.copy(endpoint_disk_middle_3.start);
    node_disk_middle_3.rotation.set(0.0, 0.9, 0.0);
  } else {
    node_disk_middle_3.position.set(0.03, 0.21, -0.02);
    node_disk_middle_3.rotation.set(0.0, 0.9, 0.0);
  }
  node_disk_middle_3.userData.sculptComponent = {"id": "disk-middle", "name": "Pancake disk (middle) rim wall and underside", "level": "macro", "role": "body", "importance": 0.85, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass with no internal seams or panel breaks: the underside, the lower rim, the equator bulge and the upper rim are a single swept profile. Decision tree step 6. A cylinder primitive is structurally wrong here because the widest point sits at mid height, not at the top and bottom edges.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.0, 0.01998], [0.82, 0.0], [0.975, 0.05772], [1.0, 0.11544], [0.985, 0.16428], [0.93, 0.1998]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Per-sector radius multiplier 1 + 0.028*sin(3t+phi) + 0.018*sin(7t+psi) + rng noise up to 0.012, plus up to 0.015 disk-height noise on the rim ring. Applied identically to the body and face profiles so the shared perimeter ring stays welded."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag"}, "parent": "root", "attachment": null, "dimensions": {"width": 2.0, "height": 0.222, "depth": 2.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.03, 0.21, -0.02], "rotation": [0, 0.9, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-middle", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "rim wall and underside", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble"], "joints": [], "seams": [{"id": "disk-middle-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at radiusFraction 0.93, heightFraction 0.90. Body and face lathe the same ring, so the two-tone boundary is watertight and hard-edged."}], "localFeatures": [{"id": "disk-middle-equator-bulge", "name": "Rim equator bulge", "kind": "profile-curvature", "description": "Widest radius sits at heightFraction 0.52, with the top-face perimeter inset to radiusFraction 0.93, so the rim reads as a convex band in profile.", "evidenceRefs": ["view-front"], "confidence": 0.9}, {"id": "disk-middle-outline-wobble", "name": "Hand-poured outline wobble", "kind": "silhouette-modulation", "description": "Radius varies about +/-3% per sector with two low-frequency lobes plus seeded noise; each disk uses a different yaw so the three wobble phases differ.", "evidenceRefs": ["view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "faceted planar shading from split vertices", "displacementPattern": "profile-driven only; the rim carries no pits", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Rim and underside share one flat albedo. The runtime replaces the material with MeshLambertMaterial keeping only map and color, so all relief here is geometric."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-middle-equator-bulge", "disk-middle-outline-wobble"], "fidelityTier": "form-refinement"};
  node_disk_middle_3.userData.actionProfile = {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-middle", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["root"] ?? root).add(node_disk_middle_3);
  nodes["disk-middle"] = node_disk_middle_3;
  const mesh_disk_middle_3Geometry = endpoint_disk_middle_3
    ? new THREE.CylinderGeometry(endpoint_disk_middle_3.endRadius, endpoint_disk_middle_3.baseRadius, endpoint_disk_middle_3.length, 8, 4)
    : buildLatheGeometry({"points": [[0.0, 0.01998], [0.82, 0.0], [0.975, 0.05772], [1.0, 0.11544], [0.985, 0.16428], [0.93, 0.1998]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_disk_middle_3) {
    mesh_disk_middle_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_disk_middle_3 = new THREE.Mesh(
    mesh_disk_middle_3Geometry,
    materialMap["crust-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_disk_middle_3.name = "Pancake disk (middle) rim wall and underside";
  if (endpoint_disk_middle_3) {
    mesh_disk_middle_3.position.copy(endpoint_disk_middle_3.midpoint);
    mesh_disk_middle_3.quaternion.copy(endpoint_disk_middle_3.quaternion);
  }
  mesh_disk_middle_3.castShadow = options.castShadow ?? true;
  mesh_disk_middle_3.receiveShadow = options.receiveShadow ?? true;
  mesh_disk_middle_3.userData.sculptComponent = {"id": "disk-middle", "name": "Pancake disk (middle) rim wall and underside", "level": "macro", "role": "body", "importance": 0.85, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass with no internal seams or panel breaks: the underside, the lower rim, the equator bulge and the upper rim are a single swept profile. Decision tree step 6. A cylinder primitive is structurally wrong here because the widest point sits at mid height, not at the top and bottom edges.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.0, 0.01998], [0.82, 0.0], [0.975, 0.05772], [1.0, 0.11544], [0.985, 0.16428], [0.93, 0.1998]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Per-sector radius multiplier 1 + 0.028*sin(3t+phi) + 0.018*sin(7t+psi) + rng noise up to 0.012, plus up to 0.015 disk-height noise on the rim ring. Applied identically to the body and face profiles so the shared perimeter ring stays welded."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag"}, "parent": "root", "attachment": null, "dimensions": {"width": 2.0, "height": 0.222, "depth": 2.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.03, 0.21, -0.02], "rotation": [0, 0.9, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-middle", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "rim wall and underside", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble"], "joints": [], "seams": [{"id": "disk-middle-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at radiusFraction 0.93, heightFraction 0.90. Body and face lathe the same ring, so the two-tone boundary is watertight and hard-edged."}], "localFeatures": [{"id": "disk-middle-equator-bulge", "name": "Rim equator bulge", "kind": "profile-curvature", "description": "Widest radius sits at heightFraction 0.52, with the top-face perimeter inset to radiusFraction 0.93, so the rim reads as a convex band in profile.", "evidenceRefs": ["view-front"], "confidence": 0.9}, {"id": "disk-middle-outline-wobble", "name": "Hand-poured outline wobble", "kind": "silhouette-modulation", "description": "Radius varies about +/-3% per sector with two low-frequency lobes plus seeded noise; each disk uses a different yaw so the three wobble phases differ.", "evidenceRefs": ["view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "faceted planar shading from split vertices", "displacementPattern": "profile-driven only; the rim carries no pits", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Rim and underside share one flat albedo. The runtime replaces the material with MeshLambertMaterial keeping only map and color, so all relief here is geometric."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-middle-equator-bulge", "disk-middle-outline-wobble"], "fidelityTier": "form-refinement"};
  node_disk_middle_3.add(mesh_disk_middle_3);
  meshes["disk-middle"] = mesh_disk_middle_3;
  colliders["disk-middle"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["disk-middle"] ??= [];
  destructionGroups["disk-middle"].push(node_disk_middle_3);

  const endpoint_disk_middle_face_4 = makeAttachmentEndpoint(null);
  const node_disk_middle_face_4 = new THREE.Group();
  node_disk_middle_face_4.name = "Pancake disk (middle) griddle face__pivot";
  node_disk_middle_face_4.scale.set(1, 1, 1);
  if (endpoint_disk_middle_face_4) {
    node_disk_middle_face_4.position.copy(endpoint_disk_middle_face_4.start);
    node_disk_middle_face_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_disk_middle_face_4.position.set(0.0, 0.0, 0.0);
    node_disk_middle_face_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_disk_middle_face_4.userData.sculptComponent = {"id": "disk-middle-face", "name": "Pancake disk (middle) griddle face", "level": "meso", "role": "surface", "importance": 0.6, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single smoothly varying revolved cap - crown at the axis, sag at the perimeter - with the pore pits displaced into it rather than cut as separate solids. Decision tree step 6. It is not conforming-shell because it is the disk's own top surface, not a skin over another form.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.93, 0.1998], [0.8, 0.21046], [0.67, 0.21734], [0.53, 0.22111], [0.38, 0.22289], [0.2, 0.224], [0.0, 0.22466]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Identical modulation to the parent body so the shared perimeter ring stays welded."}, {"id": "pore-dimples", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.062, "notes": "Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement"}, "parent": "disk-middle", "attachment": null, "dimensions": {"width": 1.86, "height": 0.02486, "depth": 1.86, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-middle-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-top", "materialLayers": ["crust-top"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(198, 137, 88, 1.0)", "secondaryAlbedo": "rgba(169, 113, 63, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "griddle face", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble", "pore-dimples"], "joints": [], "seams": [{"id": "disk-middle-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}], "localFeatures": [{"id": "disk-middle-face-pore-dimples", "name": "Pore dimple field", "kind": "recessed-detail-scatter", "description": "8 concave pits in four size classes (crater d=0.062, medium d=0.046, small d=0.030, tiny d=0.018 in disk-radius units), scattered over radiusFraction 0.2-0.8. Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "pore-scatter"}, {"id": "disk-middle-face-edge-sag", "name": "Top-face edge sag", "kind": "profile-curvature", "description": "Face crowns to heightFraction 1.012 at the axis and drops to 0.90 at the perimeter ring, a 0.024 crown over one disk height.", "evidenceRefs": ["view-front"], "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.031, "normalPattern": "faceted planar shading from split vertices; each pit contributes its own hard-edged cone", "displacementPattern": "pore pits displaced into the revolved cap", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "assets/prompts/breads/pancake.json notes_ko: without the pits the object reads as a smooth plastic disk, so this field is identity-critical rather than decorative."}, "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-middle-face-pore-dimples", "disk-middle-face-edge-sag"], "fidelityTier": "surface-pass"};
  node_disk_middle_face_4.userData.actionProfile = {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-middle-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["disk-middle"] ?? root).add(node_disk_middle_face_4);
  nodes["disk-middle-face"] = node_disk_middle_face_4;
  const mesh_disk_middle_face_4Geometry = endpoint_disk_middle_face_4
    ? new THREE.CylinderGeometry(endpoint_disk_middle_face_4.endRadius, endpoint_disk_middle_face_4.baseRadius, endpoint_disk_middle_face_4.length, 8, 4)
    : buildLatheGeometry({"points": [[0.93, 0.1998], [0.8, 0.21046], [0.67, 0.21734], [0.53, 0.22111], [0.38, 0.22289], [0.2, 0.224], [0.0, 0.22466]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_disk_middle_face_4) {
    mesh_disk_middle_face_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_disk_middle_face_4 = new THREE.Mesh(
    mesh_disk_middle_face_4Geometry,
    materialMap["crust-top"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_disk_middle_face_4.name = "Pancake disk (middle) griddle face";
  if (endpoint_disk_middle_face_4) {
    mesh_disk_middle_face_4.position.copy(endpoint_disk_middle_face_4.midpoint);
    mesh_disk_middle_face_4.quaternion.copy(endpoint_disk_middle_face_4.quaternion);
  }
  mesh_disk_middle_face_4.castShadow = options.castShadow ?? true;
  mesh_disk_middle_face_4.receiveShadow = options.receiveShadow ?? true;
  mesh_disk_middle_face_4.userData.sculptComponent = {"id": "disk-middle-face", "name": "Pancake disk (middle) griddle face", "level": "meso", "role": "surface", "importance": 0.6, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single smoothly varying revolved cap - crown at the axis, sag at the perimeter - with the pore pits displaced into it rather than cut as separate solids. Decision tree step 6. It is not conforming-shell because it is the disk's own top surface, not a skin over another form.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.93, 0.1998], [0.8, 0.21046], [0.67, 0.21734], [0.53, 0.22111], [0.38, 0.22289], [0.2, 0.224], [0.0, 0.22466]], "segments": 20, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Identical modulation to the parent body so the shared perimeter ring stays welded."}, {"id": "pore-dimples", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.062, "notes": "Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement"}, "parent": "disk-middle", "attachment": null, "dimensions": {"width": 1.86, "height": 0.02486, "depth": 1.86, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-middle-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-top", "materialLayers": ["crust-top"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(198, 137, 88, 1.0)", "secondaryAlbedo": "rgba(169, 113, 63, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "griddle face", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble", "pore-dimples"], "joints": [], "seams": [{"id": "disk-middle-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}], "localFeatures": [{"id": "disk-middle-face-pore-dimples", "name": "Pore dimple field", "kind": "recessed-detail-scatter", "description": "8 concave pits in four size classes (crater d=0.062, medium d=0.046, small d=0.030, tiny d=0.018 in disk-radius units), scattered over radiusFraction 0.2-0.8. Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "pore-scatter"}, {"id": "disk-middle-face-edge-sag", "name": "Top-face edge sag", "kind": "profile-curvature", "description": "Face crowns to heightFraction 1.012 at the axis and drops to 0.90 at the perimeter ring, a 0.024 crown over one disk height.", "evidenceRefs": ["view-front"], "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.031, "normalPattern": "faceted planar shading from split vertices; each pit contributes its own hard-edged cone", "displacementPattern": "pore pits displaced into the revolved cap", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "assets/prompts/breads/pancake.json notes_ko: without the pits the object reads as a smooth plastic disk, so this field is identity-critical rather than decorative."}, "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-middle-face-pore-dimples", "disk-middle-face-edge-sag"], "fidelityTier": "surface-pass"};
  node_disk_middle_face_4.add(mesh_disk_middle_face_4);
  meshes["disk-middle-face"] = mesh_disk_middle_face_4;
  colliders["disk-middle-face"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["disk-middle-face"] ??= [];
  destructionGroups["disk-middle-face"].push(node_disk_middle_face_4);

  const endpoint_disk_top_5 = makeAttachmentEndpoint(null);
  const node_disk_top_5 = new THREE.Group();
  node_disk_top_5.name = "Pancake disk (top) rim wall and underside__pivot";
  node_disk_top_5.scale.set(1, 1, 1);
  if (endpoint_disk_top_5) {
    node_disk_top_5.position.copy(endpoint_disk_top_5.start);
    node_disk_top_5.rotation.set(0.0, 2.1, 0.0);
  } else {
    node_disk_top_5.position.set(-0.02, 0.42, -0.05);
    node_disk_top_5.rotation.set(0.0, 2.1, 0.0);
  }
  node_disk_top_5.userData.sculptComponent = {"id": "disk-top", "name": "Pancake disk (top) rim wall and underside", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass with no internal seams or panel breaks: the underside, the lower rim, the equator bulge and the upper rim are a single swept profile. Decision tree step 6. A cylinder primitive is structurally wrong here because the widest point sits at mid height, not at the top and bottom edges.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.0, 0.01998], [0.7954, 0.0], [0.94575, 0.05772], [0.97, 0.11544], [0.95545, 0.16428], [0.9021, 0.1998]], "segments": 24, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Per-sector radius multiplier 1 + 0.028*sin(3t+phi) + 0.018*sin(7t+psi) + rng noise up to 0.012, plus up to 0.015 disk-height noise on the rim ring. Applied identically to the body and face profiles so the shared perimeter ring stays welded."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.94, "height": 0.222, "depth": 1.94, "units": "relative", "confidence": 0.9}, "transform": {"position": [-0.02, 0.42, -0.05], "rotation": [0, 2.1, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-top", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "rim wall and underside", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble"], "joints": [], "seams": [{"id": "disk-top-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at radiusFraction 0.93, heightFraction 0.90. Body and face lathe the same ring, so the two-tone boundary is watertight and hard-edged."}], "localFeatures": [{"id": "disk-top-equator-bulge", "name": "Rim equator bulge", "kind": "profile-curvature", "description": "Widest radius sits at heightFraction 0.52, with the top-face perimeter inset to radiusFraction 0.93, so the rim reads as a convex band in profile.", "evidenceRefs": ["view-front"], "confidence": 0.9}, {"id": "disk-top-outline-wobble", "name": "Hand-poured outline wobble", "kind": "silhouette-modulation", "description": "Radius varies about +/-3% per sector with two low-frequency lobes plus seeded noise; each disk uses a different yaw so the three wobble phases differ.", "evidenceRefs": ["view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "faceted planar shading from split vertices", "displacementPattern": "profile-driven only; the rim carries no pits", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Rim and underside share one flat albedo. The runtime replaces the material with MeshLambertMaterial keeping only map and color, so all relief here is geometric."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-top-equator-bulge", "disk-top-outline-wobble"], "fidelityTier": "form-refinement"};
  node_disk_top_5.userData.actionProfile = {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-top", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["root"] ?? root).add(node_disk_top_5);
  nodes["disk-top"] = node_disk_top_5;
  const mesh_disk_top_5Geometry = endpoint_disk_top_5
    ? new THREE.CylinderGeometry(endpoint_disk_top_5.endRadius, endpoint_disk_top_5.baseRadius, endpoint_disk_top_5.length, 8, 4)
    : buildLatheGeometry({"points": [[0.0, 0.01998], [0.7954, 0.0], [0.94575, 0.05772], [0.97, 0.11544], [0.95545, 0.16428], [0.9021, 0.1998]], "segments": 24, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_disk_top_5) {
    mesh_disk_top_5Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_disk_top_5 = new THREE.Mesh(
    mesh_disk_top_5Geometry,
    materialMap["crust-rim"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_disk_top_5.name = "Pancake disk (top) rim wall and underside";
  if (endpoint_disk_top_5) {
    mesh_disk_top_5.position.copy(endpoint_disk_top_5.midpoint);
    mesh_disk_top_5.quaternion.copy(endpoint_disk_top_5.quaternion);
  }
  mesh_disk_top_5.castShadow = options.castShadow ?? true;
  mesh_disk_top_5.receiveShadow = options.receiveShadow ?? true;
  mesh_disk_top_5.userData.sculptComponent = {"id": "disk-top", "name": "Pancake disk (top) rim wall and underside", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass with no internal seams or panel breaks: the underside, the lower rim, the equator bulge and the upper rim are a single swept profile. Decision tree step 6. A cylinder primitive is structurally wrong here because the widest point sits at mid height, not at the top and bottom edges.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.0, 0.01998], [0.7954, 0.0], [0.94575, 0.05772], [0.97, 0.11544], [0.95545, 0.16428], [0.9021, 0.1998]], "segments": 24, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Per-sector radius multiplier 1 + 0.028*sin(3t+phi) + 0.018*sin(7t+psi) + rng noise up to 0.012, plus up to 0.015 disk-height noise on the rim ring. Applied identically to the body and face profiles so the shared perimeter ring stays welded."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.94, "height": 0.222, "depth": 1.94, "units": "relative", "confidence": 0.9}, "transform": {"position": [-0.02, 0.42, -0.05], "rotation": [0, 2.1, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "stack-layer", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-top", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-rim", "materialLayers": ["crust-rim"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 113, 63, 1.0)", "secondaryAlbedo": "rgba(198, 137, 88, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "rim wall and underside", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble"], "joints": [], "seams": [{"id": "disk-top-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at radiusFraction 0.93, heightFraction 0.90. Body and face lathe the same ring, so the two-tone boundary is watertight and hard-edged."}], "localFeatures": [{"id": "disk-top-equator-bulge", "name": "Rim equator bulge", "kind": "profile-curvature", "description": "Widest radius sits at heightFraction 0.52, with the top-face perimeter inset to radiusFraction 0.93, so the rim reads as a convex band in profile.", "evidenceRefs": ["view-front"], "confidence": 0.9}, {"id": "disk-top-outline-wobble", "name": "Hand-poured outline wobble", "kind": "silhouette-modulation", "description": "Radius varies about +/-3% per sector with two low-frequency lobes plus seeded noise; each disk uses a different yaw so the three wobble phases differ.", "evidenceRefs": ["view-top"], "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "faceted planar shading from split vertices", "displacementPattern": "profile-driven only; the rim carries no pits", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "Rim and underside share one flat albedo. The runtime replaces the material with MeshLambertMaterial keeping only map and color, so all relief here is geometric."}, "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-top-equator-bulge", "disk-top-outline-wobble"], "fidelityTier": "form-refinement"};
  node_disk_top_5.add(mesh_disk_top_5);
  meshes["disk-top"] = mesh_disk_top_5;
  colliders["disk-top"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["disk-top"] ??= [];
  destructionGroups["disk-top"].push(node_disk_top_5);

  const endpoint_disk_top_face_6 = makeAttachmentEndpoint(null);
  const node_disk_top_face_6 = new THREE.Group();
  node_disk_top_face_6.name = "Pancake disk (top) griddle face__pivot";
  node_disk_top_face_6.scale.set(1, 1, 1);
  if (endpoint_disk_top_face_6) {
    node_disk_top_face_6.position.copy(endpoint_disk_top_face_6.start);
    node_disk_top_face_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_disk_top_face_6.position.set(0.0, 0.0, 0.0);
    node_disk_top_face_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_disk_top_face_6.userData.sculptComponent = {"id": "disk-top-face", "name": "Pancake disk (top) griddle face", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single smoothly varying revolved cap - crown at the axis, sag at the perimeter - with the pore pits displaced into it rather than cut as separate solids. Decision tree step 6. It is not conforming-shell because it is the disk's own top surface, not a skin over another form.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.9021, 0.1998], [0.8439, 0.20513], [0.776, 0.21112], [0.7081, 0.21445], [0.6305, 0.21756], [0.5432, 0.21978], [0.4462, 0.22156], [0.3395, 0.22289], [0.2134, 0.22378], [0.0, 0.22466]], "segments": 24, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Identical modulation to the parent body so the shared perimeter ring stays welded."}, {"id": "pore-dimples", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.062, "notes": "Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement"}, "parent": "disk-top", "attachment": null, "dimensions": {"width": 1.8042, "height": 0.02486, "depth": 1.8042, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-top-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-top", "materialLayers": ["crust-top"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(198, 137, 88, 1.0)", "secondaryAlbedo": "rgba(169, 113, 63, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "griddle face", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble", "pore-dimples"], "joints": [], "seams": [{"id": "disk-top-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}], "localFeatures": [{"id": "disk-top-face-pore-dimples", "name": "Pore dimple field", "kind": "recessed-detail-scatter", "description": "22 concave pits in four size classes (crater d=0.062, medium d=0.046, small d=0.030, tiny d=0.018 in disk-radius units), scattered over radiusFraction 0.2-0.8. Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "pore-scatter"}, {"id": "disk-top-face-edge-sag", "name": "Top-face edge sag", "kind": "profile-curvature", "description": "Face crowns to heightFraction 1.012 at the axis and drops to 0.90 at the perimeter ring, a 0.024 crown over one disk height.", "evidenceRefs": ["view-front"], "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.031, "normalPattern": "faceted planar shading from split vertices; each pit contributes its own hard-edged cone", "displacementPattern": "pore pits displaced into the revolved cap", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "assets/prompts/breads/pancake.json notes_ko: without the pits the object reads as a smooth plastic disk, so this field is identity-critical rather than decorative."}, "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-top-face-pore-dimples", "disk-top-face-edge-sag"], "fidelityTier": "surface-pass"};
  node_disk_top_face_6.userData.actionProfile = {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-top-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}};
  (nodes["disk-top"] ?? root).add(node_disk_top_face_6);
  nodes["disk-top-face"] = node_disk_top_face_6;
  const mesh_disk_top_face_6Geometry = endpoint_disk_top_face_6
    ? new THREE.CylinderGeometry(endpoint_disk_top_face_6.endRadius, endpoint_disk_top_face_6.baseRadius, endpoint_disk_top_face_6.length, 8, 4)
    : buildLatheGeometry({"points": [[0.9021, 0.1998], [0.8439, 0.20513], [0.776, 0.21112], [0.7081, 0.21445], [0.6305, 0.21756], [0.5432, 0.21978], [0.4462, 0.22156], [0.3395, 0.22289], [0.2134, 0.22378], [0.0, 0.22466]], "segments": 24, "phiStart": 0.0, "phiLength": 6.283185307179586});
  if (!endpoint_disk_top_face_6) {
    mesh_disk_top_face_6Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_disk_top_face_6 = new THREE.Mesh(
    mesh_disk_top_face_6Geometry,
    materialMap["crust-top"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_disk_top_face_6.name = "Pancake disk (top) griddle face";
  if (endpoint_disk_top_face_6) {
    mesh_disk_top_face_6.position.copy(endpoint_disk_top_face_6.midpoint);
    mesh_disk_top_face_6.quaternion.copy(endpoint_disk_top_face_6.quaternion);
  }
  mesh_disk_top_face_6.castShadow = options.castShadow ?? true;
  mesh_disk_top_face_6.receiveShadow = options.receiveShadow ?? true;
  mesh_disk_top_face_6.userData.sculptComponent = {"id": "disk-top-face", "name": "Pancake disk (top) griddle face", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt", "topologyRationale": "A single smoothly varying revolved cap - crown at the axis, sag at the perimeter - with the pore pits displaced into it rather than cut as separate solids. Decision tree step 6. It is not conforming-shell because it is the disk's own top surface, not a skin over another form.", "geometryDescriptor": {"topologyIntent": "low-poly prop, faceted after generation", "latheProfile": {"points": [[0.9021, 0.1998], [0.8439, 0.20513], [0.776, 0.21112], [0.7081, 0.21445], [0.6305, 0.21756], [0.5432, 0.21978], [0.4462, 0.22156], [0.3395, 0.22289], [0.2134, 0.22378], [0.0, 0.22466]], "segments": 24, "phiStart": 0.0, "phiLength": 6.283185307179586}, "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.057999999999999996, "notes": "Identical modulation to the parent body so the shared perimeter ring stays welded."}, {"id": "pore-dimples", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.062, "notes": "Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried."}], "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement"}, "parent": "disk-top", "attachment": null, "dimensions": {"width": 1.8042, "height": 0.02486, "depth": 1.8042, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "surface", "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "disk-top-face", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-rim"}}, "material": "crust-top", "materialLayers": ["crust-top"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(198, 137, 88, 1.0)", "secondaryAlbedo": "rgba(169, 113, 63, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.75, "materialClassRationale": "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes.", "zone": "griddle face", "evidenceRefs": ["assets/prompts/breads/pancake.json geometry.crust"]}, "deformations": ["outline-wobble", "pore-dimples"], "joints": [], "seams": [{"id": "disk-top-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}], "localFeatures": [{"id": "disk-top-face-pore-dimples", "name": "Pore dimple field", "kind": "recessed-detail-scatter", "description": "22 concave pits in four size classes (crater d=0.062, medium d=0.046, small d=0.030, tiny d=0.018 in disk-radius units), scattered over radiusFraction 0.2-0.8. Grid-cell dip, not a continuous smoothstep falloff. A falloff over the measured pit radius (0.018-0.075) was tried first and produced nothing: those radii are smaller than the face grid's vertex spacing (~0.16 tangential), so no vertex ever fell inside a pit. Each pit now drops exactly one face-grid vertex by its class depth, and the crater class also drops the vertices one ring inward and outward at 45% depth to widen it radially. Tangential spreading is deliberately not applied - it would flatten the wall again. Candidate cells are shuffled with the builder rng and rejected when within Chebyshev distance 1 of an accepted pit, so pits never merge into a trench; the walk is finite, so a shortfall is accepted rather than retried.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "pore-scatter"}, {"id": "disk-top-face-edge-sag", "name": "Top-face edge sag", "kind": "profile-curvature", "description": "Face crowns to heightFraction 1.012 at the axis and drops to 0.90 at the perimeter ring, a 0.024 crown over one disk height.", "evidenceRefs": ["view-front"], "confidence": 0.85}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.031, "normalPattern": "faceted planar shading from split vertices; each pit contributes its own hard-edged cone", "displacementPattern": "pore pits displaced into the revolved cap", "occlusionPattern": "cavity darkening inside each pore pit and along the two-tone boundary ring", "edgeWearPattern": "none - a freshly cooked surface carries no edge wear", "notes": "assets/prompts/breads/pancake.json notes_ko: without the pits the object reads as a smooth plastic disk, so this field is identity-critical rather than decorative."}, "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-top-face-pore-dimples", "disk-top-face-edge-sag"], "fidelityTier": "surface-pass"};
  node_disk_top_face_6.add(mesh_disk_top_face_6);
  meshes["disk-top-face"] = mesh_disk_top_face_6;
  colliders["disk-top-face"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Flat cylinder proxy matching the disk bounding volume; the pore pits are far below collider resolution."};
  destructionGroups["disk-top-face"] ??= [];
  destructionGroups["disk-top-face"].push(node_disk_top_face_6);
  // repetition system "pore-scatter" describes 3 parts that are already built individually; not instanced.
  // repetition system "disk-stack" describes 3 parts that are already built individually; not instanced.

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "runtime-budget", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": false, "normalOrBumpRequired": false, "localOverridesRequired": true, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.0, "stopOnLowConfidence": false, "script": "not run", "acceptedLimitation": "See qualityContract.featureGroups.reference-lookdev.documentedLimitation: the consumer runtime keeps only map and color, and the repo bans PBR maps outright (docs/VISUAL.md section 8), so every channel these fields describe is inert. All of it is moved into geometry."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Lighting is fixed by the consumer, not authored here: scripts/breadlab.ts mirrors scripts/thumbsHarness.ts with a warm directional key 0xffe2b0 at (-2, 6, 2) intensity 1.4, an ambient 0xfff0dc at 0.75 and a cool fill 0xdce8ff at (2.5, 3, -2) intensity 0.2.", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createPancakeStackLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Pancake Stack look-dev lights";
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
  lights.userData.lightingFromPhoto = [{"id": "harness-key", "role": "key light", "observation": "Warm directional key 0xffe2b0 at (-2, 6, 2), intensity 1.4, upper-left and slightly front - the same relationship as the reference's 'single soft key light upper-left'.", "usage": "Fixed by scripts/breadlab.ts, mirrored from scripts/thumbsHarness.ts. Not authored by the model.", "exposure": "no exposure control and no tone mapping - the renderer runs at default linear output, so authored albedo lands on screen almost unchanged."}, {"id": "harness-ambient", "role": "ambient fill", "observation": "Ambient 0xfff0dc at 0.75 - a high ambient ratio, which is why the faceting has to be strong enough to read without relying on shadow terminators.", "usage": "Fixed by the harness.", "contactShadow": "none - there is no shadow map and no ground plane, so no contact shadow or ground shadow is rendered. The reference's soft inter-layer contact shadow is therefore a known, accepted delta."}, {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill 0xdce8ff at (2.5, 3, -2), intensity 0.2, opposite the key - lifts the rear rim just enough for the silhouette to separate at azimuth 180.", "usage": "Fixed by the harness. Its low intensity is why the rear rim must carry geometric relief rather than relying on a lighting gradient.", "toneMapping": "NoToneMapping (three.js default); ambient occlusion is not available on the runtime Lambert material, so cavity darkening must come from pit-wall orientation."}];
  lights.userData.lookDevTargets = {"qualityPriority": "runtime-budget", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": false, "normalOrBumpRequired": false, "localOverridesRequired": true, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.0, "stopOnLowConfidence": false, "script": "not run", "acceptedLimitation": "See qualityContract.featureGroups.reference-lookdev.documentedLimitation: the consumer runtime keeps only map and color, and the repo bans PBR maps outright (docs/VISUAL.md section 8), so every channel these fields describe is inert. All of it is moved into geometry."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Lighting is fixed by the consumer, not authored here: scripts/breadlab.ts mirrors scripts/thumbsHarness.ts with a warm directional key 0xffe2b0 at (-2, 6, 2) intensity 1.4, an ambient 0xfff0dc at 0.75 and a cool fill 0xdce8ff at (2.5, 3, -2) intensity 0.2.", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createPancakeStackEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
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
export function framePancakeStackCamera(
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
export function createPancakeStackPresentationComposer(
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

export function configurePancakeStackRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createPancakeStackInspectControls(
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
