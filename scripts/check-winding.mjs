// 와인딩 반전 게이트 — GLB 프리미티브의 부호부피로 안팎이 뒤집힌 셸을 잡는다.
//
// ## 왜 이 게이트가 생겼나 (2026-08-26)
//
// `fig`·`beet`·`pumpkin`이 **면이 통째로 뒤집힌 채** 발행됐다. 세 파일 다 로컬 셸 빌더가
// lib의 `buildRevolvedShell`과 **거울상 좌표계**(z=-sin 또는 x=sin/z=cos)를 쓰면서
// 인덱스 감기는 lib 것을 그대로 복사해, 손잡이가 뒤집혀 법선이 전부 안을 향했다.
//
// 런타임은 `MeshLambertMaterial` 기본 FrontSide라 **가까운 벽이 컬링돼 사라진다** —
// 일부 각도에서 몸통이 통째로 없어지고 꼭지만 남아 "떠 있는 꼭지"로 보였다.
//
// ★**기존 게이트가 전부 이걸 통과시켰다**: tri·KB 예산 · mesh≤2 · GLB 왕복 파리티 · 64px 썸네일 판독.
// 뒤집힌 셸은 삼각형 수도 파일 크기도 정상이고, 썸네일 각도에서는 멀쩡해 보였다.
// **수치가 맞다는 것과 면이 바깥을 향한다는 것은 별개다.**
//
// ## 판정
//
// 닫힌 셸이면 부호부피가 양수여야 한다(발산정리). 단 **평면 캡·얇은 조각은 부피가 구조적으로 0**이라
// 부호가 의미 없다 — 최장 변의 세제곱으로 정규화해 잡음과 진짜 반전을 가른다(analyze 주석 참조).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES, FAMILY_KEYS } from './lib/families.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COMP = {
  5120: [1, 'readInt8'], 5121: [1, 'readUInt8'], 5122: [2, 'readInt16LE'],
  5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'],
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readGlb(file) {
  const b = fs.readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off);
    const type = b.readUInt32LE(off + 4);
    const data = b.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}

function readAccessor(json, bin, i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const [size, fn] = COMP[a.componentType];
  const n = NCOMP[a.type];
  const stride = bv.byteStride || size * n;
  const out = [];
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) out.push(bin[fn](base + k * stride + c * size));
  }
  return out;
}

/**
 * 프리미티브 하나의 부호부피 — 오브젝트 스케일 대비로 정규화한다.
 *
 * ★평면(단면 캡·얇은 조각)은 부피가 **구조적으로 0**이라 부호가 의미 없다.
 * 절댓값 임계로 자르면 부동소수 잡음(-0.001)이 전부 걸려 오탐이 된다.
 * 그래서 최장 변의 세제곱으로 나눠 **모양이 실제로 뒤집힌 경우만** 남긴다:
 * 뒤집힌 셸은 이 비율이 0.06~0.4 수준이고(fig/beet/pumpkin 실측), 평면 캡은 0.001 미만이다.
 */
function analyze(P, I) {
  let vol = 0;
  for (let k = 0; k < I.length; k += 3) {
    const [ia, ib, ic] = [I[k], I[k + 1], I[k + 2]];
    const A = [P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]];
    const B = [P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]];
    const C = [P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]];
    vol += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
  }
  // 오브젝트 스케일 — 최장 변의 세제곱으로 정규화해 평면과 뒤집힌 셸을 가른다.
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.length; k += 3) {
    for (let c = 0; c < 3; c++) { if (P[k + c] < mn[c]) mn[c] = P[k + c]; if (P[k + c] > mx[c]) mx[c] = P[k + c]; }
  }
  const extent = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1e-6);
  const ratio = vol / (extent * extent * extent);
  return { tris: I.length / 3, vol, ratio };
}

const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const famArg = process.argv.find((a) => a.startsWith('--family='));
const keys = famArg ? [famArg.slice('--family='.length)] : FAMILY_KEYS;

let bad = 0, checked = 0;
for (const key of keys) {
  const fam = FAMILIES[key];
  const dir = path.join(root, 'public', fam.outDir);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))
    .filter((f) => ids.length === 0 || ids.includes(f.slice(0, -4)));
  for (const f of files.sort()) {
    const { json, bin } = readGlb(path.join(dir, f));
    const flags = [];
    for (const mesh of json.meshes) {
      for (const p of mesh.primitives) {
        const P = readAccessor(json, bin, p.attributes.POSITION);
        // 비인덱스 프리미티브는 정점 순서가 곧 삼각형 순서다(빵 자산에 실제로 있다).
        const I = p.indices != null
          ? readAccessor(json, bin, p.indices)
          : Array.from({ length: P.length / 3 }, (_, k) => k);
        const r = analyze(P, I);
        checked++;
        // 임계 -0.01: 뒤집힌 셸는 실측상 -0.06 아래고 평면 캡은 -0.001보다 위다.
        if (r.ratio < -0.01) flags.push(`${r.tris}tri vol=${r.vol.toFixed(3)} (스케일 대비 ${r.ratio.toFixed(3)})`);
      }
    }
    if (flags.length) {
      bad++;
      console.error(`✗ ${key}/${f} — 면이 뒤집힘: ${flags.join(', ')}`);
    }
  }
}

if (bad > 0) {
  console.error('');
  console.error(`와인딩 반전 ${bad}건. 셸 빌더의 인덱스 감기가 좌표계와 안 맞습니다.`);
  console.error('로컬 셸 빌더가 lib의 buildRevolvedShell과 거울상 좌표계를 쓰면서 감기를 복사하면 발생합니다.');
  process.exit(1);
}
console.log(`✓ 와인딩 정상 — 프리미티브 ${checked}개 (평면·얇은 조각은 스케일 정규화로 제외)`);
