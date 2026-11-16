"""코코넛 식빵 (loaf--coconut-dried) — 형상 · 껍질은 loaf_kit.build_loaf, 코코넛 채는 loaf_kit.flake(curl) 를 cover_pts 자리에.

실물: 네이버 이미지 「코코넛 식빵」(2026-11-16) — 뚜껑을 코코넛 채가 수북이 덮어 노릇하게 구워졌다(가는 채가 엉켜 끝이 금빛으로 그을림). 옆벽은 보통.
구성: 껍질 쪽 — 돔을 수북이 덮은 가는 코코넛 채(휜 채 · 방향 흩음 · 크림에서 금빛까지, 순백 아님) · 어깨로 성기게 · 단면 없음.
"""
import loaf_kit as lk
import slab

PAL = dict(crust=('#C8782A', '#D48834', '#DE963E'))


def shreds(lib, body, rnd, x0):
    mat = slab.plain_mat(lib, 'coconut', '#DCB27A', '#F2DCB2', rough=0.8, scale=45)
    pts = lk.cover_pts(lib, rnd, x0, 210, 0.02, edge=0.27, fade=0.07, seed=8.0, holes=0.15)

    def shred(lib, nm, r):
        s = r.uniform(0.8, 1.25)
        return lk.flake(lib, nm, 0.07 * s, 0.036, 0.007, r, n=6, jit=0.1, curl=r.uniform(0.15, 0.3))

    return lk.stud(lib, body, pts, shred, mat, rnd, sink=(-0.8, 0.2), tilt=0.45, name='coconut')


def build(lib):
    return lk.build_loaf(lib, seed=57, pal=PAL, top=shreds,
                         opts=dict(quality=74, uv_weight={'coconut': 1.4}, ao_strength={'*': 0.25, 'coconut': 0.45}))
