"""호밀빵 (rye) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/rye{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 길이 1(국소 X), 바닥 z=0. 길이축을 az(ANGLE)로 돌려 레퍼런스처럼 화면 왼쪽 아래 → 오른쪽 위.
구성: 바타르 몸통 1(loft — 둥근 타원, 바닥은 납작) + 긴 칼집 1(귀는 약하게).
캐러웨이 씨는 기하 없이 재질에서 3D 보로노이 씨앗(무작위 방향 타원 + 볼록 범프)으로 — 수백 알을 삼각형 없이.
색: 레퍼런스 실측 밤색 #85593F~#885330 · 짙은 얼룩 #3F2412~#5B341B · 칼집 속 #AC692F.
"""
import math

from long_loaf import loft, slash_disp, slash_masks, stations

SEED = 5
ANGLE = 132  # 길이축 방위 — 화면 기울기 ≈ 28°
W, H = 0.30, 0.29  # 가운데 반폭 · 높이
SLASHES = [(0.0, -0.06, 6, 0.33, 0.04, 0.03, 0.006)]


def section(lib):
    def fn(x, th):
        t = min(1.0, abs(x) / 0.5)
        s = (1 - t ** 2.2) ** (1 / 2.2)  # 위에서 본 윤곽 — 끝이 뭉툭한 타원
        h = H * (1 - t ** 3.2) ** 0.42  # 옆에서 본 끝도 뭉툭하게(레몬형이 되지 않게)
        c, sn = math.cos(th), math.sin(th)
        wob = 1 + 0.02 * lib.n3(x * 4, c * 1.5, sn * 1.5, 2.1)
        ry = W * s * wob
        zm = 0.4 * h
        y = ry * math.copysign(abs(c) ** (2 / 2.4), c)
        if sn >= 0:
            z = zm + (h * wob - zm) * sn ** (2 / 2.6)  # 윗면은 넓고 완만한 등
        else:
            z = zm * (1 - abs(sn) ** (2 / 2.5))  # 바닥은 좁게 납작 — 옆에서 둥글게 말려 들어간다
        return y, z
    return fn


def seeds(m, p, n, scale=30.0):
    """캐러웨이 씨 — (마스크, 높이, 테두리 그늘, 등줄기). 셀마다 무작위 방향(표면 접평면) 길쭉한 타원"""
    vor = m.node('ShaderNodeTexVoronoi', feature='F1', voronoi_dimensions='3D')
    m.link(p, vor.inputs['Vector'])
    vor.inputs['Scale'].default_value = scale
    vor.inputs['Randomness'].default_value = 1.0
    d = m.vmath('SUBTRACT', p, vor.outputs['Position'])
    dn = m.vmath('DOT_PRODUCT', d, n)
    dt = m.vmath('SUBTRACT', d, _scale(m, n, dn))  # 접평면 성분
    rnd = m.vmath('SUBTRACT', vor.outputs['Color'], (0.5, 0.5, 0.5))
    a = m.vmath('SUBTRACT', rnd, _scale(m, n, m.vmath('DOT_PRODUCT', rnd, n)))
    a = m.vmath('NORMALIZE', a)
    along = m.vmath('DOT_PRODUCT', dt, a)
    perp = m.vmath('LENGTH', m.vmath('SUBTRACT', dt, _scale(m, a, along)))
    # 반길이 · 반폭 (셀 크기 비율). 셀에 비해 크면 이웃 셀 경계에 잘려 V자·반쪽 씨가 생긴다(r7)
    L, Wd = 0.55 / scale, 0.23 / scale
    e = m.math('ADD', m.math('POWER', m.math('DIVIDE', m.math('ABSOLUTE', along), L), 2.0),
               m.math('POWER', m.math('DIVIDE', perp, Wd), 2.0))
    keep = m.math('MULTIPLY', m.math('LESS_THAN', m.math('ABSOLUTE', dn), 0.35 / scale),
                  m.math('GREATER_THAN', m.sep(vor.outputs['Color'])[1], 0.3))
    mask = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(e, 0.75, 1.0)), keep)
    height = m.math('MULTIPLY', m.math('SQRT', m.math('MAXIMUM', m.math('SUBTRACT', 1.0, e), 0.0)), keep)
    ring = m.math('MULTIPLY', m.math('MULTIPLY', m.smooth(e, 0.9, 1.05),
                                     m.math('SUBTRACT', 1.0, m.smooth(e, 1.1, 1.8))), keep)
    ridge = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, m.smooth(m.math('DIVIDE', perp, Wd), 0.0, 0.5)), mask)
    return mask, height, ring, ridge


