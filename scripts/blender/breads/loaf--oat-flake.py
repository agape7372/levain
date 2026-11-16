"""오트밀 식빵 (loaf--oat-flake) — 형상 · 껍질은 loaf_kit.build_loaf, 귀리는 loaf_kit.flake 를 cover_pts 자리에 stud 로 앉힌다.

실물: 네이버 이미지 「오트밀 식빵」(2026-11-16) — 뚜껑 돔을 납작 귀리가 거의 덮어 구워졌다(옅은 크림 · 노릇한 끝, 겹쳐 붙음). 가장자리(어깨)만 성기다. 옆벽은 보통.
구성: 껍질 쪽 — 돔을 겹쳐 덮은 납작 귀리(크기 · 방향 · 기울기 흩음, 어깨로 성기게) · 조금 짙게 구운 뚜껑.
성기게 흩은 첫 판은 「대충 뿌렸다」로 읽혔다(두뇌 검토 11-16).
"""
import loaf_kit as lk
import slab

PAL = dict(crust=('#BC6C26', '#C87A2E', '#D28836'), ridge='#A45618')


def oats(lib, body, rnd, x0):
    mat = slab.plain_mat(lib, 'oat', '#D2AC6A', '#E8CC92', rough=0.8, scale=70)
    pts = lk.cover_pts(lib, rnd, x0, 250, 0.026, edge=0.285, fade=0.07, seed=4.0, holes=0.0)

    def oat(lib, nm, r):
        s = r.uniform(0.75, 1.2)
        return lk.flake(lib, nm, 0.076 * s, 0.054 * s, 0.008, r, n=8)

    return lk.stud(lib, body, pts, oat, mat, rnd, sink=(-0.6, 0.4), tilt=0.35, name='oat')


def build(lib):
    return lk.build_loaf(lib, seed=29, pal=PAL, top=oats,
                         opts=dict(ao_strength={'*': 0.25, 'oat': 0.45}, uv_weight={'oat': 1.4}))
