"""귀리 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 통밀빛 황갈색 판에 납작한 귀리 플레이크가 크기 제각각으로 박혀 겉에 드러난다(옅은 크림색 · 가장자리가 구워짐).
구성: 황갈색 통밀 판 · 눌러 붙인 둥글넓적한 귀리 플레이크 24장(크기를 크게 섞음).
"""
import slab


def build(lib):
    def top(put, rnd):
        oat = slab.plain_mat(lib, 'oat', '#D8BE8C', '#ECD8AE', rough=0.85, scale=50)
        for k, (x, y) in enumerate(slab.scatter(rnd, 24, 1.0, 1.0, 0.08)):
            a = rnd.uniform(0.05, 0.095)
            put(slab.pebble(lib, f'oat{k}', a, a * rnd.uniform(0.62, 0.85), 0.008, rnd, jit=0.06, subdiv=2), oat, x, y,
                lift=0.0012, lean=10)

    pal = dict(ramp=('#BC864A', '#C99656', '#D6A664'), edge='#A06C34', blist='#E0B87A', hole='#9A6430',
               side='#AE7A40', speck=None)
    return slab.build_cracker(lib, seed=16, pal=pal, top=top, opts=dict(uv_weight={'oat': 1.2}))
