"""가닥 상세 맵 — 굽기 결과(npy) → public/fx/strand_detail.png(RGBA8 256×512) + 확인 그림.

python strand_detail_pack.py pack  <work> <out.png>
python strand_detail_pack.py board <work> <out.png> <ref.png>

채널: R·G = 탄젠트 노멀 x(둘레 +u) · y(길이 +v), 0.5 = 0 · B = 틈(AO, 1 = 트임) · A = 높이 0.5 + h / HSCALE (h = 반지름 단위).
PNG 맨 윗줄 = v 1(three TextureLoader flipY 기본값과 맞음).
"""
import os
import sys

import numpy as np
from PIL import Image

HSCALE = 0.2  # A 0..1 ↔ h −0.1r..+0.1r
TAU = 2 * np.pi


def blur(a, sig):
    """둘레 · 길이 주기 가우스 블러(FFT) — 맵 이음매 유지"""
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    return np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (np.pi * sig) ** 2 * (fx * fx + fy * fy))).real


def pack(work, out):
    n = np.load(os.path.join(work, 'bake_n.npy'))[..., :3] * 2 - 1
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    ao = np.load(os.path.join(work, 'bake_ao.npy'))[..., 0]
    H = np.load(os.path.join(work, 'height.npy'))
    hv, hu = H.shape
    mh, mw = ao.shape
    f = hv // mh
    h = H.reshape(mh, f, mw, f).mean((1, 3))

    # 부호 확인: R ~ −∂h/∂u, G ~ −∂h/∂v (r = 1 단위 호 길이)
    gy, gx = np.gradient(h, 2 * TAU / mh, TAU / mw)
    cx = np.corrcoef(n[..., 0].ravel(), -gx.ravel())[0, 1]
    cy = np.corrcoef(n[..., 1].ravel(), -gy.ravel())[0, 1]

    # 틈(B) 2차: 구운 AO의 어두운 몫 + 낮은 곳(띠 사이)을 흐리게 번지고 0.8..1로 눌러 약하게. 짙은 선 금지
    lo, hi = np.percentile(h, [3, 55])
    valley = np.clip((hi - h) / (hi - lo), 0, 1) ** 0.9   # 띠 사이 낮은 곳 = 반투명한 그늘
    dark = 0.5 * (1 - np.clip(ao, 0, 1)) / max(np.percentile(1 - ao, 99.5), 1e-6) + valley
    dark = blur(dark, 4)
    dark = np.clip(dark / max(np.percentile(dark, 96), 1e-6), 0, 1)
    ao = 1 - 0.2 * dark

    rgba = np.stack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, np.clip(ao, 0, 1),
                     np.clip(0.5 + h / HSCALE, 0, 1)], -1)
    q = np.clip(np.round(rgba * 255), 0, 255).astype(np.uint8)[::-1]  # 윗줄 = v 1
    Image.fromarray(q, 'RGBA').save(out, optimize=True)

    def seam(a):  # 끝 열/행 차이 ÷ 안쪽 이웃 차이 평균 (≈1이면 이음매 없음)
        a = a.astype(float)
        du = np.abs(a[:, 0] - a[:, -1]).mean() / np.abs(np.diff(a, axis=1)).mean()
        dv = np.abs(a[0] - a[-1]).mean() / np.abs(np.diff(a, axis=0)).mean()
        return round(du, 2), round(dv, 2)

    print(f'PNG {out} {os.path.getsize(out)} B {q.shape[1]}x{q.shape[0]}')
    print(f'sign corr R/-dh_du {cx:.3f} G/-dh_dv {cy:.3f}')
    for k, c in enumerate('RGBA'):
        print(f'{c} min {q[..., k].min()} max {q[..., k].max()} mean {q[..., k].mean():.1f} seam(u,v) {seam(q[..., k])}')
    tilt = np.degrees(np.arccos(np.clip(n[..., 2], -1, 1)))
    print(f'normal tilt deg mean {tilt.mean():.1f} p95 {np.percentile(tilt, 95):.1f} | AO p5 {np.percentile(ao, 5):.2f} '
          f'| dark(AO<0.6) {np.mean(ao < 0.6) * 100:.1f}%')


def shade(png):
    q = np.asarray(Image.open(png)).astype(float) / 255
    x, y = q[..., 0] * 2 - 1, q[..., 1] * 2 - 1
    z = np.sqrt(np.clip(1 - x * x - y * y, 0, 1))
    Ld = np.array([-0.55, 0.35, 0.76]); Ld /= np.linalg.norm(Ld)
    s = np.clip(x * Ld[0] + y * Ld[1] + z * Ld[2], 0, 1) * (0.15 + 0.85 * q[..., 2])
    base = np.array([0xf4, 0xea, 0xd4]) / 255
    return s, q


def board(work, png, ref):
    s, q = shade(png)
    base = np.array([0xf4, 0xea, 0xd4])
    lit = (np.clip(s / np.percentile(s, 99), 0, 1)[..., None] * base).astype(np.uint8)
    t = lambda a: np.tile(a, (3, 3) + (1,) * (a.ndim - 2))  # noqa: E731
    ao = (q[..., 2] * 255).astype(np.uint8)
    ht = (q[..., 3] * 255).astype(np.uint8)
    panels = [Image.fromarray(t(lit)), Image.fromarray(t(ao)).convert('RGB'), Image.fromarray(t(ht)).convert('RGB')]
    W = sum(p.width for p in panels) + 40
    tile = Image.new('RGB', (W, panels[0].height), (40, 40, 40))
    x = 0
    for p in panels:
        tile.paste(p, (x, 0))
        x += p.width + 20
    tile.save(os.path.join(work, 'tile3x3.png'))

    # compare = [실물 9s 칸 | r2 가까이 | 지금 앱 col.png]
    im = Image.open(ref)
    cw, ch = 260, 146
    imgs = [im.crop((cw + 55, ch, cw + 205, 2 * ch)).resize((600, 584), Image.LANCZOS)]
    v = Image.open(os.path.join(work, 'view_close.png')).convert('RGB')
    imgs.append(v.resize((int(v.width * 584 / v.height),) * 1 + (584,), Image.LANCZOS))
    app = Image.open(r'D:/levain-wt-dough/.work/feel2/ours/col.png').convert('RGB')
    imgs.append(app.resize((int(app.width * 584 / app.height), 584), Image.LANCZOS))
    W = sum(i.width for i in imgs) + 10 * (len(imgs) - 1)
    out = Image.new('RGB', (W, 584), (250, 246, 238))
    x = 0
    for i in imgs:
        out.paste(i, (x, 0))
        x += i.width + 10
    out.save(os.path.join(work, 'compare.png'))
    print('BOARD', os.path.join(work, 'tile3x3.png'), os.path.join(work, 'compare.png'))


if __name__ == '__main__':
    if sys.argv[1] == 'pack':
        pack(sys.argv[2], sys.argv[3])
    else:
        board(sys.argv[2], sys.argv[3], sys.argv[4])
