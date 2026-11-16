"""초코 크래커 — 실물 사진(네이버 이미지 검색 화면, 2026-11-16)을 보고 지음. 판 · 구멍 · 껍질은 slab.build_cracker.

실물: 금빛 크래커에 초콜릿을 한쪽 면 · 반쪽만 입힌 과자(마켓오 리얼크래커 초코 · 말키스트)가 대표다. 코코아 판은 드물다.
구성: 금빛 판 반쪽을 윤 도는 밀크 초콜릿에 담갔다 뺀 꼴(경계는 흘러내린 듯 흔들림 · 옆면까지 덮음).
코코아 판 + 흰 설탕 결정 초안은 짙은 것 위 흰 알(곰팡이)로 읽혀 버렸다.
"""
import slab


def build(lib):
    def extra(m, col, p, nz):
        px = m.sep(p)
        wav = m.math('MULTIPLY', m.math('SUBTRACT', m.noise(m.mapping(p, scale=(0, 1, 0)), scale=4, detail=2), 0.5), 0.10)
        dip = m.smooth(m.math('ADD', m.math('ADD', px[0], m.math('MULTIPLY', px[1], 0.35)), wav), 0.02, 0.035)
        choc = m.ramp(m.noise(p, scale=9, detail=3), [(0.3, '#4A2614'), (0.7, '#62341C')])
        return m.mix(dip, col, choc), dip, 0.4

    return slab.build_cracker(lib, seed=13, pal=dict(speck=None), extra=extra)
