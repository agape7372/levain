// olive-flesh focaccia -- REDO round (2026-08-30), img2threejs skill state-gated procedure.
// Workspace: assets/breads/work/focaccia--olive-flesh-v2/ (state.json + author_spec.py +
// object-sculpt-spec.json, reviewHistory holds the recorded pass-by-pass gate loop). Contract
// is types.ts. The first attempt at this bread (git history: scripts/breads/focacciaOliveFlesh.ts
// pre-redo) hand-inherited the base focaccia.ts builder and skipped the state-gated spec/build/
// review loop entirely -- user-rejected for quality. This file redoes it through the real
// pipeline; several NUMERIC constants below are legitimately inherited from that attempt's own
// A/B render research (documented per-constant) per CRIB/BREADS.md ("변형 계승은 수치만, 절차는
//계승 금지") -- what changed is that every constant here was re-verified against a fresh
// blockout -> structural -> form -> material -> surface -> optimization pass loop with real
// breadlab-shot renders and diagnose_render.py / append_review.py gates, not carried on faith.
//
// [PASS: form-refinement] Full geometry -- irregular dimple field, revolved-shell olive chunks
// (seated/beside/shard), sparse topping bumps. Neutral two-tone gray so the FORM is reviewed
// before any color lands (material-pass follows).
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { bakeTexture, buildRevolvedShell, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from './lib';

// Palette -- assets/prompts/breads/focaccia--olive-flesh.json v4 geometry.crust, hand-transcribed
// (types.ts section 8: hex is embedded in prose, JSON import is banned). Lighting rig was just
// recalibrated (docs/VISUAL.md section 1-3) and reproduces these hexes at ~0% error on the top
// face -- no gain/parity correction here, per CRIB's explicit warning against re-adding one.
const TOP_COLOR = 0xd9a552; // "matte golden surface #D9A552 across the top"
const OIL_COLOR = 0xb8813c; // "a small pool of darker golden-amber #B8813C following each dimple's own shape"
const OLIVE_COLOR = 0x3b2f2f; // spec-canon hex, "about nine solid olive pieces #3B2F2F (deep warm plum-brown)" -- kept as the documented/provenance constant, NOT fed to the material (see OLIVE_RENDER_COLOR)

// [material-pass revision, team-lead quality round] Olive material albedo -- NOT the crust's
// global lighting gain (that stays banned, crust already renders at ~0% error). This is a
// per-material albedo correction, which the CRIB parity-warning explicitly does not forbid.
// Calibration record (3-tuple, per CRIB "배율이 아니라 3쌍으로 기록"):
//   measured albedo used  = OLIVE_COLOR 0x3b2f2f (59,47,47)
//   resulting render      = our own view-top.png, dark-pixel (r<90,g<60,b<60) median (53,42,42)
//                           -- i.e. our lighting barely darkens albedo (ratio ~0.895), so the gap
//                           is the SPEC HEX itself reading flatter than the reference, not our shading
//   target                = assets/breads/src/focaccia--olive-flesh-3.png (top-down, CRIB's fixed
//                           measurement plane), dark-pixel median (118,57,35), 25th pct (95,44,24)
// OLIVE_RENDER_COLOR solves render*0.895 ~= target for a color between the median and the
// darker/core percentile (avoiding the brightest highlight-influenced pixels near the 90th pct).
const OLIVE_RENDER_COLOR = 0x70361f;

// --- Slab -- silhouette carried from blockout/structural passes (assets/prompts/breads/
// focaccia--olive-flesh.json silhouette: thin rectangular slab, low uniform height) ------------
const HALF_X = 1.0;
const HALF_Z = 0.65;
const THICK = 0.28;
const TOP_Y = THICK / 2;
// NX/NZ raised from the base focaccia's 16x12, first to 28x20 (tri-budget round) then to 44x32
// (surface-pass quality round) -- CRIB variant tri-budget lesson: the pre-redo build's 1098
// total tri (16x12 slab + 6-tri-transition chunks) left too few vertices for the dimple field
// and chunk shoulders to read as anything but blurry (target band for variant/detail breads is
// 3000-5000 tri, not the closed-public-10 budget's 500-1100). The second bump to 44x32 exists
// specifically to carry the authored surface grain below without aliasing: at 28x20 the grid
// spacing (~0.071) was BARELY longer than the grain's intended high-frequency wavelength, so the
// "fine crumb ripple" sampled at under 1 cycle per vertex and rendered as flat, not textured
// (team-lead quality review: "tri를 3배 올렸는데 대부분 실루엣 조밀화에 쓰였다"). 44x32 gives
// ~0.045 spacing, enough headroom for a >=3-sample-per-wavelength high-frequency band.
const NX = 44;
const NZ = 32;
const CELL_X = (2 * HALF_X) / NX;
const CELL_Z = (2 * HALF_Z) / NZ;
// [surface-pass revision, team-lead quality round] The perimeter wobble used to be
// EDGE_ROUND_AMP*sin(2*angle) PLUS an independent random offset PER BOUNDARY VERTEX
// (EDGE_NOISE_AMP*(rng()-0.5)*2). That second term is grid-resolution-coupled the exact same way
// the old dimple mechanic was: raising NX/NZ for tri budget put more independent-random samples
// around the same perimeter without lowering the per-sample amplitude, so the outline went from
// a gentle hand-torn wave (28x20) to a fine sawtooth (44x32) -- team-lead: "가장자리가 톱니".
// Fixed the same way as the dimple rim: replaced the independent per-vertex noise with two more
// low-order sine harmonics of the boundary angle (a continuous, resolution-independent function,
// consistent with the CRIB no-jitter-for-authored-shape rule) layered on the existing 2nd
// harmonic -- an organic torn-edge wobble that stays smooth at any vertex density.
const EDGE_ROUND_AMP = 0.03; // 2nd harmonic -- overall corner rounding
const EDGE_WOBBLE_AMP_1 = 0.014; // 5th harmonic -- coarse torn-edge waviness
const EDGE_WOBBLE_AMP_2 = 0.008; // 9th harmonic -- fine torn-edge waviness
const JITTER_AMP = 0.0015; // slab-shell only -- CRIB: amp <= 1/20 of the smallest exposure/recess span
const RIM_INSET = EDGE_ROUND_AMP + EDGE_WOBBLE_AMP_1 + EDGE_WOBBLE_AMP_2;

// Sparse rosemary/salt bumps -- v4 says "sparse", not the base focaccia's 22-bump full scatter.
const TOPPING_COUNT = 6;
const TOPPING_BUMP = 0.015;

// --- Dimples -- irregular finger marks, not a fixed lattice (object-sculpt-spec.json
// repetitionSystems.dimple-field: "stratified-random over a 5x3 region grid") -----------------
const DIMPLE_COUNT = 13;
// [surface-pass revision, team-lead quality round] Depth 0.08 was tuned against the OLD 16x12
// grid's ~0.125 neighbor-drop footprint. Raising the grid to 28x20 for tri budget (see NX/NZ
// above) shrank that footprint to ~1 cell (~0.07) WITHOUT me re-checking the coupling -- the
// dimple mechanic was rewritten below to a world-space radial falloff decoupled from grid
// resolution, so depth/radius can be tuned independently again. Depth raised to 0.11 at radius
// ~0.095 -> wall slope ~49 deg, well past the CRIB smooth-shading readability floor of >=30 deg
// (0.055 measured at ~24 deg on the old grid was not readable; the real lesson is "check the
// slope against the ACTUAL footprint after any grid-resolution change", not just the raw number).
// [2nd surface-pass revision, team-lead quality round] Raised again from 0.11 (~49deg) -- still
// visibly shallower than the reference's deep, dark-shadowed press marks. 0.13 at radius 0.095 ->
// ~54deg, tested empirically (CRIB warning: too close to vertical re-collapses under smooth
// normals) rather than assumed safe from the angle number alone.
const DIMPLE_DEPTH = 0.15;
const DIMPLE_DEPTH_SPREAD = 0.3; // +/-30%
const DIMPLE_RADIUS = 0.095; // world half-width of the pit -- wide enough to read as a finger-press, independent of grid resolution
const DIMPLE_RADIUS_OVAL = 0.3; // +/-30% radius anisotropy (x vs z) -> "slightly oval", not circular
const DIMPLE_RIM_HARMONIC1 = 0.22; // 1st-harmonic rim-radius wobble (fraction of radius)
const DIMPLE_RIM_HARMONIC2 = 0.16; // 2nd-harmonic -> uneven rim, not a smooth ellipse (CRIB: machine-punched-circle rejection)
// [3rd surface-pass revision, team-lead final diagnosis] Fraction of the radius that stays a
// flat, undisplaced floor -- the remaining (1-ratio) band carries the ENTIRE depth transition,
// concentrating the wall slope into a narrow "cup" rim instead of spreading it across the whole
// pit (see the falloff comment in buildSlabGeometry for the diagnosis).
const DIMPLE_FLAT_RATIO = 0.5;
const DIMPLE_COLS = 5;
const DIMPLE_ROWS = 3;

// --- Surface grain -- authored (not jittered) low+high frequency dough undulation across the
// WHOLE top face, per team-lead quality review: "tri를 3배 올렸는데 대부분 실루엣 조밀화에
// 쓰였다 -- 표면 질감이 안 보인다". A sum of a few smooth sine waves is a coherent, C-infinity
// authoring function (CRIB: "디테일에는 지터를 걸지 마라... authoring 파라미터로") -- unlike
// per-vertex random jitter, it stays smooth under computeVertexNormals() instead of shredding.
// Uses the 28x20 grid's existing vertices (free -- no added triangles). Applied to interior
// top-face vertices only, never the boundary/rim (team-lead: side-wall brightness is a separate
// lighting-rig issue, do not touch geometry there).
const GRAIN_LOW_FREQ_X = 7.3; // ~7 broad doughy swells across the long axis
const GRAIN_LOW_FREQ_Z = 5.1;
const GRAIN_LOW_AMP = 0.026; // doubled from the first quality-round attempt -- 0.013 was invisible under near-top-down light (verified via zoomed crop)
// Fine crumb-scale ripple -- lowered from an initial 33/24 (wavelength ~0.06, SHORTER than the
// 28x20 grid's ~0.071 spacing -- guaranteed aliasing, verified by a zoomed crop showing zero
// visible texture despite a nonzero amplitude). At the 44x32 grid's ~0.045 spacing, 15/11 gives
// a ~0.13 wavelength -- about 3 samples per cycle, the minimum for a smooth (non-aliased) ripple.
const GRAIN_HIGH_FREQ_X = 15.0;
const GRAIN_HIGH_FREQ_Z = 11.0;
const GRAIN_HIGH_AMP = 0.009;

// --- Olive chunks -- object-sculpt-spec.json repetitionSystems.olive-scatter -------------------
const OLIVE_ON_DIMPLE = 7;
const OLIVE_BESIDE = 3;
const OLIVE_SHARD = 1;
const POOL_COUNT = 3; // dimples that get an oil pool in material-pass; the rest stay empty finger marks
// [surface-pass revision, team-lead quality round] Re-measured via connected-component analysis
// on the top-down reference (a loose color threshold undercounted true chunk extent, missing the
// lit highlight portion of each chunk): 11 chunks average bbox diagonal ~83px against a ~922px
// slab width -> ratio ~0.090, i.e. diameter ~0.18 of the 2.0-unit slab width -> radius ~0.09.
// The earlier OLIVE_R=0.075 (ratio 0.075) undershot that by ~20% in radius / ~35% in area --
// team-lead: "레퍼런스는 크고 도톰한 반달 조각... 우리는 작은 알갱이다". Count is unchanged
// (team-lead: "개수는 지금이 맞다 -- 키우면서 개수를 늘리지 마라").
const OLIVE_R = 0.095;
const OLIVE_H = 0.1;
const OLIVE_SINK = 0.014; // embed depth -- "half-sunken, dough hugging its edges"
const SHARD_SINK = 0.009; // laid-over shard is thin, sinks less
const RING_WOBBLE = 0.13; // per-segment radius wobble, shared across rings (independent-per-ring waists the chunk)
const RING_Y_WOBBLE = 0.2;
const APEX_WOBBLE = 0.16;
const NOTCH_CHANCE = 0.45; // fewer than half -- a notch on every chunk would be its own tell
const NOTCH_MIN = 0.26;
const NOTCH_RANGE = 0.2;
const NOTCH_DROP = 0.6;
// World-space polar offsets for "beside a dimple" placement (see buildFocacciaOliveFleshForm) --
// replaces the old grid-index ring offsets, which silently shrank in world units whenever NX/NZ
// changed for tri-budget/surface-grain reasons.
const BESIDE_DIST_MIN = 0.13; // world units from the host dimple's center
const BESIDE_DIST_MAX = 0.22;
const BESIDE_MIN_SEP_FROM_DIMPLE = 0.09; // don't land inside another dimple's pit
const BESIDE_MIN_SEP = 0.13; // don't overlap another beside chunk

// --- Basecolor texture (crust + oil-pool bands baked into ONE canvas, types.ts section 9) -----
// The 2-mesh budget (types.ts section 1) is spent on crust+oil (shared texture, one mesh) vs
// olive (separate solid-color mesh) -- three logical colors reduced to two runtime materials.
const TEX_SIZE = 256;
const HALO_R = 0.11; // faint shadow ring around every dimple -- geometry carries the real relief, texture only assists
const POOL_R = 0.058;
const EDGE_UV = 0.02; // wall/bottom vertices pinned here so the top-face paint never bleeds onto them

type Vec2 = readonly [number, number];
type Dimple = { x: number; z: number; pool: boolean; scale: number };
type Topping = { x: number; z: number; kind: 'rosemary' | 'salt' };
type ChunkShape = {
  seg: number;
  radius: number;
  height: number;
  // Shoulder profile -- 4 intermediate rings (ra/ha .. rd/hd) between the base neck ring and the
  // apex pole, up from the pre-redo build's 2 rings. CRIB variant tri-budget lesson: more
  // shoulder resolution is where the tri budget should go (a rounder, better-defined chunk),
  // not more chunks (that reads as clutter -- CRIB readability-gate "count down, size up").
  ra: number;
  ha: number;
  rb: number;
  hb: number;
  rc: number;
  hc: number;
  rd: number;
  hd: number;
  apexH: number;
  rootH: number;
  lean: number;
  leanDir: number;
  notch: number;
  notchSeg: number;
  notchWide: boolean;
  sink: number;
  tilt: number;
};

function perimeterLoop(): Vec2[] {
  const loop: Vec2[] = [];
  for (let j = 0; j < NZ; j++) loop.push([0, j]);
  for (let i = 0; i < NX; i++) loop.push([i, NZ]);
  for (let j = NZ; j > 0; j--) loop.push([NX, j]);
  for (let i = NX; i > 0; i--) loop.push([i, 0]);
  return loop;
}

function outwardNormal(i: number, j: number): Vec2 {
  const nx = i === 0 ? -1 : i === NX ? 1 : 0;
  const nz = j === 0 ? -1 : j === NZ ? 1 : 0;
  if (nx !== 0 && nz !== 0) {
    const inv = 1 / Math.SQRT2;
    return [nx * inv, nz * inv];
  }
  return [nx, nz];
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let k = items.length - 1; k > 0; k--) {
    const m = Math.floor(rng() * (k + 1));
    [items[k], items[m]] = [items[m], items[k]];
  }
  return items;
}

