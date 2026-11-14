"""바게트 (baguette) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/baguette{,-2,-3}.png — 정면(1번)이 정체성 기준.
단위: 길이 1(국소 X), 바닥 z=0. 배치에서 길이축을 az(ANGLE)로 돌려 레퍼런스처럼 화면 왼쪽 아래 → 오른쪽 위.
구성: 몸통 1(loft — 납작한 바닥 · 뾰족하게 둥근 양끝) + 사선 칼집 4(속살 렌즈 · 한쪽 테가 들린 귀).
색: 레퍼런스 실측 껍질 #BE6E22 · 귀 #E4AC5E · 속살 #F9DCA6 · 끝 #9A571A~#A55E1B.
"""
import math

from long_loaf import loft, slash_disp, slash_masks, stations

SEED = 3
ANGLE = 125  # 길이축 방위(썸네일 카메라 기준 α). 레퍼런스 기울기(25°, 129)보다 눕혀 화면 길이를 번다
RY, RZ = 0.076, 0.062  # 가운데 단면 반폭·반높이(바닥은 납작)
# 칼집 — (x, y, 각도°, 반길이, 반폭, 깊이, 귀). 레퍼런스 = 4개, 길이의 ≈18%씩 살짝 겹치며 사선으로 지난다
SLASHES = [(-0.26, -0.022, -17, 0.105, 0.027, 0.013, 0.008),
           (-0.085, -0.022, -17, 0.105, 0.027, 0.013, 0.008),
           (0.085, -0.022, -17, 0.105, 0.027, 0.013, 0.008),
           (0.26, -0.022, -17, 0.105, 0.027, 0.013, 0.008)]


def taper(x):
    t = min(1.0, abs(x) / 0.5)
    return (1 - t ** 3.2) ** 0.5


def section(lib):
    def fn(x, th):
        s = taper(x)
        c, sn = math.cos(th), math.sin(th)
        wob = 1 + 0.025 * lib.n3(x * 9, c, sn, 1.3)  # 손으로 빚은 울퉁불퉁함
        ry, rz = RY * s * wob, RZ * s * wob
        zc = 0.72 * rz
        z = zc + rz * sn * (1.0 if sn > 0 else 0.72)  # 아래 반은 눌려 납작한 바닥
        return ry * c, max(0.0, z)
    return fn


def crust_material(lib):
    m = lib.Mat('crust')
    p = m.lpos()
    px = m.sep(p)
    nz = m.sep(m.lnrm())[2]
    top = m.smooth(nz, 0.15, 0.45)
    cut, ear, shade = slash_masks(m, p, SLASHES, top)

    blot = m.noise(p, scale=9, detail=5, rough=0.6, distortion=0.3)
    # 레퍼런스 껍질 #BE6E22 — 방 반사가 채도를 빼므로 알베도는 더 진한 주황 금빛으로
    crust = m.ramp(blot, [(0.25, '#9A480A'), (0.45, '#C26410'), (0.62, '#D8800F'), (0.8, '#E5992A')])
    ends = m.smooth(m.math('ABSOLUTE', px[0]), 0.34, 0.5)
    crust = m.mix(m.math('MULTIPLY', ends, 0.75), crust, '#84400F')
    # 잔금 — 윗면 껍질이 식으며 갈라진 가는 선
    crack = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(0.6, 1, 1)), scale=38,
                                                       feature='DISTANCE_TO_EDGE'), 0.0, 0.05))
    crack = m.math('MULTIPLY', crack, m.math('MULTIPLY', top, m.smooth(blot, 0.45, 0.6)))
    crust = m.mix(m.math('MULTIPLY', crack, 0.18), crust, '#7E3A0C')
    crust = m.mix(m.math('MULTIPLY', top, 0.35), crust, '#A24F0C')  # 윗면 마루가 더 구워진다
    # 아래를 보는 면은 연한 금빛
    crust = m.mix(m.math('MULTIPLY', m.smooth(m.math('MULTIPLY', nz, -1.0), 0.2, 0.8), 0.6), crust, '#D9A15A')
    crust = m.mix(m.math('MULTIPLY', ear, 0.9), crust, '#EAAB4C')  # 귀 = 들린 테, 밝은 금빛

    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=140, randomness=0.9), 0.06, 0.16))
    crumb = m.ramp(m.noise(p, scale=30, detail=3), [(0.3, '#F7D99C'), (0.7, '#FDE8BC')])
    crumb = m.mix(m.math('MULTIPLY', pore, 0.5), crumb, '#D6A86A')
    crumb = m.mix(m.math('MULTIPLY', shade, 0.85), crumb, '#A65A18')  # 귀 밑 — 구운 금빛 그늘 → 선
    col = m.mix(cut, crust, crumb)

    rough = m.mixf(cut, 0.82, 0.9)
    h = m.math('MULTIPLY', m.noise(p, scale=60, detail=3), 0.4)
    h = m.math('ADD', h, m.math('MULTIPLY', blot, 0.3))
    h = m.math('SUBTRACT', h, m.math('MULTIPLY', crack, 0.5))
    h = m.mixf(cut, h, m.math('MULTIPLY', pore, -0.6))
    return m.out(col, rough, m.bump(h, strength=0.5, distance=0.003))


def build(lib):
    lib.reset(SEED)
    mat = crust_material(lib)
    ob = loft(lib, 'baguette', stations(190, 0.6), section(lib), nth=72)
    lib.displace_normal(ob, slash_disp(SLASHES, RZ * 0.9))
    lib.decimate(ob, min(1.0, 13000 / max(1, lib.tri_count(ob))))
    lib.place(ob, rot=(0, 0, lib.az(ANGLE)))
    lib.assign(ob, mat)
    print(f'  {ob.name:12s} {lib.tri_count(ob):6d} tri')
    return [ob], dict(size=1024, rough_size=512, ao_samples=48, ao_strength=0.55)
