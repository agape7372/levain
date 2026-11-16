"""통밀빵 (wholewheat) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/wholewheat{,-2,-3}.png — 정면(1번)이 정체성 기준.
구성: 깜빠뉴보다 높은 돔(아래가 불룩, 위가 살짝 뾰족) 1메시 · 바네통 동심 고리 = 형상의 계단 홈 ·
      통밀 껍질(깜빠뉴보다 한 단 짙고 거침) + 밀기울·곡물 알갱이 · 고리 위 옅은 밀가루.
공용 형상 = scripts/blender/boule.py
"""
import math

from boule import Shape, boule_mesh, drop_base
from lib import n3

SEED = 9
SHAPE = Shape(zc=0.19, Ht=0.38, Hb=0.31, nt=1.75, nb=2.3)  # r1(Ht 0.36 · nt 1.9)은 눌린 달걀, Ht 0.34는 레퍼런스보다 낮았다(검수)
RING_P, RING_END, RING_A = 0.10, 1.62, 0.02  # 고리 간격(고리 각, rad) · 고리가 끝나는 각(옆면 높이 30% 언저리, 검수) · 홈 깊이


def groove(s):
    """고리 한 주기(s 0..1, 정수리 → 바깥) 안 홈 깊이 0..1 — 안쪽 벽은 가파르고 바깥으로 완만히 올라온다"""
    if s > 0.93:
        return ((s - 0.93) / 0.07) ** 2
    return max(0.0, 1 - s / 0.45) ** 2  # 0.30은 64px에서 실선이 뭉개졌다(r3)


def ring_disp(co):
    ang = math.atan2(math.hypot(co.x, co.y) / SHAPE.R, (co.z - SHAPE.zc) / SHAPE.Ht)
    if ang > RING_END + 0.2:
        return 0.0
    fade = min(1.0, max(0.0, (RING_END + 0.2 - ang) / 0.4))  # 아래로 흐려지며 이어진다(검수: 띠로 끝내지 말 것)
    fade *= 0.6 + 0.8 * max(0.0, min(1.0, 0.5 + n3(co.x * 4, co.y * 4, co.z * 4, 5.0)))  # 고리마다 깊이가 들쭉날쭉
    return -RING_A * fade * groove((ang / RING_P) % 1.0)


PAL = dict(ramp=('#783604', '#9A4C0C', '#B6681A'), low='#3E1C04', base='#4E2A0C', groove='#5A2606', mottle='#CC8A2C',
           dark='#34190A', light='#D89634', dust='#D9C3A0')