function gridIndex(i: number, j: number): number {
  return i * (NZ + 1) + j;
}

function cellX(i: number): number {
  return (i / NX - 0.5) * 2 * HALF_X;
}

function cellZ(j: number): number {
  return (j / NZ - 0.5) * 2 * HALF_Z;
}

function chebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

/**
 * World-space Chebyshev distance between two grid cells -- [surface-pass revision, team-lead
 * quality round]. `chebyshev()` above measures GRID-INDEX distance; every minimum-separation
 * reject in this file used to be threshold-ed on that (e.g. "< 2 cells apart"), which is the
 * same grid-resolution coupling bug as the old dimple/edge mechanics: raising NX/NZ 28x20->44x32
 * for the surface grain silently HALVED what "2 cells" means in world units, so dimples/toppings
 * that used to be comfortably separated could now land much closer together. All placement
 * separation below is world-space so a future resolution change cannot silently break it again.
 */
function worldChebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(cellX(a[0]) - cellX(b[0])), Math.abs(cellZ(a[1]) - cellZ(b[1])));
}

const DIMPLE_MIN_SEP = 0.16; // world units -- minimum center-to-center dimple spacing (independent of grid resolution)
const TOPPING_MIN_SEP_FROM_DIMPLE = 0.09; // world units
const TOPPING_MIN_SEP = 0.08; // world units, topping-to-topping

