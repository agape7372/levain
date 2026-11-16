"""해바라기씨 식빵 (loaf--sunflowerseed-seed) — 형상 · 껍질은 loaf_kit.build_loaf, 씨는 loaf_kit.flake(taper) 를 cover_pts 자리에.

실물: 네이버 이미지 「해바라기씨 식빵」(2026-11-16) — 뚜껑을 해바라기씨 알맹이가 겹쳐 덮어 구워졌다(가늘고 끝이 뾰족한 잿빛 베이지 알, 끝이 노릇). 옆벽은 보통.
구성: 껍질 쪽 — 돔을 겹쳐 덮은 해바라기씨(뾰족한 물방울꼴 · 잿빛 베이지 · 방향 흩음, 어깨로 성기게) · 단면 없음.
(오트밀 = 넓적한 크림 조각, 이쪽 = 가늘고 뾰족한 잿빛 알로 가른다)
"""
import loaf_kit as lk
import slab


def kernels(lib, body, rnd, x0):
    mat = slab.plain_mat(lib, 'seed', '#A89A78', '#C4B692', rough=0.6, scale=80)
    pts = lk.cover_pts(lib, rnd, x0, 300, 0.02, edge=0.28, fade=0.07, seed=6.0, holes=0.12)

    def kernel(lib, nm, r):
        s = r.uniform(0.85, 1.15)
        return lk.flake(lib, nm, 0.066 * s, 0.03 * s, 0.012, r, n=6, jit=0.08, taper=0.5)

    return lk.stud(lib, body, pts, kernel, mat, rnd, sink=(-0.5, 0.3), tilt=0.4, name='seed')


def build(lib):
    return lk.build_loaf(lib, seed=61, pal=dict(crust=('#C0702A', '#CC7E32', '#D68C3A')), top=kernels,
                         opts=dict(uv_weight={'seed': 1.4}, ao_strength={'*': 0.25, 'seed': 0.45}))