def _scale(m, v, s):
    nd = m.node('ShaderNodeVectorMath', operation='SCALE')
    m.link(v, nd.inputs[0])
    m.link(s, nd.inputs['Scale'])
    return nd.outputs['Vector']


def crust_material(lib):
    m = lib.Mat('crust')
    p = m.lpos()
    n = m.vmath('NORMALIZE', m.lnrm())
    nz = m.sep(n)[2]
    top = m.smooth(nz, 0.2, 0.5)
    cut, ear, shade = slash_masks(m, p, SLASHES, top)

    blot = m.noise(p, scale=6.5, detail=3, rough=0.5, distortion=0.2)
    fine = m.noise(p, scale=22, detail=4)
    # 고른 짙은 밤색 바탕 + 잔잔한 얼룩 — 크고 센 얼룩은 탄 자국·때로 읽혔다(r7 검수)
    crust = m.ramp(blot, [(0.35, '#5A2806'), (0.5, '#6C3408'), (0.65, '#804210')])
    crust = m.mix(m.math('MULTIPLY', m.math('SUBTRACT', fine, 0.5), 0.3), crust, '#441E04')
    crust = m.mix(m.math('MULTIPLY', ear, 0.5), crust, '#9C6236')

    smask, sh, ring, ridge = seeds(m, p, n)
    skeep = m.math('MULTIPLY', m.math('SUBTRACT', 1.0, cut), m.smooth(nz, -0.35, 0.0))
    smask, sh, ring, ridge = (m.math('MULTIPLY', v, skeep) for v in (smask, sh, ring, ridge))
    # 씨 = 가장자리 짙고 등줄기 밝게 — 고른 밝은 타원은 쌀알 스티커로 읽혔다(r7)
    seed_c = m.ramp(sh, [(0.0, '#3E1E0A'), (0.5, '#74401A'), (1.0, '#93582A')])
    seed_c = m.mix(m.math('MULTIPLY', ridge, 0.8), seed_c, '#C08A52')
    crust = m.mix(m.math('MULTIPLY', ring, 0.7), crust, '#1E1008')
    crust = m.mix(smask, crust, seed_c)

    crumb = m.ramp(m.noise(p, scale=35, detail=3), [(0.35, '#BC7232'), (0.65, '#D28C48')])
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=120, randomness=0.9), 0.06, 0.16))
    crumb = m.mix(m.math('MULTIPLY', pore, 0.5), crumb, '#7A4320')
    crumb = m.mix(shade, crumb, '#3E200C')  # 먼 쪽 테 밑 그늘 — 골로 읽히게
    col = m.mix(cut, crust, crumb)

    rough = m.mixf(cut, m.mixf(smask, 0.93, 0.8), 0.92)
    h = m.math('ADD', m.math('MULTIPLY', fine, 0.35), m.math('MULTIPLY', m.noise(p, scale=70, detail=2), 0.25))
    h = m.math('ADD', h, m.math('MULTIPLY', sh, 2.2))
    h = m.mixf(cut, h, m.math('MULTIPLY', pore, -0.6))
    return m.out(col, rough, m.bump(h, strength=0.5, distance=0.004))


def build(lib):
    lib.reset(SEED)
    mat = crust_material(lib)
    ob = loft(lib, 'rye', stations(140, 0.6), section(lib), nth=88)
    lib.displace_normal(ob, slash_disp(SLASHES, H * 0.6))
    lib.decimate(ob, min(1.0, 11000 / max(1, lib.tri_count(ob))))
    lib.place(ob, rot=(0, 0, lib.az(ANGLE)))
    lib.assign(ob, mat)
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    return [ob], dict(size=1024, rough_size=512, ao_samples=48, ao_strength=0.45)