/**
 * Finger-dimple placement -- stratified sampling. The slab is split into DIMPLE_COLS x
 * DIMPLE_ROWS regions, one candidate cell drawn per region so the layout is irregular but
 * evenly spread across the whole top face (neither a fixed lattice nor unconstrained random,
 * which clumps -- object-sculpt-spec.json repetitionSystems.dimple-field.distribution).
 */
function pickDimples(rng: () => number): Vec2[] {
  const iLo = 2;
  const iSpan = NX - 3 - iLo;
  const jLo = 2;
  const jSpan = NZ - 3 + 1 - jLo;
  const regions: Vec2[] = [];
  for (let c = 0; c < DIMPLE_COLS; c++) {
    for (let r = 0; r < DIMPLE_ROWS; r++) regions.push([c, r]);
  }
  shuffle(regions, rng);
  const picked: Vec2[] = [];
  for (const [c, r] of regions) {
    if (picked.length >= DIMPLE_COUNT) break;
    const i = iLo + Math.floor(((c + rng()) * (iSpan + 1)) / DIMPLE_COLS);
    const j = jLo + Math.floor(((r + rng()) * (jSpan + 1)) / DIMPLE_ROWS);
    const cell: Vec2 = [Math.min(i, NX - 2), Math.min(j, NZ - 2)];
    if (picked.some((p) => worldChebyshev(p, cell) < DIMPLE_MIN_SEP)) continue;
    picked.push(cell);
  }
  return picked;
}

/**
 * Farthest-point sampling order (CRIB: "클러스터 씨앗은 최원점 샘플링") -- returns `cells`
 * reordered so that each successive cell maximizes its minimum distance to the ones already
 * placed. Taking a prefix of this order gives a well-spread subset with no distance threshold to
 * mis-tune (a fixed-threshold reject either clumps below it or fails to find enough seeds above
 * it, in opposite directions).
 */
