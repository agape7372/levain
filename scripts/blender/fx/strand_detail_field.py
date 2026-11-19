"""가닥 상세 맵 2차 — 고해상 높이장(주기 함수, numpy만). strand_detail.py(블렌더)가 이걸 변위로 원통에 입혀 굽는다.

단위: 관 반지름 r = 1. X = 둘레 호 길이(0..2π), Y = 길이(0..4π = 둘레 두 바퀴). 둘 다 주기라 이음매가 없다.
실물(.work/refs/feel2 UPQ94 9s): 넓고 부드러운 밝은 띠와 어두운 띠가 세로로 번갈아 선다. 경계는 흐리다.
2차 구성(1차의 가는 짙은 선 · 렌즈 구멍 폐기):
  넓은 띠 8~14줄(가우스 단면, 폭 ±50% · 높이 제각각, 길이 방향 천천히 굽이 + 공통 살짝 꼬임, 세 쌍은 합쳐졌다 갈라짐)
  + 아주 옅은 가는 섬유 24줄(띠 기울기의 절반 이하) + 얕고 부드러운 길쭉한 패임 7개.

python strand_detail_field.py <out_dir>  → height.npy (NV, NU) float32, 행 0 = Y 0
"""
import sys

import numpy as np

TAU = 2 * np.pi
C = TAU          # 둘레
L = 2 * TAU      # 길이 한 주기 = 둘레 두 바퀴
NU, NV = 1024, 2048  # 굽기 맵(256×512)의 4배
DX = C / NU
DY = L / NV

PLAIN = 8            # 홑 띠
PAIRS = 3            # 합쳐졌다 갈라지는 쌍(합치면 11 · 갈라지면 최대 14줄)
SIG0 = 0.085         # 띠 반폭(가우스 σ) 기준 — 간격 C/11 = 0.57
AMP0 = 0.032         # 띠 높이 기준(r 단위)
FIBERS = 24
BUBBLES = 7


def _wrap(d, p):
    return d - p * np.round(d / p)


