"""르방이 빵 GLB — Blender(bpy) 공용 도구. 절차 정본 = docs/BREADS.md §Blender 파이프라인.

헤드리스 전용: node scripts/blender-export.mjs <id>  (안에서 blender -b --factory-startup -P run.py)
좌표: Blender Z-up. 단위는 실제 비율만 맞춘다(런타임이 최장축을 1.6으로 맞춘다).
정면 = Blender -Y (glTF/three +Z, 썸네일 카메라 쪽).

흐름: 빌더가 파트별 고해상 메시 + 절차 재질(노드)을 만든다 → bake_and_export()가
  합치기 → UV(재질별 밀도 가중) → Cycles 굽기(색·거칠기·노멀·AO) → AO를 색에 곱함 → 음식 색 보정 →
  재질 1장(색·노멀·거칠기 텍스처)으로 바꿔 GLB 1메시로 내보낸다. 런타임은 PBR 경로(breadMaterial.ts).
"""
import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

TAU = math.tau
UP = Vector((0, 0, 1))
# 썸네일 카메라 three (-1.6, 2.2, 2.6) → Blender (-1.6, -2.6, 2.2) 의 수평 방위
CAM = math.atan2(-2.6, -1.6)


# ── 방향 ──────────────────────────────────────────────────────────────────────

def az(alpha_deg):
    """카메라 기준 각(도) → 세계 방위(라디안). + = 화면 오른쪽"""
    return CAM + math.radians(alpha_deg)


def horiz(th):
    return Vector((math.cos(th), math.sin(th), 0.0))


def frame(z_axis, x_hint):
    """국소 Z → z_axis, 국소 X → x_hint(직교화) 회전 4×4"""
    ez = z_axis.normalized()
    ex = (x_hint - ez * x_hint.dot(ez)).normalized()
    ey = ez.cross(ex)
    return Matrix((ex, ey, ez)).transposed().to_4x4()


# ── 단면 경로 (흘러내림·줄기를 표면 따라 놓을 때) ─────────────────────────────

def prof_r(prof, h):
    """프로필(아래 극 → 위 극)이 높이 h에서 갖는 가장 바깥 반지름"""
    best = 0.0
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 != z1 and (z0 - h) * (z1 - h) <= 0:
            best = max(best, r0 + (r1 - r0) * (h - z0) / (z1 - z0))
    return best


def bridged(fn, z, gap):
    """골을 건너뛴다 — 위아래 gap 안에 더 넓은 데가 둘 다 있으면 그 작은 쪽까지 채운 반지름"""
    up = max(fn(z + gap * k / 4) for k in range(1, 5))
    dn = max(fn(z - gap * k / 4) for k in range(1, 5))
    return max(fn(z), min(up, dn))


def with_normals(pts):
    """[(r, z)] → [(r, z, 바깥 법선 r, 바깥 법선 z, 호 길이)] — 경로는 안쪽 → 바깥 → 아래 순"""
    out, s = [], 0.0
    for i, (r, z) in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        dr, dz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dr, dz) or 1.0
        if i:
            s += math.hypot(r - pts[i - 1][0], z - pts[i - 1][1])
        out.append((r, z, -dz / ln, dr / ln, s))
    return out


def at(path, s):
    """with_normals 경로의 호 길이 s 지점 (r, z, 법선 r, 법선 z)"""
    for a, b in zip(path, path[1:]):
        if b[4] >= s:
            t = 0.0 if b[4] == a[4] else (s - a[4]) / (b[4] - a[4])
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))
    return path[-1][:4]


# ── 장면 ──────────────────────────────────────────────────────────────────────

def reset(seed: int) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(seed)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    world = bpy.data.worlds.new('world')
    sc.world = world
    # AO 굽기 거리 — 크림 골·층 사이 같은 가까운 틈만 어둡게(물체 단위, 지름 1 기준).
    # 0.08이면 크림 전체가 회색으로 죽었다(2026-11-14) — 맞닿은 틈만 남긴다
    world.light_settings.distance = 0.05


def link(ob):
    bpy.context.collection.objects.link(ob)
    return ob


def hex_lin(h: str):
    """'#RRGGBB'(sRGB) → Blender 노드용 선형 RGBA"""
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def n3(x, y, z, seed=0.0):
    """결정론 노이즈 −1..1 (mathutils Perlin)"""
    return noise.noise(Vector((x + seed * 17.13, y - seed * 9.71, z + seed * 3.37)))


# ── 형상 ──────────────────────────────────────────────────────────────────────

def lathe(name, profile, segs=96, rfn=None, zfn=None, theta0=0.0, theta1=TAU):
    """회전체(세로축 Z). profile = [(r, z), ...] 아래 → 위. r≈0인 끝점은 극(정점 1개).
    rfn(theta, z) → 반지름 배율(둘레 요철), zfn(theta, r) → z 더하기.
    theta 범위가 한 바퀴가 아니면 열린 조각(가장자리 정점 따로)."""
    full = abs((theta1 - theta0) - TAU) < 1e-9
    n = segs if full else segs + 1
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r <= 1e-9:
            rings.append([bm.verts.new((0.0, 0.0, z))])
            continue
        ring = []
        for i in range(n):
            th = theta0 + (theta1 - theta0) * i / segs
            rr = r * (rfn(th, z) if rfn else 1.0)
            zz = z + (zfn(th, r) if zfn else 0.0)
            ring.append(bm.verts.new((rr * math.cos(th), rr * math.sin(th), zz)))
        rings.append(ring)
    m = segs  # 면 개수(둘레)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(m):
            j = (i + 1) % n if full else i + 1
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me))


