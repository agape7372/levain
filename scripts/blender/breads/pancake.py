"""팬케이크 (pancake) — Blender 절차 모델 (docs/BREADS.md §Blender).

레퍼런스 assets/breads/src/pancake{,-2,-3}.png — 정면(1번)이 정체성 기준. 토핑 없는 맨 3장 더미.
(프롬프트 JSON의 버터·시럽은 레퍼런스 이미지에 없다 — 이미지를 따른다.)
단위: 팬케이크 지름 1, 바닥 z=0, 정면 = Blender −Y. 장 쌓기·단면은 pancake_stack.py.
레퍼런스 실측(정면 1번): 맨 위 윗면 가운데 #E27930 → 테 #E77E33~#F8A84C, 옆벽 밝은 쪽 #F9D79D,
  그늘 쪽 #E2B471, 장 사이 골 위(아래 장 윗면 테) #DC842F. 장 두께 ≈ 지름의 0.17~0.18(정면 2번).
"""
import pancake_stack as ps
from pancake_stack import build_cakes

SEED = 5
# (반지름, 두께, xy 어긋남, z 회전, 기울기 x·y 도) — 레퍼런스는 거의 가지런히 쌓였다(손으로 놓은 작은 어긋남만)
CAKES = [
    (0.500, 0.218, (0.004, -0.003), 0.4, (0.4, -0.3)),
    (0.500, 0.220, (-0.007, 0.004), 2.1, (-0.5, 0.4)),
    (0.496, 0.222, (0.003, 0.005), 4.0, (0.3, 0.2)),
]
# 단면 모서리 — 레퍼런스 테는 거의 반원(베개처럼 통통). 공용 기본(0.070·0.086)은 옆벽이 곧게 서 원반으로 읽혔다(r1).
# 부풂(BULGE)은 짧아진 옆벽(0.03)에선 접힌 띠로 보였다(r2) — 거의 없앤다.
# pancake_stack 상수를 이 프로세스에서만 덮는다(Blender 한 번 실행 = 빵 하나) — top_z도 같은 값을 읽는다
# 돔 0.014는 윗면이 납작한 원판으로 읽혔다(본세션 검수 r5) — 낮은 돔을 살린다
ps.RCB, ps.RCT, ps.BULGE, ps.DOME = 0.088, 0.098, 0.003, 0.034


def cake_material(lib):
    """윗면 = 가운데 짙은 캐러멜 → 테 금빛으로 번지는 매끈한 구움색, 옆벽·아랫면 = 옅은 크림 속살"""
    m = lib.Mat('crumb')
    p = m.lpos()
    px = m.sep(p)
    nz = m.sep(m.lnrm())[2]
    rr = m.math('MULTIPLY', m.vmath('LENGTH', m.combine(px[0], px[1], 0.0)), 2.0)  # 0 가운데 → 1 테
    blot = m.noise(p, scale=5.5, detail=5, rough=0.6, distortion=0.3)
    # 윗면 마스크 — 테 호를 넘어 옆벽 위쪽까지 살짝 번진다(경계는 흐릿하게, 흔들림은 작게)
    top = m.smooth(m.math('ADD', nz, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.10)), 0.38, 0.80)
    ring = m.math('ADD', rr, m.math('MULTIPLY', m.math('SUBTRACT', blot, 0.5), 0.22))
    # r1 실측: 알베도 #D8661F → 렌더 #DE7A41(방 반사가 파랑을 띄워 채도가 빠진다) — 파랑을 빼고 거칠기를 올렸다
    # r5는 채도 높은 주황 단색 원판(본세션 검수) — 가운데 짙은 캐러멜 → 금갈색 → 옅은 금빛 테로 한 단계 낮췄다
    # r6(#B45614~)는 회갈색으로 죽었다 — 그 사이
    # r8 렌더 #DB823E→#F0AF5E는 레퍼런스 #F28E2F→#FCC576보다 탁했다(본세션 실측) — 반사·AO가 빼는 만큼
    # 알베도를 더 진하게(파랑 0), 캐러멜은 반지름 80%까지, 옅은 테는 가장자리 좁은 띠만
    top_c = m.ramp(ring, [(0.0, '#E46C00'), (0.45, '#E87402'), (0.80, '#EE840A'), (0.90, '#F29C2C'),
                          (1.0, '#FAC266')])  # r9는 초록이 모자라 붉었다(#E26830)
    # 얼룩 — 큰 짙은 반점과 옅은 반점(팬에 고르게 안 닿은 자리)
    mott = m.noise(p, scale=11, detail=4, rough=0.65)
    top_c = m.mix(m.math('MULTIPLY', m.smooth(mott, 0.58, 0.70), 0.28), top_c, '#BF5404')
    top_c = m.mix(m.math('MULTIPLY', m.smooth(mott, 0.40, 0.30), 0.3), top_c, '#F29630')
    # 테 근처 주근깨(작은 기공) — 레퍼런스는 금빛 테에 짙은 점이 박혔다
    pore = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(p, scale=55), 0.05, 0.11))
    pore = m.math('MULTIPLY', pore, m.smooth(rr, 0.62, 0.90))
    top_c = m.mix(m.math('MULTIPLY', pore, 0.55), top_c, '#C55E0C')
    # 테 쪽 얼룩 — 밝은 금빛 반점이 섞여 매끈한 에어브러시가 아니라 팬에 구운 결로 읽히게(r3)
    speck = m.math('MULTIPLY', m.smooth(m.noise(p, scale=38, detail=2), 0.55, 0.68), m.smooth(rr, 0.55, 0.85))
    top_c = m.mix(m.math('MULTIPLY', speck, 0.5), top_c, '#F2A84E')
    side_c = m.ramp(m.noise(p, scale=12, detail=3), [(0.35, '#F7CF8A'), (0.65, '#FBD996')])  # r3 옆벽 아래가 #CFB486 회색 — 채도를 올렸다
    # 아래를 보는 모서리 = 장 사이 골 — 약간 짙은 금빛(그늘은 AO가 더한다). r1은 0.45로 바닥이 #C18B5D 흙빛
    down = m.smooth(m.math('MULTIPLY', nz, -1.0), 0.4, 0.95)
    side_c = m.mix(m.math('MULTIPLY', down, 0.4), side_c, '#EDA850')
    col = m.mix(top, side_c, top_c)
    rough = m.mixf(top, 0.85, 0.9)  # 0.8은 방 반사가 윗면 채도를 뺐다(r8)
    crumb = m.math('SUBTRACT', 1.0, m.smooth(m.voronoi(m.mapping(p, scale=(1, 1, 1.6)), scale=90), 0.04, 0.10))
    h = m.math('ADD', m.math('MULTIPLY', m.noise(p, scale=60, detail=3), 0.3),
               m.math('MULTIPLY', m.mixf(top, crumb, pore), -0.5))
    return m.out(col, rough, m.bump(h, strength=0.3, distance=0.003))


def build(lib):
    lib.reset(SEED)
    _, parts = build_cakes(lib, cake_material(lib), CAKES, top_hole=0.0)
    for p in parts:
        print(f'  {p.name:12s} {lib.tri_count(p):6d} tri')
    return parts, dict(size=1024, rough_size=512, ao_samples=48, ao_strength={'*': 0.6, 'crumb': 0.5},
                       uv_weight={'crumb': 1.0})