function farthestPointOrder(cells: Vec2[], rng: () => number): Vec2[] {
  const remaining = cells.slice();
  const start = Math.floor(rng() * remaining.length);
  const order = [remaining.splice(start, 1)[0]];
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let r = 0; r < remaining.length; r++) {
      let minDist = Infinity;
      for (const placed of order) minDist = Math.min(minDist, chebyshev(remaining[r], placed));
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = r;
      }
    }
    order.push(remaining.splice(bestIdx, 1)[0]);
  }
  return order;
}

/** Dough-rise topping cells -- avoid dimples and their immediate neighbors (a bump on a dimple's rim reads as floating). */
function pickToppingCells(rng: () => number, dimples: Vec2[]): Vec2[] {
  const candidates: Vec2[] = [];
  for (let i = 1; i < NX; i++) {
    for (let j = 1; j < NZ; j++) {
      const cell: Vec2 = [i, j];
      if (dimples.some((d) => worldChebyshev(d, cell) <= TOPPING_MIN_SEP_FROM_DIMPLE)) continue;
      candidates.push(cell);
    }
  }
  shuffle(candidates, rng);
  const picked: Vec2[] = [];
  for (const cell of candidates) {
    if (picked.length >= TOPPING_COUNT) break;
    if (picked.some((p) => worldChebyshev(p, cell) <= TOPPING_MIN_SEP)) continue;
    picked.push(cell);
  }
  return picked;
}

/**
 * Smooth-normal bake -- 2026-08-30 finish contract (CRIB Sec. finish). computeVertexNormals()
 * while indexed makes shared vertices average their neighbors' normals; unlike the deprecated
 * facet() look, smooth shading needs no per-triangle vertex splitting (there is no flat-shading
 * or vertex-paint boundary inside either the slab or a single chunk), so the geometry STAYS
 * indexed -- CRIB measured this at ~1/3 the GLB bytes of toNonIndexed() for the same triangle
 * count (non-indexed unrolls every shared vertex to 3 duplicates per triangle). Only call
 * toNonIndexed() where a later step needs to split triangles by material/region.
 */
function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  return g;
}

/**
 * Slab shell -- top grid + duplicated wall-top ring + perimeter wall + bottom fan. Triangle
 * order is top -> wall -> bottom so topTriCount can split UVs later.
 *
 * [surface-pass revision, team-lead quality round] Dimples are now a world-space radial falloff
 * (cosine bump) with an elliptical radius plus a 2-harmonic angular wobble on the rim -- NOT the
 * old fixed-neighbor partial-drop, which (a) coupled the pit's visible width to grid resolution
 * (raising NX/NZ for tri budget silently shrank every dimple to a near-invisible pinprick, the
 * root cause of "딤플이 얕다") and (b) only ever touched exactly 5 vertices, so the rim shape was
 * a diamond, not an organic press-mark. The harmonic wobble on the effective radius is what makes
 * each dimple "individually oval, uneven rim" (CRIB: a uniform circular drop reads as a
 * machine-punched stamp, not a finger mark) -- it is a smooth authored function, not jitter.
 */