def superellipse_profile(radius, height, n=5.0, steps=40, dome=0.0, base=0.0):
    """둥근 모서리 원반 단면(아래 극 → 위 극). n이 클수록 모서리가 각지다.
    dome = 윗면 가운데 볼록 높이, base = 아랫면 가운데 오목(+면 위로)"""
    pts = []
    for k in range(steps + 1):
        t = -math.pi / 2 + math.pi * k / steps
        c, s = math.cos(t), math.sin(t)
        x = radius * (abs(c) ** (2 / n))
        z = height / 2 * (1 + math.copysign(abs(s) ** (2 / n), s))
        u = x / radius
        if s > 0:
            z += dome * (1 - u * u)
        else:
            z += base * (1 - u * u)
        pts.append((x if k not in (0, steps) else 0.0, z))
    return pts


def displace_normal(ob, fn):
    """정점을 법선 방향으로 fn(co) 만큼 민다(절차 요철). 법선은 밀기 전에 다 읽는다 —
    정점마다 v.normal을 읽으면 앞 정점을 민 뒤 다시 계산된 법선을 써서, 급한 변위(칼집 벼랑)가
    틀어지고(깜빠뉴 X가 거꾸로 솟음, 2026-11-14) 정점마다 법선 전체를 다시 계산한다"""
    me = ob.data
    me.update()
    nrm = [v.normal.copy() for v in me.vertices]
    for v, n in zip(me.vertices, nrm):
        v.co += n * fn(v.co)
    me.update()


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    for md in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)
    ob.select_set(False)


def solidify(ob, thickness):
    md = ob.modifiers.new('solid', 'SOLIDIFY')
    md.thickness = thickness
    md.offset = 0.0
    apply_modifiers(ob)


def decimate(ob, ratio):
    if ratio >= 0.999:
        return
    md = ob.modifiers.new('dec', 'DECIMATE')
    md.ratio = ratio
    apply_modifiers(ob)


def to_mesh(ob):
    """곡선·메타볼 → 메시 오브젝트(원본은 지움). 곡선은 제자리 변환, 메타볼은 새 오브젝트가 생긴다"""
    before = {o.name for o in bpy.data.objects}
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    new = [o for o in bpy.data.objects if o.name not in before and o.type == 'MESH']
    out = new[0] if new else bpy.context.view_layer.objects.active
    out.select_set(False)
    return out


def metaballs(name, elements, resolution=0.006, threshold=0.6):
    """elements = [dict(type='BALL'|'ELLIPSOID'|'CAPSULE', co, radius, size=(x,y,z), rot=Quaternion)]"""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = threshold
    for e in elements:
        el = mb.elements.new(type=e.get('type', 'BALL'))
        el.co = e['co']
        el.radius = e['radius']
        if 'size' in e:
            el.size_x, el.size_y, el.size_z = e['size']
        if 'rot' in e:
            el.rotation = e['rot']
    ob = link(bpy.data.objects.new(name, mb))
    me_ob = to_mesh(ob)
    for p in me_ob.data.polygons:
        p.use_smooth = True
    return me_ob


def curve_tube(name, points, radii, profile_obj=None, bevel_depth=0.01, caps=True):
    """폴리 곡선 + 단면(오브젝트 또는 원형) → 메시. points = [(x,y,z)], radii = 점별 굵기 배율"""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = 2
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for p, co, r in zip(sp.points, points, radii):
        p.co = (*co, 1.0)
        p.radius = r
    if profile_obj is not None:
        cu.bevel_mode = 'OBJECT'
        cu.bevel_object = profile_obj
    else:
        cu.bevel_mode = 'ROUND'
        cu.bevel_depth = bevel_depth
        cu.bevel_resolution = 4
    cu.use_fill_caps = caps
    ob = link(bpy.data.objects.new(name, cu))
    me_ob = to_mesh(ob)
    # 단면 곡선을 감는 방향에 따라 법선이 통째로 안쪽을 본다(크림 로제트 97%). 앱은 양면 재질이라 안 보이고
    # 빵 전체 부피 감기 검사도 통과하지만, AO 굽기는 관 안쪽을 재서 그늘을 잘못 굽는다(2026-11-14)
    bm = bmesh.new()
    bm.from_mesh(me_ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me_ob.data)
    bm.free()
    for p in me_ob.data.polygons:
        p.use_smooth = True
    return me_ob


def profile_curve(name, pts2d):
    """닫힌 2D 단면 곡선(베벨 오브젝트용) — 장면에 링크하되 굽기·내보내기 전에 지운다"""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts2d) - 1)
    for p, (x, y) in zip(sp.points, pts2d):
        p.co = (x, y, 0.0, 1.0)
    sp.use_cyclic_u = True
    return link(bpy.data.objects.new(name, cu))


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    return ob


def bake_transform(ob):
    """위치·회전·크기를 정점에 굳힌다(합치기 전에)"""
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)


def delete_faces(ob, pred):
    """pred(face_center, face_normal) 가 참인 면을 지운다 — 안 보이는 면 정리(텍스처·삼각형 절약)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    kill = [f for f in bm.faces if pred(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()


def orient_faces(ob, outward):
    """열린 조각의 면 방향 맞추기 — outward(face_center) 쪽을 보게 뒤집는다(recalc는 열린 면에서 못 믿는다)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    flip = [f for f in bm.faces if f.normal.dot(outward(f.calc_center_median())) < 0]
    bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(ob.data)
    bm.free()