def crust_material(lib, pal=None, dust_a=0.55, extra=None):
    """통밀 껍질. pal = PAL 덮어쓸 색 · dust_a = 고리 밀가루 세기 ·
    extra(m, k, col, rough, h) → (col, rough, h): 변형이 덧칠(씨앗 띠 · 꿀 윤기), k = dict(p, ang 정수리 각, g 홈, zone 고리 띠).
    기본값 = 게시본 그대로"""
    c = {**PAL, **(pal or {})}
    m = lib.Mat('crust')
    p = m.lpos()
    px = m.sep(p)
    nz = m.sep(m.lnrm())[2]
    ang = SHAPE.ring_angle(m, p)
    s = m.math('FRACT', m.math('DIVIDE', ang, RING_P))
    # 홈(노드) — groove()와 같은 모양
    g = m.math('MAXIMUM', m.math('POWER', m.math('MAXIMUM', m.math('SUBTRACT', 1.0, m.math('DIVIDE', s, 0.45)), 0.0), 2.0),
               m.math('POWER', m.math('MAXIMUM', m.math('DIVIDE', m.math('SUBTRACT', s, 0.93), 0.07), 0.0), 2.0))
    zone = m.math('SUBTRACT', 1.0, m.smooth(ang, RING_END - 0.2, RING_END + 0.2))
    g = m.math('MULTIPLY', m.math('MULTIPLY', g, zone), m.smooth(m.noise(p, scale=4, detail=2), 0.3, 0.6))  # 홈 색을 군데군데 끊는다

    blot = m.noise(p, scale=5.0, detail=6, rough=0.62, distortion=0.4)
    # 레퍼런스 실측: 위 #B77941 · 옆 #9F5F2E · 아래 #6D3A12~#582E0D — 깜빠뉴(#A95821)보다 한 단 짙다.
    # r1~r5는 방 반사에 회갈색(렌더 실측 B 0x39~0x43, 레퍼런스 0x19~0x22) — 파랑을 거의 뺐다
    crust = m.ramp(blot, list(zip((0.28, 0.48, 0.68), c['ramp'])))  # 깜빠뉴보다 한 단 짙게(r7은 같은 주황으로 읽혔다)
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(px[2], 0.03, 0.30)), 0.8), crust, c['low'])  # 레퍼런스 아래 #5B2C09 — r2는 아래가 밝았다
    crust = m.mix(m.smooth(m.math('MULTIPLY', nz, -1.0), 0.4, 0.8), crust, c['base'])  # 바닥
    crust = m.mix(m.math('MULTIPLY', g, 0.5), crust, c['groove'])  # 대비 한 단 낮춤(검수)  # 고리 홈

    # 밀기울·곡물 — 보로노이 칸마다 무작위 값으로 밝은 조각(귀리·밀 껍질)과 짙은 밀기울을 고른다
    cells = m.vmath('ADD', p, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=30, detail=2), 0.5), 0.012))  # 조각 모양을 일그러뜨린다 — 둥근 점은 깨로 읽혔다(r2)
    # 밀기울 = 각진 조각, 크기 두 층. 보로노이 칸 경계까지 거리로 깎아 다각형 조각(둥근 점은 깨로 읽혔다, 검수)
    light, dark = None, None
    for sc, lo, hi in ((24, 0.88, 0.9), (58, 0.80, 0.82)):  # 첫 판(26%·34%)은 표범 무늬가 됐다
        rnd = m.sep(m.voronoi(cells, scale=sc, out='Color'))[0]  # 칸 색 R = 고른 난수
        edge = m.voronoi(cells, scale=sc, feature='DISTANCE_TO_EDGE')
        flake = m.smooth(edge, 0.12, 0.18)
        lt = m.math('MULTIPLY', flake, m.smooth(rnd, lo, hi))
        dk = m.math('MULTIPLY', flake, m.math('SUBTRACT', 1.0, m.smooth(rnd, 0.04, 0.06)))
        light = lt if light is None else m.math('MAXIMUM', light, lt)
        dark = dk if dark is None else m.math('MAXIMUM', dark, dk)
    speck = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=140), 0.05, 0.11))  # 고운 밀기울 점
    crust = m.mix(m.math('MULTIPLY', m.sep(m.voronoi(cells, scale=26, out='Color'))[1], m.math('MULTIPLY', m.smooth(px[2], 0.12, 0.32), 0.35)), crust, c['mottle'])  # 칸마다 다른 결 — 거친 통밀 얼룩
    # 고운 밀기울 점은 색 맵에서 빼고 노멀로만 — 색에 두면 WebP가 무거워 350KB를 넘었다(final3 385KB)
    crust = m.mix(m.math('MULTIPLY', dark, 0.85), crust, c['dark'])
    crust = m.mix(m.math('MULTIPLY', light, 0.6), crust, c['light'])
    # 옅은 밀가루 — 고리 볼록한 데에만 군데군데(레퍼런스엔 없다. 바네통 빵이라 살짝만)
    dust = m.math('MULTIPLY', m.math('MULTIPLY', m.math('SUBTRACT', 1.0, g), zone),
                  m.math('MULTIPLY', m.smooth(m.noise(p, scale=60, detail=2), 0.55, 0.7),
                         m.smooth(m.noise(p, scale=3.5, detail=2), 0.45, 0.7)))
    col = m.mix(m.math('MULTIPLY', dust, dust_a), crust, c['dust'])

    rough = m.mixf(light, 0.95, 0.75)  # 0.86은 방 반사가 회색을 얹었다(r6)
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=40, detail=4, rough=0.65), 0.5), m.math('MULTIPLY', light, 0.5))
    h = m.math('SUBTRACT', h, m.math('ADD', m.math('MULTIPLY', dark, 0.3), m.math('MULTIPLY', speck, 0.25)))
    if extra:
        col, rough, h = extra(m, dict(p=p, ang=ang, g=g, zone=zone), col, rough, h)
    return m.out(col, rough, m.bump(h, strength=0.45, distance=0.004))


def variant(lib, seed, crust=crust_material, **kw):
    """통밀 깜빠뉴 변형(wholewheat--*) — 깜빠뉴 조립(boule_variant)에 통밀 형상 · 고리 · 껍질을 넘긴다.
    kw = build_campagne_variant 인자(cut · crumb · bits · tris · opts)"""
    from boule_variant import build_campagne_variant  # 베이스는 이 모듈 없이 굽는다
    kw['opts'] = {'quality': 76, **kw.get('opts', {})}
    return build_campagne_variant(lib, seed, shape=SHAPE, disp=ring_disp, crust=crust,
                                  mesh_kw=dict(segs=240, n=280, seed=2.0), **{'tris': 11500, **kw})