function buildSlabGeometry(
  rng: () => number,
  dimples: Vec2[],
): { geometry: THREE.BufferGeometry; topTriCount: number; depth: Map<string, number>; toppings: Topping[] } {
  const positions: number[] = new Array((NX + 1) * (NZ + 1) * 3).fill(0);
  const loop = perimeterLoop();

  const edgePush = new Map<string, number>();
  const edgeHeightNoiseTop = new Map<string, number>();
  const edgeHeightNoiseBottom = new Map<string, number>();
  // 3 low-order harmonics of the boundary angle, each with its own random phase -- a continuous
  // function of angle, so raising vertex density along the perimeter only samples it more finely
  // instead of adding new independent high-frequency noise (see EDGE_WOBBLE_AMP_* comment above).
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const phase3 = rng() * Math.PI * 2;
  const heightPhase1 = rng() * Math.PI * 2;
  const heightPhase2 = rng() * Math.PI * 2;
  for (const [i, j] of loop) {
    const key = `${i},${j}`;
    const angle = Math.atan2(cellZ(j), cellX(i));
    edgePush.set(
      key,
      EDGE_ROUND_AMP * Math.sin(2 * angle + phase1) +
        EDGE_WOBBLE_AMP_1 * Math.sin(5 * angle + phase2) +
        EDGE_WOBBLE_AMP_2 * Math.sin(9 * angle + phase3),
    );
    // Height wobble stays a small smooth function too (same aliasing risk in principle, though
    // amplitude is tiny); bottom ring is never visible above the horizon so it reuses the same
    // formula without a separate calibration pass.
    const heightWobble = 0.01 * THICK * Math.sin(3 * angle + heightPhase1) + 0.01 * THICK * Math.sin(7 * angle + heightPhase2);
    edgeHeightNoiseTop.set(key, heightWobble);
    edgeHeightNoiseBottom.set(key, heightWobble);
  }

  const depth = new Map<string, number>(); // per-dimple depth (keyed by its own cell) -- feeds the texture halo scale
  const drop = new Map<string, number>(); // per-vertex accumulated recess (max across overlapping dimples)
  const dimpleFlatness = new Map<string, number>(); // 0..1, tracks the winning falloff value at each vertex -- used to suppress surface grain inside a dimple (a pressed dimple has a compressed, smoother floor than the surrounding crumb)
  for (const [i, j] of dimples) {
    const d = DIMPLE_DEPTH * (1 + (rng() - 0.5) * 2 * DIMPLE_DEPTH_SPREAD);
    depth.set(`${i},${j}`, d);
    const cx = cellX(i);
    const cz = cellZ(j);
    const radiusX = DIMPLE_RADIUS * (1 + (rng() - 0.5) * 2 * DIMPLE_RADIUS_OVAL);
    const radiusZ = DIMPLE_RADIUS * (1 + (rng() - 0.5) * 2 * DIMPLE_RADIUS_OVAL);
    const rimPhase1 = rng() * Math.PI * 2;
    const rimPhase2 = rng() * Math.PI * 2;
    // Bounding index box around the dimple, sized generously (harmonics can push the effective
    // radius up to 1 + H1 + H2 beyond the base ellipse) so no affected vertex is missed.
    const maxRadius = Math.max(radiusX, radiusZ) * (1 + DIMPLE_RIM_HARMONIC1 + DIMPLE_RIM_HARMONIC2);
    const iSpan = Math.ceil(maxRadius / CELL_X) + 1;
    const jSpan = Math.ceil(maxRadius / CELL_Z) + 1;
    const iLo2 = Math.max(1, i - iSpan);
    const iHi2 = Math.min(NX - 1, i + iSpan);
    const jLo2 = Math.max(1, j - jSpan);
    const jHi2 = Math.min(NZ - 1, j + jSpan);
    for (let vi = iLo2; vi <= iHi2; vi++) {
      for (let vj = jLo2; vj <= jHi2; vj++) {
        const dx = cellX(vi) - cx;
        const dz = cellZ(vj) - cz;
        const theta = Math.atan2(dz, dx);
        const rimMod = 1 + DIMPLE_RIM_HARMONIC1 * Math.cos(theta + rimPhase1) + DIMPLE_RIM_HARMONIC2 * Math.cos(2 * theta + rimPhase2);
        const normDist = Math.sqrt((dx / radiusX) ** 2 + (dz / radiusZ) ** 2) / Math.max(rimMod, 0.35);
        if (normDist >= 1) continue;
        // [3rd surface-pass revision, team-lead final diagnosis] The old falloff was a full-width
        // cosine bump (1 at center -> 0 at rim, smoothly, over the WHOLE radius) -- diagnosed via
        // A/B: the same geometry read clearly at azimuth-90/top-down turntable angles but nearly
        // vanished at the harness's fixed default review camera, which sits close to the key
        // light's direction -- a smooth, spread-out normal change has no single angle where its
        // shading gradient is guaranteed strong, so a near-light-aligned camera sees almost no
        // contrast. A real finger-press dimple is closer to a "cup": a flattened, compressed
        // floor (DIMPLE_FLAT_RATIO of the radius) with the whole depth change concentrated into a
        // narrow band near the rim -- this doubles the LOCAL wall slope for the same depth/radius
        // (CRIB's angle number was never wrong, it was just spread across the entire pit instead
        // of concentrated where a rim needs to read from any camera angle).
        const falloff = normDist < DIMPLE_FLAT_RATIO ? 1 : 0.5 * (1 + Math.cos((Math.PI * (normDist - DIMPLE_FLAT_RATIO)) / (1 - DIMPLE_FLAT_RATIO)));
        const key = `${vi},${vj}`;
        const existing = drop.get(key) ?? 0;
        if (d * falloff > existing) {
          drop.set(key, d * falloff);
          dimpleFlatness.set(key, falloff);
        }
      }
    }
  }

  // Authored dough-surface grain (see constants block) -- a fixed set of phases drawn once, then
  // evaluated as a pure function of (x, z) per vertex. Smooth and coherent, unlike per-vertex jitter.
  const grainPhaseX1 = rng() * Math.PI * 2;
  const grainPhaseZ1 = rng() * Math.PI * 2;
  const grainPhaseX2 = rng() * Math.PI * 2;
  const grainPhaseZ2 = rng() * Math.PI * 2;

  const toppingCells = pickToppingCells(rng, dimples);
  // [surface-pass revision, team-lead quality round] Half rosemary (thin green sliver) / half
  // salt (tiny white speck), painted into the SAME basecolor canvas as crust+oil in paintCrust()
  // below -- no third material, per team-lead's atlas suggestion (scone--choco-chip-v2's 4-
  // quadrant atlas precedent generalizes to "just paint more into the one canvas you already
  // have"). These are the same grid cells that already carry the raised TOPPING_BUMP geometry.
  const toppings: Topping[] = toppingCells.map(([i, j], k) => ({
    x: cellX(i),
    z: cellZ(j),
    kind: k % 2 === 0 ? 'rosemary' : 'salt',
  }));
  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j <= NZ; j++) {
      const idx = gridIndex(i, j);
      let x = cellX(i);
      let z = cellZ(j);
      let y = TOP_Y;
      const isBoundary = i === 0 || i === NX || j === 0 || j === NZ;
      if (isBoundary) {
        const key = `${i},${j}`;
        const [nx, nz] = outwardNormal(i, j);
        const push = edgePush.get(key) ?? 0;
        x += nx * push;
        z += nz * push;
        y += edgeHeightNoiseTop.get(key) ?? 0;
      } else {
        y -= drop.get(`${i},${j}`) ?? 0;
        // Suppress grain inside a dimple's footprint (dimpleFlatness ~1 at the compressed floor,
        // ~0 outside any pit) -- [3rd surface-pass revision] a physically-motivated secondary fix
        // alongside the cup-profile falloff: a finger-pressed dimple's floor is compressed
        // smoother than the surrounding crumb, and the crumb-scale grain was also softening the
        // pit's own shading signal by perturbing the same vertices the falloff needs to read clearly.
        const grainScale = 1 - (dimpleFlatness.get(`${i},${j}`) ?? 0);
        y +=
          grainScale *
          (GRAIN_LOW_AMP * Math.sin(x * GRAIN_LOW_FREQ_X + grainPhaseX1) * Math.sin(z * GRAIN_LOW_FREQ_Z + grainPhaseZ1) +
            GRAIN_HIGH_AMP * Math.sin(x * GRAIN_HIGH_FREQ_X + grainPhaseX2) * Math.cos(z * GRAIN_HIGH_FREQ_Z + grainPhaseZ2));
      }
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
    }
  }
  for (const [i, j] of toppingCells) positions[gridIndex(i, j) * 3 + 1] += TOPPING_BUMP;

  // Wall-top ring -- a duplicate of the top-face perimeter, used ONLY by the side wall. Sharing
  // one vertex between top face and wall under smooth normals averages to a 45-degree normal and
  // chamfers the whole rim into a cushion (CRIB finish-contract rim pitfall).
  const wallTopStart = (NX + 1) * (NZ + 1);
  for (const [i, j] of loop) {
    const g = gridIndex(i, j);
    positions.push(positions[g * 3], positions[g * 3 + 1], positions[g * 3 + 2]);
  }
  const bottomRingStart = wallTopStart + loop.length;
  const bottomCenterIndex = bottomRingStart + loop.length;
  for (const [i, j] of loop) {
    const key = `${i},${j}`;
    const [nx, nz] = outwardNormal(i, j);
    const push = edgePush.get(key) ?? 0;
    positions.push(cellX(i) + nx * push, -TOP_Y + (edgeHeightNoiseBottom.get(key) ?? 0), cellZ(j) + nz * push);
  }
  positions.push(0, -TOP_Y, 0);

  const index: number[] = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const a = gridIndex(i, j);
      const b = gridIndex(i + 1, j);
      const c = gridIndex(i, j + 1);
      const d = gridIndex(i + 1, j + 1);
      index.push(a, c, b);
      index.push(c, d, b);
    }
  }
  const topTriCount = index.length / 3;
  for (let k = 0; k < loop.length; k++) {
    const k1 = (k + 1) % loop.length;
    index.push(wallTopStart + k, bottomRingStart + k, wallTopStart + k1);
    index.push(wallTopStart + k1, bottomRingStart + k, bottomRingStart + k1);
  }
  for (let k = 0; k < loop.length; k++) {
    const k1 = (k + 1) % loop.length;
    index.push(bottomCenterIndex, bottomRingStart + k1, bottomRingStart + k);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // Jitter the slab shell only -- CRIB: jitter on the small olive-chunk geometry shreds or
  // flattens it (measured in the pre-redo build's A/B render test); chunks get zero jitter below.
  jitterVertices(geometry, rng, JITTER_AMP);
  // Re-sync the duplicated wall-top ring to the jittered top-face coordinates -- if jitter moves
  // the original and the copy independently, the rim seam cracks.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < loop.length; k++) {
    const [i, j] = loop[k];
    const g = gridIndex(i, j);
    pos.setXYZ(wallTopStart + k, pos.getX(g), pos.getY(g), pos.getZ(g));
  }
  pos.needsUpdate = true;
  return { geometry, topTriCount, depth, toppings };
}

