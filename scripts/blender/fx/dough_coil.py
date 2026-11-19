"""dough_coil r2 — 들어 올린 반죽 줄이 끊겨 표면에 떨어져 되접혀 눕은 더미(모프 K0 · K1 · K2) → raw.glb + 미리보기.

blender -b --factory-startup --python-exit-code 1 -P scripts/blender/fx/dough_coil.py -- <work_dir> [--samples 48] [--no-render]
  <work_dir>/raw.glb · stats.json · K0.png · K1.png · K2.png · ao.png · app_view.png · close_K0.png
  다음 단계: node scripts/blender/fx/export_glb.mjs (정리 · meshopt → public/fx/dough_coil.glb, COLOR_0 유지)

r1(동심 소용돌이 → 소프트아이스크림 · 똥 모양으로 읽힘) 폐기. 백업 = .work/blender/fx/dough_coil/r1_backup.py
실물(.work/refs/feel2): UPQ94 12-13s 들던 줄이 표면에 떨어지며 S자 · 지그재그로 되접혀 나란히 · 반쯤 겹쳐 눕는다 ·
겹 사이 어두운 골 · 위로 쌓이지 않고 옆으로 퍼진다 · 끝은 가늘어지며 묻힌다.
꼴 = 높이장(밑 파임 없음). 줄 경로를 따라 띠를 차례로 내려놓고, 먼저 놓인 띠 위에 걸치는 띠는 그 윗면을 따라 얹는다.
골 그늘 = K0 모양을 Cycles로 AO 굽기(정점 색) → 가장자리(바닥과 만나는 곳)는 1로 걸러 낸다 → COLOR_0.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector, kdtree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import lib  # noqa: E402  (scripts/blender/lib.py — 수정 금지, 가져다 쓰기만)

argv = sys.argv[sys.argv.index('--') + 1:]
WORK = argv[0]
SAMPLES = int(argv[argv.index('--samples') + 1]) if '--samples' in argv else 48
RENDER = '--no-render' not in argv
os.makedirs(WORK, exist_ok=True)
T0 = time.time()

# ── 높이장 격자(정규 좌표, 줄 경로 단위) ───────────────────────────────────────
L = 0.75
N = 361
XS = np.linspace(-L, L, N)
CELL = XS[1] - XS[0]
X, Y = np.meshgrid(XS, XS, indexing='xy')  # [j(y), i(x)]
R = np.hypot(X, Y)
CROP = 0.58


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# 바닥: 거의 평평하게 살짝 묻힘 → 줄 가장자리가 앱 표면(y=0)과 완만히 만난다
G = -0.012 - 0.06 * sstep(0.46, 0.60, R)


def box(a, r, axis):
    if r < 1:
        return a
    pad = [(r + 1, r) if ax == axis else (0, 0) for ax in range(2)]
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, n + 2 * r + 1), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


def blur(a, sigma):
    """가우스 근사(상자 3번) — sigma는 정규 좌표 길이"""
    s = sigma / CELL
    if s < 0.5:
        return a
    r = int(round((math.sqrt(12 * s * s / 3 + 1) - 1) / 2))
    for _ in range(3):
        a = box(box(a, r, 0), r, 1)
    return a


def smax(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.maximum(a, b) + h * h * k * 0.25


def fbm2(x, y, seed, octaves=3):
    out = np.zeros_like(x)
    amp, f = 1.0, 1.0
    for _ in range(octaves):
        v = np.vectorize(lambda a, b: lib.n3(a * f, b * f, 0.37 * f, seed))(x, y)
        out += amp * v
        amp *= 0.5
        f *= 2.03
    return out


# ── 줄 경로 ───────────────────────────────────────────────────────────────────
# 떨어진 줄이 한 방향으로 S자 지그재그로 되접혀 나란히 눕는다(가운데로 감기는 나선 금지).
# 점 = (x, y, 반폭 w, 두께 t). 밑동(가는 끝, 먼저 닿아 낮게 묻힘) → 길고 굽은 첫 겹(왼→오) → 굵게 부푼 굽이 →
# 짧고 휜 둘째 겹(오→왼, 첫 겹 위에 반쯤 걸침) → 굽이(오른 굽이와 위치 · 크기가 다름) → 가장 짧은 셋째 겹(왼→오, 앞 겹 위에 얹혀
# 얇아지다 끊김). 겹마다 길이 · 굽이 · 굵기 다르고 비대칭.
CTRL = [
    (-0.36, -0.205, 0.040, 0.022), (-0.27, -0.240, 0.082, 0.062), (-0.13, -0.262, 0.088, 0.070),
    (0.03, -0.255, 0.090, 0.072), (0.19, -0.228, 0.094, 0.078), (0.31, -0.190, 0.100, 0.084),
    (0.385, -0.115, 0.112, 0.092), (0.325, -0.050, 0.102, 0.086),           # 오른 굽이 1(크게 부풂)
    (0.17, -0.070, 0.092, 0.078), (-0.01, -0.105, 0.090, 0.074), (-0.17, -0.085, 0.088, 0.072),
    (-0.27, -0.040, 0.092, 0.076), (-0.30, 0.025, 0.098, 0.080),            # 왼 굽이 2(작고 가파름)
    (-0.20, 0.062, 0.090, 0.074), (-0.04, 0.045, 0.088, 0.072), (0.12, 0.052, 0.086, 0.070),
    (0.25, 0.085, 0.092, 0.074), (0.285, 0.150, 0.084, 0.066),              # 오른 굽이 3(얕고 짧음)
    (0.19, 0.180, 0.072, 0.056), (0.05, 0.165, 0.060, 0.044), (-0.08, 0.125, 0.034, 0.024),
    (-0.15, 0.100, 0.012, 0.008),                                           # 끝: 가늘어져 묻힘
]
DS = 0.01
_th = math.radians(-19.0)  # 줄 전체를 살짝 비틀어 가로줄이 반듯하지 않게
CTRL = [(x * math.cos(_th) - y * math.sin(_th), x * math.sin(_th) + y * math.cos(_th), w, t) for x, y, w, t in CTRL]


def resample(ctrl, ds):
    dense = np.array(lib.catmull(ctrl, sub=16))
    seg = np.linalg.norm(np.diff(dense[:, :2], axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    st = np.arange(0.0, s[-1], ds)
    return np.stack([np.interp(st, s, dense[:, c]) for c in range(4)], 1), s[-1]


PATH, LEN = resample(CTRL, DS)
P = PATH[:, :2].copy()
P[:, 1] += 0.022 * np.sin(14.0 * P[:, 0] + 1.0)  # 굽이마다 살짝 출렁여 겹이 나란히 반듯하지 않게
M = len(P)
U = np.linspace(0, 1, M)
n_w = np.array([lib.n3(u * 3.1, 0.2, 0.9, 11.0) for u in U])
n_t = np.array([lib.n3(u * 4.3, 0.6, 0.1, 23.0) for u in U])
W_BASE = PATH[:, 2] * (1 + 0.08 * n_w)
T_BASE = PATH[:, 3] * (1 + 0.16 * n_t)


def rope_field(wk=1.0, tk=1.0, p=0.5, fillet=0.03, drape_sigma=0.035, sink=0.3, aa=0.006, micro=0.0035):
    W = W_BASE * wk
    T = T_BASE * tk
    gap = int(math.ceil(1.35 * W.max() / DS))
    rope = np.full_like(G, -1.0)
    hold = G.copy()
    S = blur(hold, drape_sigma)
    pending = []
    wmax = W.max()
    for i in range(M - 1):
        if i >= gap:
            sl, top = pending[i - gap]
            hold[sl] = np.maximum(hold[sl], top)
            if True:
                S = blur(hold, drape_sigma)
        a, b = P[i], P[i + 1]
        lo = np.minimum(a, b) - wmax - CELL
        hi = np.maximum(a, b) + wmax + CELL
        i0, i1 = np.searchsorted(XS, [lo[0], hi[0]])
        j0, j1 = np.searchsorted(XS, [lo[1], hi[1]])
        sl = (slice(j0, j1), slice(i0, i1))
        px, py = X[sl], Y[sl]
        ab = b - a
        t = np.clip(((px - a[0]) * ab[0] + (py - a[1]) * ab[1]) / max(ab @ ab, 1e-12), 0, 1)
        d = np.hypot(px - (a[0] + t * ab[0]), py - (a[1] + t * ab[1]))
        w = W[i] + t * (W[i + 1] - W[i])
        th = T[i] + t * (T[i + 1] - T[i])
        u2 = np.clip(1 - (d / w) ** 2, 0, 1)
        base = S[sl] - sink * (S[sl] - G[sl])
        top = np.where(u2 > 0, base + th * u2 ** p, -1.0)
        rope[sl] = np.maximum(rope[sl], top)
        pending.append((sl, top))
    H = smax(rope, G, fillet)
    if micro > 0:  # 기포 · 결 — 아주 얕은 고르지 않은 요철(덩이 위에만)
        H = H + micro * MICRO * sstep(0.0, 0.04, H - G)
    return blur(H, aa)


t_m = time.time()
MICRO = fbm2(X * 6.0, Y * 6.0, 5.0)
t_m = time.time() - t_m

VARIANTS = {  # 이름: (줄 변수, 퍼짐 배율 s, 목표 높이 배율)
    'base': (dict(wk=0.90, tk=1.15, p=0.50, fillet=0.012, aa=0.004, micro=0.006), 0.95, None),
    'K0': (dict(wk=1.00, tk=1.00, p=0.42, fillet=0.008, drape_sigma=0.022, sink=0.15, aa=0.005, micro=0.005), 1.00, 1.0),
    'K1': (dict(wk=1.10, tk=0.80, p=0.80, fillet=0.05, drape_sigma=0.05, aa=0.026, micro=0.002), 1.06, 0.55),
    'K2': (dict(wk=1.22, tk=0.45, p=1.30, fillet=0.08, drape_sigma=0.07, aa=0.060, micro=0.0), 1.14, 0.15),
}
FIELDS = {k: rope_field(**v[0]) for k, v in VARIANTS.items()}

# 높이 배율 맞추기 — 바닥(G) 위로 솟은 몫만 늘이고 줄인다
h0max = FIELDS['K0'].max()
for k, (_, _, ratio) in VARIANTS.items():
    if ratio is None or k == 'K0':
        continue
    F = FIELDS[k]
    c = (ratio * h0max - G.max()) / (F.max() - G.max())
    FIELDS[k] = G + (F - G) * c

# 발자국 = K0 높이장이 y=0 위로 나온 곳. 가운데로 옮기고 긴 쪽 지름 1, 높이 0.19~0.2
H0 = FIELDS['K0']
mask = H0 > 0
ex = (X[mask].min(), X[mask].max())
ey = (Y[mask].min(), Y[mask].max())
CX, CY = (ex[0] + ex[1]) / 2, (ey[0] + ey[1]) / 2
SXY = 1.0 / max(ex[1] - ex[0], ey[1] - ey[0])
SZ = 0.195 / h0max


def sample(F, x, y):
    fx = np.clip((x + L) / CELL, 0, N - 1.0001)
    fy = np.clip((y + L) / CELL, 0, N - 1.0001)
    i0 = np.floor(fx).astype(int)
    j0 = np.floor(fy).astype(int)
    tx, ty = fx - i0, fy - j0
    return (F[j0, i0] * (1 - tx) * (1 - ty) + F[j0, i0 + 1] * tx * (1 - ty)
            + F[j0 + 1, i0] * (1 - tx) * ty + F[j0 + 1, i0 + 1] * tx * ty)


def to_out(k, x, y):
    s = VARIANTS[k][1]
    return np.stack([s * (x - CX) * SXY, s * (y - CY) * SXY, sample(FIELDS[k], x, y) * SZ], 1)


def grid_mesh(name, step):
    sx, sy = X[::step, ::step], Y[::step, ::step]
    keep = np.hypot(sx, sy) <= CROP
    idx = -np.ones(sx.shape, dtype=np.int64)
    idx[keep] = np.arange(keep.sum())
    q = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
    q = q[(q >= 0).all(1)]
    verts = np.stack([sx[keep], sy[keep], H0[::step, ::step][keep]], 1)
    me_ = bpy.data.meshes.new(name)
    me_.from_pydata(verts.tolist(), [], q.tolist())
    me_.update()
    return lib.link(bpy.data.objects.new(name, me_)), 2 * len(q)


# ── 메시: K0 높이장 격자 → 원판으로 자르기 → 줄이기 ─────────────────────────────
lib.reset(7)
ob, dense_tris = grid_mesh('dough_coil', 1)
TARGET_TRIS = 2900
lib.decimate(ob, TARGET_TRIS / dense_tris)
me = ob.data

# 정점 xy(정규 좌표)에서 각 모양을 다시 읽는다 → 모양마다 같은 위상
nv = len(me.vertices)
co = np.empty(nv * 3)
me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
vx, vy = co[:, 0], co[:, 1]
SHAPES = {k: to_out(k, vx, vy) for k in VARIANTS}
me.vertices.foreach_set('co', SHAPES['base'].ravel())
me.update()
me.shade_smooth()
ob.shape_key_add(name='Basis', from_mix=False)
for k in ('K0', 'K1', 'K2'):
    kb = ob.shape_key_add(name=k, from_mix=False)
    kb.data.foreach_set('co', SHAPES[k].ravel())
    kb.slider_min, kb.slider_max = 0.0, 1.0

mat = bpy.data.materials.new('dough')
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = lib.hex_lin('#f4ead4')
bsdf.inputs['Roughness'].default_value = 0.5
me.materials.append(mat)

# ── AO 굽기(Cycles) → 정점 색 ─────────────────────────────────────────────────
# K0 모양을 촘촘한 격자(바닥 판 없음)로 구워 저폴리 정점에 옮긴다. 가장자리(y=0 근처)는 1로 걸러 둘레에 짙은 고리가 안 생기게.
sc = bpy.context.scene


def use_gpu():
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'CUDA'
        prefs.get_devices()
        cuda = [d for d in prefs.devices if d.type == 'CUDA']
        if cuda:
            for d in prefs.devices:
                d.use = d.type == 'CUDA'
            sc.cycles.device = 'GPU'
            return 'CUDA:' + cuda[0].name
    except Exception as e:  # noqa: BLE001
        print('GPU 실패', e)
    sc.cycles.device = 'CPU'
    return 'CPU'


device = use_gpu()
AO_DIST = 0.07
GAIN = 4.0
AO_MIN = 0.55
EDGE_Z0, EDGE_Z1 = 0.010, 0.050  # 높이(지름 1 기준) 이 사이에서 걸러 냄

ao_ob, ao_tris = grid_mesh('ao_dense', 2)
ao_me = ao_ob.data
a_co = np.empty(len(ao_me.vertices) * 3)
ao_me.vertices.foreach_get('co', a_co)
a_co = a_co.reshape(-1, 3)
a_out = to_out('K0', a_co[:, 0], a_co[:, 1])
ao_me.vertices.foreach_set('co', a_out.ravel())
ao_me.update()
ao_me.shade_smooth()
ao_me.materials.append(mat)
ca = ao_me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
ao_me.color_attributes.active_color = ca
sc.render.engine = 'CYCLES'
sc.cycles.samples = 128
sc.cycles.use_denoising = False
sc.world.light_settings.distance = AO_DIST
bpy.ops.object.select_all(action='DESELECT')
ao_ob.select_set(True)
bpy.context.view_layer.objects.active = ao_ob
t_b = time.time()
bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
t_b = time.time() - t_b
av = np.empty(len(ao_me.vertices) * 4)
ao_me.color_attributes['AO'].data.foreach_get('color', av)
ao_raw = av.reshape(-1, 4)[:, 0]
ao_xy = a_out

kd = kdtree.KDTree(len(ao_xy))
for i, p_ in enumerate(ao_xy):
    kd.insert((p_[0], p_[1], 0.0), i)
kd.balance()
k0 = SHAPES['K0']
ao_lp = np.empty(nv)
for i, p_ in enumerate(k0):
    hits = kd.find_n((p_[0], p_[1], 0.0), 5)
    w_ = np.array([1.0 / (h[2] + 0.004) for h in hits])
    ao_lp[i] = float((w_ * ao_raw[[h[1] for h in hits]]).sum() / w_.sum())
# 가장 안 트인 곳 = 어둡게, 윗면 · 평평한 곳은 1 쪽으로(0.93 위는 1) → 최저 AO_MIN, 가장자리는 1
dark = np.clip((0.96 - ao_lp) / 0.96 * GAIN, 0.0, 1.0)
edge = sstep(EDGE_Z0, EDGE_Z1, k0[:, 2])
col = 1.0 - (1.0 - AO_MIN) * sstep(0.0, 1.0, dark) * edge
NZ = float(np.array([pp.normal[2] for pp in ao_me.polygons]).mean())
bpy.data.objects.remove(ao_ob)
bpy.data.meshes.remove(ao_me)
ca2 = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
ca2.data.foreach_set('color', np.stack([col, col, col, np.ones(nv)], 1).ravel())
me.color_attributes.active_color = ca2
me.color_attributes.render_color_index = list(me.color_attributes.keys()).index('Col')

# ── 숫자 ──────────────────────────────────────────────────────────────────────
tris = sum(len(p.vertices) - 2 for p in me.polygons)


def dims(k):
    v = SHAPES[k]
    up = v[v[:, 2] > 0]
    return dict(h_max=round(float(v[:, 2].max()), 4), z_min=round(float(v[:, 2].min()), 4),
                foot_x=round(float(np.ptp(up[:, 0])), 3) if len(up) else 0,
                foot_y=round(float(np.ptp(up[:, 1])), 3) if len(up) else 0,
                extent_r=round(float(np.hypot(v[:, 0], v[:, 1]).max()), 3))


zz = ao_xy[:, 2]
rr = np.hypot(ao_xy[:, 0], ao_xy[:, 1])
stats = dict(ao_far=round(float(ao_raw[rr > 0.72].mean()), 3), nz=round(NZ, 3), ao_by_z=[round(float(ao_raw[(zz >= lo) & (zz < hi)].mean()), 3) for lo, hi in ((-1, 0), (0, .02), (.02, .06), (.06, 1))], ao_hist=np.histogram(ao_raw, bins=10, range=(0, 1))[0].tolist(), tris=tris, verts=nv, dense_tris=dense_tris, ao_tris=ao_tris, path_len=round(float(LEN * SXY), 3),
             shapes={k: dims(k) for k in SHAPES}, sxy=round(SXY, 4), sz=round(SZ, 4),
             ao_raw=[round(float(ao_raw.min()), 3), round(float(ao_raw.mean()), 3)],
             col=[round(float(col.min()), 3), round(float(col.mean()), 3), round(float(col.max()), 3)],
             bake_s=round(t_b, 1))

# ── 내보내기(모프 포함, 수정자 없음, 정점 색 COLOR_0) ─────────────────────────────
raw = os.path.join(WORK, 'raw.glb')
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
res = bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', use_selection=True, export_yup=True,
                                export_apply=False, export_morph=True, export_morph_normal=True,
                                export_morph_tangent=False, export_texcoords=False, export_normals=True,
                                export_animations=False, export_materials='EXPORT',
                                export_vertex_color='ACTIVE', export_all_vertex_colors=False)
stats['export'] = list(res)
stats['raw_bytes'] = os.path.getsize(raw)


# ── 미리보기: 앱 시선(직교, 위 42°, 바탕 #f4ead4) ──────────────────────────────
def three_dir(x, y, z):
    """three(Y 위, +Z 카메라 쪽) 방향 → 블렌더(Z 위)"""
    return Vector((x, -z, y)).normalized()


def attr_mat(name, emit):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'Col'
    if emit:
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(at.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    else:  # 앱이 정점 색을 기본색에 곱한다고 가정한 미리보기
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = lib.hex_lin('#f4ead4')
        nt.links.new(at.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.5
    return m


if RENDER:
    stats['device'] = device
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.world.use_nodes = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (1.0, 0.96, 0.9, 1.0)
    bg.inputs['Strength'].default_value = 0.36
    sc.world.light_settings.distance = 0.2

    mat_app = attr_mat('dough_vc', False)
    mat_ao = attr_mat('ao_view', True)
    me.materials.clear()
    me.materials.append(mat_app)

    plate_me = bpy.data.meshes.new('plate')
    plate_me.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
    plate_me.materials.append(mat)
    plate = lib.link(bpy.data.objects.new('plate', plate_me))

    for name, d, e, ang in (('key', three_dir(-2, 6, 2), 2.25, 4.0), ('fill', three_dir(2.5, 3, -2), 0.3, 10.0)):
        lt = bpy.data.lights.new(name, 'SUN')
        lt.energy = e
        lt.angle = math.radians(ang)
        lo = lib.link(bpy.data.objects.new(name, lt))
        lo.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam = lib.link(bpy.data.objects.new('cam', cam_d))
    sc.camera = cam
    view = three_dir(0, math.sin(math.radians(42)), math.cos(math.radians(42)))

    def shoot(path, key, scale, ortho, res, target=(0, 0, 0.06)):
        for kb in ob.data.shape_keys.key_blocks[1:]:
            kb.value = 1.0 if kb.name == key else 0.0
        ob.scale = (scale,) * 3
        tgt = Vector(target) * scale
        cam.location = tgt + view * 10
        cam.rotation_euler = (-view).to_track_quat('-Z', 'Y').to_euler()
        cam_d.ortho_scale = ortho
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)

    t_r = time.time()
    for k in ('K0', 'K1', 'K2'):
        shoot(os.path.join(WORK, f'{k}.png'), k, 1.0, 1.7, (960, 640))
    shoot(os.path.join(WORK, 'close_K0.png'), 'K0', 1.0, 1.15, (1200, 800), target=(0.0, 0.0, 0.05))
    # 앱 크기: 병 안지름 1.824, 더미 발자국 ≈ 0.45
    shoot(os.path.join(WORK, 'app_view.png'), 'K0', 0.45, 2.2, (900, 600), target=(0, 0, 0))
    # AO 정점 색만(바닥 판 숨김 · 발광)
    me.materials.clear()
    me.materials.append(mat_ao)
    plate.hide_render = True
    bg.inputs['Color'].default_value = (0.04, 0.04, 0.05, 1.0)
    bg.inputs['Strength'].default_value = 1.0
    sc.cycles.samples = 16
    shoot(os.path.join(WORK, 'ao.png'), 'K0', 1.0, 1.15, (1200, 800), target=(0.0, 0.0, 0.05))
    stats['render_s'] = round(time.time() - t_r, 1)

stats['seconds'] = round(time.time() - T0, 1)
stats['micro_s'] = round(t_m, 1)
with open(os.path.join(WORK, 'stats.json'), 'w', encoding='utf-8') as f:
    json.dump(stats, f, ensure_ascii=False, indent=1)
print('DOUGH_COIL_STATS', json.dumps(stats, ensure_ascii=False))