# 통밀 속살 = 베이지 갈색(실물 단면). 음식 색 보정이 밝은 속살을 희게 올린다: #B88A5C는 분홍빛 흰색으로 구워졌다(d1)
CRUMB = dict(base=('#9A6230', '#AE7640'), pore='#6A4220', rim='#5A2606', pore_a=0.8, deep_col='#4A2408')  # d2 #946238은 회분홍으로 떴다


def crumb(lib, extra=None, **kw):
    """통밀 단면 = boule_variant.crumb_material(통밀 속살 색) + extra(m, p, col, rough, h) → (col, rough, h) 덧칠.
    덧칠은 다 지은 재질의 색 · 거칠기 · 범프 높이 입력 앞에 끼운다(공용 기공을 그대로 받으려고)"""
    from boule_variant import crumb_material
    mat = crumb_material(lib, SHAPE, **{**CRUMB, **kw})
    if not extra:
        return mat
    m = lib.Mat.__new__(lib.Mat)
    m.mat, m.nt = mat, mat.node_tree
    m.bsdf = m.nt.nodes['Principled BSDF']
    ins = m.bsdf.inputs
    bump = ins['Normal'].links[0].from_node
    src = [s.links[0].from_socket if s.links else s.default_value for s in (ins['Base Color'], ins['Roughness'], bump.inputs['Height'])]
    col, rough, h = extra(m, m.lpos(), *src)
    m.link(h, bump.inputs['Height'])
    return m.out(col, rough)


def blobs(m, p, scale, cover, seed=0.0, stretch=(1, 1, 1), warp=0.42, tear=0.0, mix=0.5):
    """단면에 박힌 조각 자리 → (d, rnd, keep): d = 칸 중심 거리(잡음으로 일그러짐, 조각 반지름은 0.2~0.35 문턱) ·
    rnd = 칸마다 난수(조각마다 모양 · 크기를 가른다) · keep = 쓰는 칸(cover 클수록 드물다) ·
    tear = 위쪽을 좁혀 눈물꼴로(0 = 둥근 덩이) · mix = 크기 섞는 폭"""
    pm = m.mapping(p, loc=(seed, seed * 1.7, seed * 0.3), scale=stretch)
    if tear:
        q = m.vmath('SUBTRACT', pm, m.voronoi(pm, scale=scale, randomness=1.0, out='Position'))
        ql = m.vmath('LENGTH', q)
        up = m.math('MAXIMUM', m.math('DIVIDE', m.sep(q)[2], m.math('ADD', ql, 1e-4)), 0.0)
        d0 = m.math('MULTIPLY', m.math('MULTIPLY', ql, scale), m.math('ADD', 1.0, m.math('MULTIPLY', up, tear)))
    else:
        d0 = m.voronoi(pm, scale=scale, randomness=1.0)
    d = m.math('ADD', d0, m.math('MULTIPLY', m.math('SUBTRACT', m.noise(p, scale=scale * 1.6, detail=3, distortion=0.5), 0.5), warp))
    rnd = m.sep(m.voronoi(pm, scale=scale, randomness=1.0, out='Color'))[0]
    keep = m.smooth(rnd, cover, cover + 0.01)
    d = m.math('DIVIDE', d, m.math('ADD', 1.0 - mix / 2, m.math('MULTIPLY', m.sep(m.voronoi(pm, scale=scale, randomness=1.0, out='Color'))[1], mix)))  # 크기 섞기
    # 껍질 테 · 바닥 가까이서는 조각이 줄어 사라진다 — 테를 넘어 껍질을 파먹은 무화과(정식 1판)
    edge = m.math('MAXIMUM', m.smooth(SHAPE.f_nodes(m, p), 0.8, 0.93), m.math('SUBTRACT', 1.0, m.smooth(m.sep(p)[2], 0.03, 0.09)))
    return m.math('ADD', d, m.math('MULTIPLY', edge, 0.6)), rnd, keep


def build(lib):
    lib.reset(SEED)
    ob = lib.assign(boule_mesh(lib, 'boule', SHAPE, ring_disp, segs=240, n=280, target=11500, seed=2.0),
                    crust_material(lib))
    drop_base(lib, ob)
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    return [ob], dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.45}, quality=76)  # 고리가 옆면까지 내려와 기하·색 맵이 무거워졌다(385KB)