/**
 * Olive-chunk shape draw -- all irregularity lives here (authoring parameters), not in post-hoc
 * jitter (object-sculpt-spec.json component olive-chunk, deformationStack chunk-authoring-
 * irregularity). Exposure/height ratio kept <=0.5 ("embedded", not "grown out of the surface").
 */
function rollShape(rng: () => number, shard: boolean): ChunkShape {
  const leanDir = rng() * Math.PI * 2;
  if (shard) {
    return {
      seg: 12 + Math.floor(rng() * 5), // 12-16
      radius: OLIVE_R * (1.1 + rng() * 0.2),
      height: OLIVE_H * (0.42 + rng() * 0.14),
      ra: 0.9 + rng() * 0.06,
      ha: 0.18 + rng() * 0.08,
      rb: 0.74 + rng() * 0.1,
      hb: 0.36 + rng() * 0.1,
      rc: 0.52 + rng() * 0.12,
      hc: 0.58 + rng() * 0.1,
      rd: 0.24 + rng() * 0.12,
      hd: 0.8 + rng() * 0.08,
      apexH: 0.9 + rng() * 0.1,
      rootH: -(0.28 + rng() * 0.12),
      lean: 0.28 + rng() * 0.2,
      leanDir,
      notch: rng() < NOTCH_CHANCE ? NOTCH_MIN + rng() * NOTCH_RANGE : 0,
      notchSeg: rng(),
      notchWide: rng() < 0.5,
      sink: SHARD_SINK,
      tilt: 0.06,
    };
  }
  return {
    seg: 12 + Math.floor(rng() * 5), // 12-16
    radius: OLIVE_R * (0.85 + rng() * 0.3),
    height: OLIVE_H * (0.85 + rng() * 0.27),
    ra: 0.88 + rng() * 0.1,
    ha: 0.16 + rng() * 0.1,
    rb: 0.72 + rng() * 0.14,
    hb: 0.36 + rng() * 0.12,
    rc: 0.5 + rng() * 0.16,
    hc: 0.58 + rng() * 0.12,
    rd: 0.24 + rng() * 0.14,
    hd: 0.8 + rng() * 0.1,
    apexH: 0.88 + rng() * 0.12,
    rootH: -(0.3 + rng() * 0.16),
    lean: rng() * 0.32,
    leanDir,
    notch: rng() < NOTCH_CHANCE ? NOTCH_MIN + rng() * NOTCH_RANGE : 0,
    notchSeg: rng(),
    notchWide: rng() < 0.5,
    sink: OLIVE_SINK,
    tilt: 0.12,
  };
}

function clampInside(v: number, half: number, reach: number): number {
  const lim = Math.max(0, half - RIM_INSET - reach);
  return Math.max(-lim, Math.min(lim, v));
}

/**
 * One olive chunk -- manually-ringed revolved shell (buildRevolvedShell; THREE.LatheGeometry is
 * banned, its phi-seam duplicate column tears under jitter). 5 profile rings (neck + 4 shoulder
 * rings between the two poles) give a rounder, better-shouldered silhouette than a single cone
 * tip -- CRIB variant tri-budget lesson: this is the deliberate spend of the 3000-5000 tri
 * target on the feature that most needed it. seg 12-16 (not 6-9) so the polygon facets don't
 * read as gravel at the ~44px on-screen size a 0.17-diameter chunk occupies in a 512px render.
 */