def point_attr(ob, name, values):
    """정점마다 실수 하나(FLOAT·POINT) — 재질에서 Mat.attr(name)로 읽는다"""
    at = ob.data.attributes.new(name, 'FLOAT', 'POINT')
    at.data.foreach_set('value', [float(v) for v in values])


def catmull(points, sub=1):
    """Catmull-Rom — 제어점 사이에 sub개씩 끼운다(끝점 유지). points = [(a, b), ...]"""
    pts = [points[0], *points, points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (Vector(p) for p in pts[i - 1:i + 3])
        for k in range(sub + 1):
            t = k / (sub + 1)
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    out.append(tuple(points[-1]))
    return out


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ── 재질 노드 ─────────────────────────────────────────────────────────────────

class Mat:
    """Principled BSDF 하나짜리 절차 재질을 짧게 짓는 도우미"""

    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.bsdf = self.nt.nodes['Principled BSDF']
        self.bsdf.inputs['Metallic'].default_value = 0.0

    def node(self, kind, **props):
        nd = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.nt.links.new(a, b)

    def coords(self, kind='Object'):
        return self.node('ShaderNodeTexCoord').outputs[kind]

    def lpos(self):
        """파트 국소 좌표(tag_local) — 합친 뒤에도 파트 기준"""
        return self.node('ShaderNodeAttribute', attribute_name='lpos', attribute_type='GEOMETRY').outputs['Vector']

    def lnrm(self):
        """파트 국소 법선(tag_local, 정점 보간)"""
        return self.node('ShaderNodeAttribute', attribute_name='lnrm', attribute_type='GEOMETRY').outputs['Vector']

    def mapping(self, vec, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        m = self.node('ShaderNodeMapping')
        self.link(vec, m.inputs['Vector'])
        m.inputs['Location'].default_value = loc
        m.inputs['Rotation'].default_value = rot
        m.inputs['Scale'].default_value = scale
        return m.outputs['Vector']

    def noise(self, vec, scale=5.0, detail=4.0, rough=0.5, distortion=0.0, w=None):
        nd = self.node('ShaderNodeTexNoise')
        if w is not None:
            nd.noise_dimensions = '4D'
            nd.inputs['W'].default_value = w
        self.link(vec, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        nd.inputs['Distortion'].default_value = distortion
        return nd.outputs['Fac']

    def voronoi(self, vec, scale=10.0, feature='F1', randomness=1.0, out='Distance', dims='3D'):
        nd = self.node('ShaderNodeTexVoronoi', feature=feature, voronoi_dimensions=dims)
        self.link(vec, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Randomness'].default_value = randomness
        return nd.outputs[out]

    def math(self, op, a, b=None, clamp=False):
        nd = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                nd.inputs[i].default_value = v
            else:
                self.link(v, nd.inputs[i])
        return nd.outputs[0]

    def vmath(self, op, a, b=None):
        nd = self.node('ShaderNodeVectorMath', operation=op)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (tuple, list)):
                nd.inputs[i].default_value = v
            else:
                self.link(v, nd.inputs[i])
        return nd.outputs['Value'] if op in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE') else nd.outputs['Vector']

    def attr(self, name):
        """정점 속성(point_attr) 실수값 — 없는 파트는 0"""
        return self.node('ShaderNodeAttribute', attribute_name=name, attribute_type='GEOMETRY').outputs['Fac']

    def combine(self, x=0.0, y=0.0, z=0.0):
        nd = self.node('ShaderNodeCombineXYZ')
        for i, v in enumerate((x, y, z)):
            if isinstance(v, (int, float)):
                nd.inputs[i].default_value = v
            else:
                self.link(v, nd.inputs[i])
        return nd.outputs[0]

    def sep(self, vec):
        nd = self.node('ShaderNodeSeparateXYZ')
        self.link(vec, nd.inputs[0])
        return nd.outputs

    def ramp(self, fac, stops, interp='LINEAR'):
        """stops = [(pos, '#hex' 또는 float 0..1)]"""
        nd = self.node('ShaderNodeValToRGB')
        cr = nd.color_ramp
        cr.interpolation = interp
        self.link(fac, nd.inputs['Fac'])
        while len(cr.elements) > 1:
            cr.elements.remove(cr.elements[-1])
        for i, (pos, col) in enumerate(stops):
            el = cr.elements[0] if i == 0 else cr.elements.new(pos)
            el.position = pos
            el.color = hex_lin(col) if isinstance(col, str) else (col, col, col, 1.0)
        return nd.outputs['Color']

    def mix(self, fac, a, b):
        """색 섞기 a→b. a·b = 소켓 또는 '#hex'"""
        nd = self.node('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
        if isinstance(fac, (int, float)):
            nd.inputs['Factor'].default_value = fac
        else:
            self.link(fac, nd.inputs['Factor'])
        for sock, v in ((nd.inputs[6], a), (nd.inputs[7], b)):
            if isinstance(v, str):
                sock.default_value = hex_lin(v)
            else:
                self.link(v, sock)
        return nd.outputs[2]

    def mixf(self, fac, a, b):
        """실수 섞기 a→b"""
        nd = self.node('ShaderNodeMix', data_type='FLOAT')
        for sock, v in ((nd.inputs['Factor'], fac), (nd.inputs[2], a), (nd.inputs[3], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                self.link(v, sock)
        return nd.outputs[0]

    def smooth(self, x, e0, e1):
        """smoothstep(e0, e1, x)"""
        nd = self.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', clamp=True)
        self.link(x, nd.inputs['Value'])
        nd.inputs['From Min'].default_value = e0
        nd.inputs['From Max'].default_value = e1
        return nd.outputs['Result']

    def bump(self, height, strength=0.3, distance=0.01, normal=None):
        nd = self.node('ShaderNodeBump')
        self.link(height, nd.inputs['Height'])
        nd.inputs['Strength'].default_value = strength
        nd.inputs['Distance'].default_value = distance
        if normal is not None:
            self.link(normal, nd.inputs['Normal'])
        return nd.outputs['Normal']

    def out(self, color=None, rough=None, normal=None):
        for key, v in (('Base Color', color), ('Roughness', rough), ('Normal', normal)):
            if v is None:
                continue
            sock = self.bsdf.inputs[key]
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, str):
                sock.default_value = hex_lin(v)
            else:
                self.link(v, sock)
        return self.mat


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


# ── 굽기·내보내기 ─────────────────────────────────────────────────────────────

def tag_local(ob):
    """파트 자신의 좌표·법선을 정점 속성(lpos·lnrm)에 적는다. 합치면 Object 좌표가 월드가 되므로
    재질은 이 속성(Mat.lpos·Mat.lnrm)을 쓴다 — 딸기 단면 무늬·윗면/옆면 가르기가 배치와 무관해진다"""
    me = ob.data
    if 'lpos' in me.attributes:
        return
    me.update()
    pos = me.attributes.new('lpos', 'FLOAT_VECTOR', 'POINT')
    nrm = me.attributes.new('lnrm', 'FLOAT_VECTOR', 'POINT')
    for i, v in enumerate(me.vertices):
        pos.data[i].vector = v.co
        nrm.data[i].vector = v.normal


def _join(parts, name):
    bpy.context.view_layer.update()  # place()가 바꾼 위치·회전을 matrix_world에 반영
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        tag_local(p)
        bake_transform(p)
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def _hide_unseen(ob, uv_weight, scale, rings=1):
    """어느 쪽에서도 안 보이는 면(장 사이 · 밑면 · 토핑에 깔린 데)을 복제 재질 '<이름>_hid' 로 돌리고
    uv_weight 에 그 몫(원 재질 몫 × scale)을 적는다. 그런 면이 아틀라스 절반을 먹어 보이는 옆면이 흐렸다
    (2026-11-15 팬케이크 변형). 지우지 않는다: 빛 굽기에서 빛이 새고, 비치는 소스 밑이 빈다.
    판정 = 위쪽 반구(고도 14~75°, 앱 카메라는 36°)의 평행 광선이 면 위 표본 점에서 하나라도 안 막히면 보임.
    보이는 면과 변을 맞댄 면 rings 겹은 같이 남긴다(귀퉁이만 보이는 큰 면을 놓치면 흐린 네모가 비친다).
    정점을 맞댄 면까지 넓히면 회전체 윗면은 가운데 극 정점을 다 같이 물어 원반이 통째로 남는다"""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    dirs = [Vector((math.cos(TAU * k / 20) * math.cos(e), math.sin(TAU * k / 20) * math.cos(e), math.sin(e)))
            for e in map(math.radians, (36, 14, 24, 52, 75)) for k in range(20)]
    seen = set()
    for f in bm.faces:
        c = f.calc_center_median()
        pts = [c] + [c + (v.co - c) * k for k in (0.7, 0.95) for v in f.verts]
        for d in dirs:
            off = f.normal * (3e-3 if f.normal.dot(d) >= 0 else -3e-3)  # 넉넉히 띄운다 — 휜 사각 면은 가운데가 제 삼각형 밑에 있어 1e-4 로는 제 면에 막혔다(옆면에 흐린 네모)
            if any(tree.ray_cast(p + off, d)[0] is None for p in pts):
                seen.add(f.index)
                break
    for _ in range(rings):
        seen |= {g.index for i in list(seen) for e in bm.faces[i].edges for g in e.link_faces}
    bm.free()
    me = ob.data
    slot = {}
    for p in me.polygons:
        if p.index in seen:
            continue
        if p.material_index not in slot:
            src = me.materials[p.material_index]
            dup = src.copy()
            dup.name = src.name + '_hid'
            if os.environ.get('LEVAIN_HIDE_DEBUG'):  # 숨김 판정을 눈으로 본다 — 화면에 자홍이 보이면 오판
                b = dup.node_tree.nodes['Principled BSDF'].inputs['Base Color']
                for ln in list(b.links):
                    dup.node_tree.links.remove(ln)
                b.default_value = (1.0, 0.0, 1.0, 1.0)
            me.materials.append(dup)
            slot[p.material_index] = len(me.materials) - 1
            uv_weight[dup.name] = uv_weight.get(src.name, 1.0) * scale
        p.material_index = slot[p.material_index]
    print(f'  hide {len(me.polygons) - len(seen)}/{len(me.polygons)} faces')


def _unwrap(ob, uv_weight, margin=0.004):
    """Smart UV + 재질별 밀도 가중 + 섬 포장. uv_weight = {재질 이름: 배율}"""
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if uv_weight:
        me = ob.data
        uv = me.uv_layers.active.data
        for mi, mat in enumerate(me.materials):
            w = uv_weight.get(mat.name, 1.0)
            if abs(w - 1.0) < 1e-6:
                continue
            loops = [li for p in me.polygons if p.material_index == mi for li in p.loop_indices]
            if not loops:
                continue
            cx = sum(uv[li].uv.x for li in loops) / len(loops)
            cy = sum(uv[li].uv.y for li in loops) / len(loops)
            for li in loops:
                u = uv[li].uv
                u.x = cx + (u.x - cx) * w
                u.y = cy + (u.y - cy) * w
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def _bake(ob, img, kind, samples=8, **kw):  # 8 = 텍셀 안 지터(씨앗·기공 가장자리 계단 방지)
    for mat in ob.data.materials:
        nt = mat.node_tree
        nd = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage')
        nd.name = '__bake__'
        nd.image = img
        nt.nodes.active = nd
    bpy.context.scene.cycles.samples = samples
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.bake(type=kind, margin=kw.pop('margin', 8), margin_type='EXTEND', use_clear=True, **kw)


def _image(name, size, non_color=False):
    img = bpy.data.images.new(name, size, size, alpha=False)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def _px(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def _sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def food_grade(rgb):
    """음식 색 보정 — 감마 공간 RGB (..., 3) → 같은 모양. 2026-11-14 사용자 「조형은 괜찮은데 빛깔이 별로」.
    따뜻한 색상(5~60°)만 만진다: 껍질(채도 높음)은 짙게, 그중 밝은 껍질만 채도를 누르고 색상을 황금 갈색 32°로
    당긴다. 속살(채도 낮고 밝음)은 밝고 담백하게, 끝에 밝기 대비를 살짝. 딸기 · 잼(빨강) · 올리브(초록) · 회색은
    창 밖이라 그대로. 실패한 판은 docs/BREADS.md 함정 목록"""
    v = rgb.max(-1)
    d = v - rgb.min(-1)
    dd = np.maximum(d, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(v == r, (g - b) / dd, np.where(v == g, 2 + (b - r) / dd, 4 + (r - g) / dd)) * 60 % 360
    s = d / np.maximum(v, 1e-6)
    warm = _sstep(5, 15, h) * (1 - _sstep(55, 70, h))
    crust = _sstep(0.45, 0.75, s) * warm
    crumb = (1 - _sstep(0.25, 0.55, s)) * warm * _sstep(0.55, 0.8, v)
    # 밝은 껍질(팬케이크 · 스콘 · 크래커 · 식빵 윗면)만 황금 갈색으로 옮긴다. 어두운 껍질(깜빠뉴 · 호밀 · 통밀)까지
    # 색상을 당기고 채도를 누르면 올리브빛 회갈색 진흙이 됐다 — 잘 구운 어두운 껍질은 붉은 갈색이 맞다
    bright = _sstep(0.6, 0.85, v)
    v = v * (1 - crust * (0.08 + 0.12 * bright))
    v = v + (1 - v) * 0.40 * crumb
    v = np.clip(0.55 + (v - 0.55) * 1.05, 0, 1)
    # 밝은 껍질의 채도는 0.62 위를 누른다. 실물 빵 스캔(ambientCG 3DBread CC0) 색 맵의 껍질 채도는 0.3~0.65인데
    # 첫 판은 0.75~1.0이었다. 채도 1(파랑 0)인 껍질은 앱 반사광이 선형으로 흰빛을 더하면 sRGB에서 파랑만
    # 솟아 색상이 6° 붉게 밀린다 — 팬케이크 윗면 #BB5F00이 화면에선 #BF6930 주황 플라스틱이었다
    s = s - 0.6 * crust * bright * np.maximum(s - 0.62, 0)
    s = s * (1 - 0.32 * crumb)
    s = s + 0.04 * s * (1 - s)
    h = h + (32 - h) * 0.5 * crust * bright
    k = (np.array([5, 3, 1]) + h[..., None] / 60) % 6
    return v[..., None] * (1 - s[..., None] * np.clip(np.minimum(k, 4 - k), 0, 1))


def _to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0) + 0.055) / 1.055) ** 2.4)


def _to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def _blur(a, n=1):
    """3×3 상자 흐림 n번 — 구운 빛의 표본 잡음을 누른다(빛은 저주파)"""
    for _ in range(n):
        p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
        a = sum(p[i:i + a.shape[0], j:j + a.shape[1]] for i in range(3) for j in range(3)) / 9.0
    return a


def _blur_in(a, cov, n=1):
    """덮인 텍셀(cov)끼리만 흐린다 — 그냥 흐리면 UV 섬 사이 여백을 건너 이웃 섬의 빛이 번져
    옆면에 금 간 줄(밝은 속살 섬 · 그늘진 숨은 면이 섞인 줄)이 생겼다(2026-11-15 도라야키 · 말차 옆면)"""
    w = cov.astype(np.float32)
    den = np.maximum(_blur(w, 1), 1e-4)
    for _ in range(n):
        a = np.where(w > 0, _blur(a * w, 1) / den, a)
    return a


def _spread(a, cov, n=8):
    """덮인 텍셀 값을 여백으로 n 텍셀 번지게 한다(굽기 여백 EXTEND 와 같은 구실 — 섬끼리 섞지 않는다)"""
    w = cov.astype(np.float32)
    a = a * w
    for _ in range(n):
        num, den = _blur(a, 1), _blur(w, 1)
        new = (w[..., 0] == 0) & (den[..., 0] > 0)
        a[new] = (num / np.maximum(den, 1e-6))[new]
        w[new] = 1.0
    return a, w


def studio(key_az=-50.0, key_el=50.0, key=4.0, sky=0.8, sky_col=(1.0, 0.95, 0.88)):
    """빛 굽기용 무대 — 고른 따뜻한 하늘빛 + 카메라 왼쪽 위의 큰 해(부드러운 그림자). 카메라 = 앱 썸네일 시점.
    (해 오브젝트, 하늘 Background 노드)"""
    sc = bpy.context.scene
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background') or w.node_tree.nodes.new('ShaderNodeBackground')
    out = w.node_tree.nodes.get('World Output') or w.node_tree.nodes.new('ShaderNodeOutputWorld')
    w.node_tree.links.new(bg.outputs[0], out.inputs['Surface'])
    bg.inputs['Color'].default_value = (*sky_col, 1.0)
    bg.inputs['Strength'].default_value = sky
    sun = bpy.data.lights.new('key', 'SUN')
    sun.energy, sun.angle, sun.color = key, math.radians(30), (1.0, 0.97, 0.93)
    so = link(bpy.data.objects.new('key', sun))
    el = math.radians(key_el)
    toward = horiz(az(key_az)) * math.cos(el) + UP * math.sin(el)
    so.rotation_euler = toward.to_track_quat('Z', 'Y').to_euler()  # 해는 국소 −Z로 비춘다
    cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam')))
    cam.location = Vector((-1.6, -2.6, 2.2)) / 1.6
    cam.rotation_euler = (Vector((0, 0, 0.22)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return so, bg


LIT = dict(samples=128, shadow=(0.92, 0.74, 0.48), lift=0.18, over=0.35, spec=1.2, knee=0.02, spec_angle=10.0, sheen=0.03, sheen_angle=8.0, sheen_az=14.0, sat=1.1, contrast=1.12,
           ref=88.0)


def _make_clear(mat, weight=1.0, absorb='#FF9A1A', density=20.0, base=None, ior=1.47):
    """재질을 비치는 액체로 — 굴절로 밑의 면이 보이고, 지나간 두께만큼 absorb 색으로 짙어진다(Beer–Lambert).
    소스는 밑면 없는 한 겹 면이라, 들어간 빛은 빵에 닿을 때까지가 곧 소스 두께다.
    weight < 1 이면 그만큼은 불투명(탁한 소스 — 잼). 그림자 광선은 그냥 지나간다(부피가 색을 입힌다)"""
    nt = mat.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Transmission Weight'].default_value = weight
    b.inputs['Subsurface Weight'].default_value = 0.0
    b.inputs['IOR'].default_value = ior
    if base:
        for ln in list(b.inputs['Base Color'].links):
            nt.links.remove(ln)
        b.inputs['Base Color'].default_value = hex_lin(base)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    vol = nt.nodes.new('ShaderNodeVolumeAbsorption')
    vol.inputs['Color'].default_value = hex_lin(absorb)
    vol.inputs['Density'].default_value = density
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    lp, tr, mix = (nt.nodes.new(k) for k in ('ShaderNodeLightPath', 'ShaderNodeBsdfTransparent', 'ShaderNodeMixShader'))
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY'
    fac.inputs[1].default_value = weight
    nt.links.new(lp.outputs['Is Shadow Ray'], fac.inputs[0])
    # 이미 한 번 꺾인 광선은 다른 소스 면을 그냥 지난다 — 고인 데와 줄기가 겹친 자리에서 두 번 꺾이면
    # 사이에 갇혀 검은 톱니 조각으로 구워졌다(2026-11-15 꿀 가장자리)
    both = nt.nodes.new('ShaderNodeMath')
    both.operation = 'MAXIMUM'
    nt.links.new(fac.outputs[0], both.inputs[0])
    nt.links.new(lp.outputs['Is Transmission Ray'], both.inputs[1])
    nt.links.new(both.outputs[0], mix.inputs['Fac'])
    nt.links.new(b.outputs['BSDF'], mix.inputs[1])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])


def _bake_lit(ob, name, size, albedo, opts):
    """빛을 색 맵에 굽는다 → 감마 RGB. albedo = 감마 공간 색(AO 곱하기 전).
    앱 조명은 거의 평평해서(위 0.93 · 옆 0.83) 입체감 · 따뜻한 그늘 · 하이라이트를 텍스처가 지어야 한다 —
    좋아요 상위 팬케이크 모델(스케치팹)은 전부 손으로 칠한 밝은 그러데이션 + 주황 그늘 + 또렷한 흰 하이라이트였다.
    ① 확산 + 표면하 산란(직접 · 간접) ② 그늘에 따뜻한 바닥빛 ③ 카메라에서 본 정반사를 얹음 ④ 채도 · 대비 필터"""
    o = {**LIT, **(opts if isinstance(opts, dict) else {})}
    sc = bpy.context.scene
    so, bg = studio(**{k: o[k] for k in ('key_az', 'key_el', 'key', 'sky', 'sky_col') if k in o})
    lit = bpy.data.images.new(f'{name}_lit', size, size, alpha=False, float_buffer=True)
    spec = bpy.data.images.new(f'{name}_spec', size, size, alpha=False, float_buffer=True)
    sc.render.bake.view_from = 'ABOVE_SURFACE'
    cv = _image(f'{name}_cov', size, non_color=True)  # 면이 실제로 덮은 텍셀(여백 빼고)
    for mat in ob.data.materials:
        b = mat.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        b.inputs['Emission Strength'].default_value = 1.0
    _bake(ob, cv, 'EMIT', samples=1, margin=0)
    cov = _px(cv)[..., :1] > 0.5
    for mat in ob.data.materials:
        mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0
    clear, mask = o.get('clear') or {}, None  # {재질: _make_clear 인자} — 색 · 거칠기 · 노멀은 이미 구웠다
    if clear:
        mk = _image(f'{name}_clr', size, non_color=True)
        for mat in ob.data.materials:
            b = mat.node_tree.nodes['Principled BSDF']
            w = 1.0 if mat.name in clear else 0.0
            b.inputs['Emission Color'].default_value = (w, w, w, 1.0)
            b.inputs['Emission Strength'].default_value = 1.0
        _bake(ob, mk, 'EMIT', samples=1)
        mask = _px(mk)[..., :1]
        for mat in ob.data.materials:
            mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0
            if mat.name in clear:
                _make_clear(mat, **clear[mat.name])
    _bake(ob, lit, 'COMBINED', samples=o['samples'], pass_filter={'DIFFUSE', 'TRANSMISSION', 'DIRECT', 'INDIRECT'})
    sky = bg.inputs['Strength'].default_value
    bg.inputs['Strength'].default_value = 0.0  # 하이라이트는 해만(하늘 반사는 앱의 방 환경맵이 한다)
    sc.render.bake.view_from = 'ACTIVE_CAMERA'
    so.data.angle = math.radians(o['spec_angle'])  # 하이라이트는 작은 해로 — 젖은 면에 가는 빛줄기가 선다
    # 역광 창: 수평으로 고인 젖은 면이 카메라로 되비추는 자리에 큰 부드러운 빛 — 고인 소스 위에 창 모양 광택이 앉는다
    # (작은 해만으로는 기운 가장자리에만 빛이 서고 고인 면은 무광 페인트로 읽혔다)
    v = sc.camera.location - Vector((0, 0, 0.22))
    win = bpy.data.lights.new('window', 'SUN')
    win.energy, win.angle = o['sheen'], math.radians(o['sheen_angle'])
    wo = link(bpy.data.objects.new('window', win))
    wo.rotation_euler = (Matrix.Rotation(math.radians(o['sheen_az']), 3, 'Z') @ Vector((-v.x, -v.y, v.z))).to_track_quat('Z', 'Y').to_euler()
    _bake(ob, spec, 'GLOSSY', samples=64, pass_filter={'DIRECT'})
    bpy.data.objects.remove(wo)
    rgh = _image(f'{name}_lrgh', size, non_color=True)
    _bake(ob, rgh, 'ROUGHNESS')
    bg.inputs['Strength'].default_value = sky
    sc.render.bake.view_from = 'ABOVE_SURFACE'

    alb = _to_lin(albedo)
    lum_w = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # 받은 빛(색 포함)만 흐린다 — 알베도의 결은 선명하게 남는다
    li = _blur_in(np.clip(_px(lit)[..., :3] / np.maximum(alb, 0.03), 0.0, 6.0), cov, 2)
    sp = _blur_in(_px(spec)[..., :3], cov, 1)
    lum = li @ lum_w
    seen = (alb @ lum_w) > 0.01
    ref = np.percentile(lum[seen], o['ref']) if seen.any() else 1.0
    lum = lum / ref
    li = alb * li / ref
    hot = np.where(lum > 1.0, (1.0 + o['over'] * (lum - 1.0)) / np.maximum(lum, 1e-6), 1.0)  # 밝은 데는 눌러 담는다
    shade = np.clip(lum, 0.0, 1.0)
    out = li * hot[..., None] + alb * np.array(o['shadow'], dtype=np.float32) * (o['lift'] * (1.0 - shade))[..., None]
    # 하이라이트: 노출을 맞추고 문턱 아래는 버린다
    # 반들거리는 재질에만 얹는다 — 거친 면은 비스듬한 데서 넓게 번들거려 색을 뿌옇게 씻는다
    if mask is not None:  # 비치는 재질은 구운 빛을 그대로 쓴다(밑의 면이 섞여 알베도로 나눌 수 없다)
        out = out * (1.0 - mask) + _blur_in(_px(lit)[..., :3], cov, 1) / ref * mask
    hl = np.maximum(sp / ref - o['knee'], 0.0) * o['spec'] * np.clip((0.5 - _px(rgh)[..., :1]) / 0.2, 0.0, 1.0)
    out = out + hl / (1.0 + hl)  # 눌러 담는다 — 넓게 하얗게 날아가지 않게
    print(f'  lit ref={ref:.2f} spec p50/p99/max={np.percentile(sp[seen], 50) / ref:.3f}/{np.percentile(sp[seen], 99) / ref:.3f}/{sp.max() / ref:.2f}')
    g = _to_srgb(out)
    m = (g @ lum_w)[..., None]
    g = m + (g - m) * o['sat']
    g = 0.5 + (g - 0.5) * o['contrast']
    bpy.data.objects.remove(so)
    g, w = _spread(np.clip(g, 0.0, 1.0), cov)
    return np.where(w > 0, g, albedo)


def bake_and_export(parts, out_dir, name, size=1024, rough_size=512, ao_strength=0.6,
                    ao_samples=48, uv_weight=None, quality=82, grade=None, lit=None, uv_margin=0.004, hide=None):
    """파트들 → 1메시 · 재질 1장(색·노멀·거칠기 텍스처) → <out_dir>/raw.glb. 통계 dict를 돌려준다"""
    os.makedirs(out_dir, exist_ok=True)
    for ob in list(bpy.data.objects):  # 베벨 단면 같은 보조 곡선은 내보내지 않는다
        if ob.type != 'MESH':
            bpy.data.objects.remove(ob)
    ob = _join(parts, name)
    uv_weight = dict(uv_weight or {})
    if hide:
        _hide_unseen(ob, uv_weight, hide)
    _unwrap(ob, uv_weight, uv_margin)

    col = _image(f'{name}_col', size)
    rough = _image(f'{name}_rough', rough_size, non_color=True)
    nrm = _image(f'{name}_nrm', size, non_color=True)
    ao = _image(f'{name}_ao', size, non_color=True)
    _bake(ob, col, 'DIFFUSE', pass_filter={'COLOR'})
    _bake(ob, rough, 'ROUGHNESS')
    _bake(ob, nrm, 'NORMAL', normal_space='TANGENT')
    _bake(ob, ao, 'AO', samples=ao_samples)

    # AO는 색에 곱한다(시점 무관 그늘 — 크림 골·층 사이). 감마 공간 곱이라 세기를 조금 낮춘다.
    # ao_strength 가 {재질: 세기, '*': 기본} 이면 재질마다 세기를 방출로 구워 텍셀마다 읽는다 —
    # 토핑에 둘러싸인 흰 크림이 한 세기(0.6)로는 회색으로 죽었다(2026-11-14 딸기 팬케이크 r5)
    c, a = _px(col), _px(ao)
    s = ao_strength
    lit_rgb = _bake_lit(ob, name, size, c[..., :3], lit) if lit is not None else None  # 방출 값을 건드리기 전에 굽는다
    if isinstance(ao_strength, dict):
        aow = _image(f'{name}_aow', size, non_color=True)
        for mat in ob.data.materials:  # 굽기용 재질은 아래에서 통째로 버린다 — 되돌리지 않는다
            w = ao_strength.get(mat.name, ao_strength.get('*', 0.6))
            bsdf = mat.node_tree.nodes['Principled BSDF']
            bsdf.inputs['Emission Color'].default_value = (w, w, w, 1.0)
            bsdf.inputs['Emission Strength'].default_value = 1.0
        _bake(ob, aow, 'EMIT', samples=1)
        s = _px(aow)[..., :1]
    occ = 1.0 - s * (1.0 - a[..., :1])
    c[..., :3] *= occ
    graded = food_grade(c[..., :3])
    if grade:  # {재질: 보정 세기 0..1, '*': 기본 1} — 꿀 · 소스처럼 빵 껍질이 아닌 따뜻한 색을 보정에서 뺀다
        gw = _image(f'{name}_gw', size, non_color=True)
        for mat in ob.data.materials:
            w = grade.get(mat.name, grade.get('*', 1.0))
            bsdf = mat.node_tree.nodes['Principled BSDF']
            bsdf.inputs['Emission Color'].default_value = (w, w, w, 1.0)
            bsdf.inputs['Emission Strength'].default_value = 1.0
        _bake(ob, gw, 'EMIT', samples=1)
        graded = c[..., :3] + (graded - c[..., :3]) * _px(gw)[..., :1]
    c[..., :3] = graded
    if lit_rgb is not None:  # 빛을 구운 판은 음식 색 보정을 거치지 않는다(빛이 그늘을 이미 지었다)
        # 맞닿은 틈의 그늘만 lit['ao'] 배로 더한다 — 구운 빛만으로는 장 사이 틈이 밝아 장끼리 한 덩이로 붙고
        # 겹친 장의 교차선(성긴 면의 계단)이 드러났다(2026-11-15 꿀 팬케이크)
        c[..., :3] = lit_rgb * (1.0 - lit.get('ao', 0.0) * (1.0 - occ))
    col.pixels.foreach_set(c.ravel())
    for img in (col, rough, nrm, ao):
        img.filepath_raw = os.path.join(out_dir, f'{img.name}.png')
        img.file_format = 'PNG'
        img.save()

    # 최종 재질 1장 — glTF 내보내기가 거칠기(G)를 metallicRoughness로 싣는다
    final = Mat(f'{name}_pbr')
    t_col = final.node('ShaderNodeTexImage', image=col)
    t_nrm = final.node('ShaderNodeTexImage', image=nrm)
    t_rgh = final.node('ShaderNodeTexImage', image=rough)
    nmap = final.node('ShaderNodeNormalMap')
    final.link(t_nrm.outputs['Color'], nmap.inputs['Color'])
    sep = final.node('ShaderNodeSeparateColor')
    final.link(t_rgh.outputs['Color'], sep.inputs['Color'])
    final.out(color=t_col.outputs['Color'], rough=sep.outputs['Green'], normal=nmap.outputs['Normal'])
    ob.data.materials.clear()
    ob.data.materials.append(final.mat)

    path = os.path.join(out_dir, 'raw.glb')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_tangents=False, export_image_format='WEBP', export_image_quality=quality,
        export_extras=False, export_cameras=False, export_lights=False,
    )
    return {'name': name, 'tris': tri_count(ob), 'verts': len(ob.data.vertices), 'bytes': os.path.getsize(path)}