def build(seed=11):
    rng = np.random.default_rng(seed)
    X = (np.arange(NU) + 0.5) * DX
    Y = (np.arange(NV) + 0.5) * DY
    ph = lambda: rng.uniform(0, TAU)  # noqa: E731
    H = np.zeros((NV, NU), np.float32)

    # 공통 꼬임 — 모든 띠가 같이 살짝 돌아간다(길이 한 주기에 최대 ≈ 14°)
    tw_a, tw_p = 0.11, ph()

    def path(x0, a1, a2):
        p1, p2 = ph(), ph()
        return (x0 + tw_a * np.sin(TAU * Y / L + tw_p)
                + a1 * np.sin(TAU * Y / L + p1) + a2 * np.sin(2 * TAU * Y / L + p2))

    def gauss(xc, sig, amp):
        d = _wrap(X[None, :] - xc[:, None], C) / sig[:, None]
        return (amp[:, None] * np.exp(-0.5 * d * d)).astype(np.float32)

    def wobble(base, rel, k):  # 길이 방향으로 천천히 변하는 값(주기)
        return base * (1 + rel * np.sin(k * TAU * Y / L + ph()))

    slots = PLAIN + PAIRS
    order = rng.permutation(slots)
    centers = (np.arange(slots) + 0.5 + rng.uniform(-0.28, 0.28, slots)) / slots * C
    pair_slots = set(order[:PAIRS].tolist())
    for i in range(slots):
        sig_f = float(np.clip(rng.normal(1.0, 0.3), 0.5, 1.5))
        amp_f = rng.uniform(0.6, 1.6)
        x0 = centers[i]
        a1, a2 = rng.uniform(0.03, 0.10), rng.uniform(0.01, 0.04)
        if i not in pair_slots:
            sig = wobble(SIG0 * sig_f, 0.2, 1)
            amp = wobble(AMP0 * amp_f, 0.3, 2)
            H += gauss(path(x0, a1, a2), sig, amp)
        else:
            # 쌍: 두 가닥이 벌어졌다가(δ) 한 줄로 합쳐진다(max). 길이 한 주기에 한 번씩 합류
            xc = path(x0, a1, a2)
            dl = rng.uniform(0.16, 0.24) * np.clip(1.6 * np.cos(TAU * Y / L + ph()) + 0.2, 0, 1)
            sig = wobble(SIG0 * 0.7 * sig_f, 0.15, 1)
            amp = wobble(AMP0 * amp_f, 0.25, 2)
            g1, g2 = gauss(xc - dl, sig, amp), gauss(xc + dl, sig, amp * rng.uniform(0.7, 1.1))
            H += ((g1 ** 3 + g2 ** 3) ** (1 / 3)).astype(np.float32)  # 부드러운 max — 진짜 max는 V자 주름선이 생긴다

    # 가는 섬유 — 띠 위에 얹힌 옅은 줄. 길이 일부에서만 보이고(코사인 창) 곧게
    for _ in range(FIBERS):
        ln = rng.uniform(0.25, 0.7) * L
        yc = rng.uniform(0, L)
        w = np.clip(1 - np.abs(_wrap(Y - yc, L)) / (ln / 2), 0, 1)
        w = np.sin(0.5 * np.pi * w) ** 2
        xc = rng.uniform(0, C) + rng.normal(0, 0.02) * _wrap(Y - yc, L) + 0.03 * np.sin(TAU * Y / L + ph())
        sig = np.full(NV, rng.uniform(0.04, 0.055))
        H += gauss(xc, sig, w * rng.uniform(0.001, 0.002))

    # 기포 — 얕고 부드러운 길쭉한 패임(종횡 4~6), 구멍 · 테두리 없음
    for _ in range(BUBBLES):
        b = rng.uniform(0.05, 0.085)
        a = b * rng.uniform(4, 6)
        ang = rng.normal(0, 0.05)
        cx, cy = rng.uniform(0, C), rng.uniform(0, L)
        depth = rng.uniform(0.008, 0.013)
        ry, rx = int(2.6 * a / DY) + 2, int(2.6 * (b + a * abs(np.sin(ang))) / DX) + 2
        jy = (int(cy / DY) + np.arange(-ry, ry + 1)) % NV
        ix = (int(cx / DX) + np.arange(-rx, rx + 1)) % NU
        dy = _wrap(Y[jy] - cy, L)[:, None]
        dx = _wrap(X[ix] - cx, C)[None, :]
        ca, sa = np.cos(ang), np.sin(ang)
        pl, pc = dy * ca + dx * sa, dx * ca - dy * sa
        H[np.ix_(jy, ix)] -= (depth * np.exp(-0.5 * ((pl / a) ** 2 + (pc / b) ** 2) * 2.0)).astype(np.float32)

    H -= H.mean()
    return H.astype(np.float32)


if __name__ == '__main__':
    import os
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    H = build()
    np.save(os.path.join(out, 'height.npy'), H)
    gy, gx = np.gradient(H, DY, DX)
    print(f'height {H.shape} min {H.min():.4f} max {H.max():.4f} pp {np.ptp(H):.4f} std {H.std():.4f} '
          f'slope deg p50 {np.degrees(np.arctan(np.hypot(gx, gy)[::4, ::4])).mean():.1f} '
          f'p99 {np.percentile(np.degrees(np.arctan(np.hypot(gx, gy))), 99):.1f}')
    try:
        from PIL import Image
        nz = np.ones_like(H)
        ln = np.sqrt(gx * gx + gy * gy + nz * nz)
        Ld = np.array([-0.6, 0.35, 0.72]); Ld /= np.linalg.norm(Ld)
        s = np.clip((gx * -Ld[0] + gy * -Ld[1] + nz * Ld[2]) / ln, 0, 1)
        img = (np.tile(s[::-1, :], (1, 2)) * 255).astype(np.uint8)
        Image.fromarray(img).resize((1024, 1024)).save(os.path.join(out, 'field_quick.png'))
    except ImportError:
        pass