function buildChunk(rng: () => number, shape: ChunkShape): THREE.BufferGeometry {
  // 7-point profile (root pole, neck ring, 4 shoulder rings, apex pole) -- CRIB variant
  // tri-budget lesson: this is where the extra triangle budget buys a rounder, better-shouldered
  // chunk instead of a low-poly cone-with-two-rings.
  const profile: readonly (readonly [number, number])[] = [
    [0, shape.rootH],
    [1, 0],
    [shape.ra, shape.ha],
    [shape.rb, shape.hb],
    [shape.rc, shape.hc],
    [shape.rd, shape.hd],
    [0, shape.apexH],
  ];
  const { geometry, ringStart } = buildRevolvedShell(profile, shape.seg, shape.height, () => [shape.radius, shape.radius]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  // One shared per-segment scale across every ring -- an independent draw per ring waists the
  // chunk into a wrong hourglass shape instead of an irregular but coherent silhouette.
  const segScale: number[] = [];
  for (let s = 0; s < shape.seg; s++) segScale.push(1 + (rng() - 0.5) * 2 * RING_WOBBLE);
  const lx = Math.cos(shape.leanDir) * shape.lean * shape.radius;
  const lz = Math.sin(shape.leanDir) * shape.lean * shape.radius;
  for (let ri = 1; ri < profile.length - 1; ri++) {
    const ring = ringStart[ri];
    const f = profile[ri][1] / shape.apexH;
    for (let s = 0; s < shape.seg; s++) {
      const k = ring + s;
      pos.setX(k, pos.getX(k) * segScale[s] + lx * f);
      pos.setZ(k, pos.getZ(k) * segScale[s] + lz * f);
      if (ri >= 2) pos.setY(k, pos.getY(k) + (rng() - 0.5) * 2 * shape.height * RING_Y_WOBBLE);
    }
  }
  // Notch -- pull one or two segments of the top two rings inward/down, never drag the profile's
  // pole below its neighbor ring (that flips the normal, per CRIB's non-monotonic-profile rule).
  // Reads as a pit-hole/fracture mark instead of the smooth dome the user rejected in v2/v3.
  if (shape.notch > 0) {
    const s0 = Math.floor(shape.notchSeg * shape.seg) % shape.seg;
    const cut = shape.notchWide ? [s0, (s0 + 1) % shape.seg] : [s0];
    for (const [ri, w] of [
      [5, 1],
      [4, 0.45],
    ] as const) {
      const ring = ringStart[ri];
      for (const sIdx of cut) {
        const k = ring + sIdx;
        const f = 1 - shape.notch * w;
        pos.setX(k, pos.getX(k) * f);
        pos.setZ(k, pos.getZ(k) * f);
        pos.setY(k, pos.getY(k) - shape.notch * w * shape.height * NOTCH_DROP);
      }
    }
  }
  const apex = ringStart[profile.length - 1];
  pos.setX(apex, pos.getX(apex) + lx + (rng() - 0.5) * 2 * shape.radius * APEX_WOBBLE);
  pos.setZ(apex, pos.getZ(apex) + lz + (rng() - 0.5) * 2 * shape.radius * APEX_WOBBLE);
  pos.needsUpdate = true;
  const baked = smooth(geometry);
  uvTopPlanar(baked); // solid color; UV only satisfies mergeByMaterial's attribute-consistency requirement
  return baked;
}

function addChunk(group: THREE.Group, rng: () => number, mat: THREE.Material, x: number, z: number, shard: boolean): void {
  const shape = rollShape(rng, shard);
  const geo = buildChunk(rng, shape);
  const reach = shape.radius * (1 + RING_WOBBLE + shape.lean);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(clampInside(x, HALF_X, reach), TOP_Y - shape.sink, clampInside(z, HALF_Z, reach));
  mesh.rotation.set((rng() - 0.5) * 2 * shape.tilt, rng() * Math.PI * 2, (rng() - 0.5) * 2 * shape.tilt);
  group.add(mesh);
}

function rgba(hex: number, alpha: number): string {
  return `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff}, ${alpha})`;
}

// Rosemary/salt paint -- [surface-pass revision, team-lead quality round]. v4 reference has a
// few green rosemary slivers and white salt flecks, which also act as small bright/cool points
// that visually separate the olive clusters (team-lead's earlier observation). Painted into the
// SAME basecolor canvas as crust+oil so the 2-material budget is untouched (types.ts section 1) --
// scone--choco-chip-v2's 4-quadrant atlas established the "more colors, one canvas" precedent;
// this is the simpler freeform-paint version of the same idea (no quadrant grid needed since the
// canvas is already procedurally painted, not UV-atlas-constrained).
const ROSEMARY_COLOR = 0x4a6b3a;
const SALT_COLOR = 0xfaf6ec;

/**
 * [PASS: material-pass] Crust basecolor -- gold field + a faint dimple-shadow halo + an oil-pool
 * band inside the dimples marked pool=true + rosemary/salt flecks. Coordinates come back from the
 * SAME bbox uvTopPlanar already used for the mesh's UV attribute, so the paint tracks each
 * dimple's/topping's true post-jitter world position instead of assuming a fixed grid
 * (object-sculpt-spec.json material crust-top localOverrides.dimple-triangle-bucket). Canvas y is
 * flipped (1-v) because GLTFExporter bakes flipY into the exported image, matching the runtime
 * roundtrip.
 */
function paintCrust(dimples: Dimple[], toppings: Topping[], box: THREE.Box3, rng: () => number): THREE.CanvasTexture {
  const sx = Math.max(box.max.x - box.min.x, 1e-6);
  const sz = Math.max(box.max.z - box.min.z, 1e-6);
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    ctx.fillStyle = rgba(TOP_COLOR, 1);
    ctx.fillRect(0, 0, size, size);
    const worldToPx = (x: number, z: number): [number, number] => [((x - box.min.x) / sx) * size, (1 - (z - box.min.z) / sz) * size];
    const band = (d: Dimple, worldR: number, alpha: number) => {
      const [cx, cy] = worldToPx(d.x, d.z);
      ctx.beginPath();
      ctx.ellipse(cx, cy, (worldR / sx) * size, (worldR / sz) * size, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(OIL_COLOR, alpha);
      ctx.fill();
    };
    for (const d of dimples) band(d, HALO_R * d.scale, 0.13);
    for (const d of dimples) if (d.pool) band(d, POOL_R * d.scale, 1);
    for (const t of toppings) {
      const [cx, cy] = worldToPx(t.x, t.z);
      if (t.kind === 'salt') {
        // A tiny cluster of 2-3 near-white specks per topping cell, not one big dot -- "a small pinch of salt flakes".
        const flakes = 2 + Math.floor(rng() * 2);
        for (let f = 0; f < flakes; f++) {
          const fx = cx + (rng() - 0.5) * 10;
          const fy = cy + (rng() - 0.5) * 10;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.1 + rng() * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = rgba(SALT_COLOR, 0.85);
          ctx.fill();
        }
      } else {
        // A short 2-segment sliver at a random angle -- "a few small rosemary leaves".
        const ang = rng() * Math.PI * 2;
        const len = 7 + rng() * 4;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.strokeStyle = rgba(ROSEMARY_COLOR, 0.9);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(len / 2, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
  });
}

/** Shared state so material/surface passes can paint the slab and inspect placement without re-deriving it. */
export type FocacciaOliveFleshBuild = {
  group: THREE.Group; // olive-chunk meshes only -- caller adds the slab mesh once its material is ready
  slabGeometry: THREE.BufferGeometry;
  dimples: Dimple[];
  toppings: Topping[];
  slabTopTriCount: number;
};

export function buildFocacciaOliveFleshForm(rng: () => number, oliveMat: THREE.Material): FocacciaOliveFleshBuild {
  const group = new THREE.Group();

  const dimpleCells = pickDimples(rng);
  const { geometry, topTriCount, depth, toppings } = buildSlabGeometry(rng, dimpleCells);
  const slab = smooth(geometry);
  uvTopPlanar(slab);

  // 7 of 13 dimples host a seated olive chunk. Picked by farthest-point sampling (CRIB: a
  // distance-threshold reject clumps on one side or the other depending on the threshold; FPS
  // has no threshold to get wrong) so the hosts themselves spread across the whole top face --
  // form-refinement review measured a plain shuffle().slice() landing all 7 in one corner,
  // scoring olive-cluster-gaps 0.55 against the 0.65 gate. "beside" chunks then cluster locally
  // around each spread-out host, giving loose casual clusters WITHOUT one dominant clump.
  const hostOrder = farthestPointOrder(dimpleCells, rng);
  const hosts = hostOrder.slice(0, OLIVE_ON_DIMPLE);
  const rest = shuffle(hostOrder.slice(OLIVE_ON_DIMPLE), rng); // which non-host dimples get an oil pool vs stay plain -- randomized independently of the FPS spread order
  const order = [...hosts, ...rest];
  const dimples: Dimple[] = order.map((cell, k) => ({
    x: cellX(cell[0]),
    z: cellZ(cell[1]),
    pool: k >= OLIVE_ON_DIMPLE && k < OLIVE_ON_DIMPLE + POOL_COUNT,
    scale: (depth.get(`${cell[0]},${cell[1]}`) ?? DIMPLE_DEPTH) / DIMPLE_DEPTH,
  }));

  for (const [i, j] of hosts) {
    const x = cellX(i) + (rng() - 0.5) * 2 * CELL_X * 0.25;
    const z = cellZ(j) + (rng() - 0.5) * 2 * CELL_Z * 0.25;
    addChunk(group, rng, oliveMat, x, z, false);
  }

  // Beside-dimple chunks + one laid-over shard cluster around the seated hosts -- world-space
  // polar offset from each host's world position (NOT grid-index rings; [surface-pass revision]
  // fixed grid-index offsets like [2,0] silently shrink in world units whenever NX/NZ changes,
  // which is exactly what happened when the grid rose for the surface grain). Rejection-samples
  // against every dimple (avoid burying a chunk in another finger-press) and every other beside
  // pick (avoid two chunks overlapping) -- "loose casual clusters that leave quiet plain areas".
  const besideWanted = OLIVE_BESIDE + OLIVE_SHARD;
  const hostWorld: Vec2[] = hosts.map(([i, j]) => [cellX(i), cellZ(j)]);
  const dimpleWorld: Vec2[] = dimpleCells.map(([i, j]) => [cellX(i), cellZ(j)]);
  const besideWorld: Vec2[] = [];
  for (let attempt = 0; besideWorld.length < besideWanted && attempt < 500; attempt++) {
    const host = hostWorld[Math.floor(rng() * hostWorld.length)];
    const ang = rng() * Math.PI * 2;
    const dist = BESIDE_DIST_MIN + rng() * (BESIDE_DIST_MAX - BESIDE_DIST_MIN);
    const candidate: Vec2 = [host[0] + Math.cos(ang) * dist, host[1] + Math.sin(ang) * dist];
    if (Math.abs(candidate[0]) > HALF_X - RIM_INSET - 0.12 || Math.abs(candidate[1]) > HALF_Z - RIM_INSET - 0.12) continue;
    // NOTE: candidate/dimpleWorld/besideWorld already hold WORLD coordinates (not grid indices),
    // so the plain chebyshev() (no cellX/cellZ conversion) is correct here -- worldChebyshev()
    // is only for comparing two GRID-INDEX pairs.
    if (dimpleWorld.some((d) => chebyshev(d, candidate) < BESIDE_MIN_SEP_FROM_DIMPLE)) continue;
    if (besideWorld.some((p) => chebyshev(p, candidate) < BESIDE_MIN_SEP)) continue;
    besideWorld.push(candidate);
  }
  for (let k = 0; k < besideWorld.length; k++) {
    const [x, z] = besideWorld[k];
    addChunk(group, rng, oliveMat, x, z, k >= OLIVE_BESIDE);
  }

  return { group, slabGeometry: slab, dimples, toppings, slabTopTriCount: topTriCount };
}

/**
 * [PASS: material-pass / surface-pass] Wires the final crust+oil basecolor texture and olive
 * solid color onto the form-refinement geometry, pins wall/bottom UVs to a fixed corner so the
 * top-face paint never bleeds onto them (a top-planar projection samples the same region on the
 * underside), and merges to exactly 2 meshes (types.ts section 1).
 */
export const createFocacciaOliveFlesh: BreadBuilder = (rng) => {
  const oliveMat = stdMaterial({ color: OLIVE_RENDER_COLOR });
  const { group, slabGeometry, dimples, toppings, slabTopTriCount } = buildFocacciaOliveFleshForm(rng, oliveMat);

  const uv = slabGeometry.attributes.uv as THREE.BufferAttribute;
  const index = slabGeometry.getIndex();
  if (index) {
    // Pin every wall/bottom vertex's UV to a fixed corner. Walking the index (rather than
    // relying on a triangle-count offset, which only works on a non-indexed buffer) is what lets
    // the slab stay indexed while still keeping the crust+oil paint off the sides.
    const touched = new Uint8Array(uv.count);
    for (let t = slabTopTriCount * 3; t < index.count; t++) touched[index.getX(t)] = 1;
    for (let v = 0; v < uv.count; v++) if (touched[v]) uv.setXY(v, EDGE_UV, EDGE_UV);
    uv.needsUpdate = true;
  }

  const crustMat = stdMaterial({ map: paintCrust(dimples, toppings, slabGeometry.boundingBox as THREE.Box3, rng) });
  group.add(new THREE.Mesh(slabGeometry, crustMat));

  return mergeByMaterial(group);
};
