"""Normalize framing before Tier-1 diagnostics — copied from assets/breads/work/pancake/align_pair.py
(CRIB.md: "Tier-1 diagnose_render는 정렬 후 판정"). Only the background hex changed (this bread's
own prompt JSON background, not pancake's).

Usage: python3 align_pair.py <in.png> <out.png>
"""
import sys
from pathlib import Path

SKILL = Path.home() / ".claude" / "skills" / "img2threejs"
sys.path.insert(0, str(SKILL / "forge" / "stage1_intake"))
sys.path.insert(0, str(SKILL / "forge" / "_shared"))

from extract_pbr_evidence import build_foreground_mask, load_image, mask_bbox, write_png_rgb  # noqa: E402

SIZE = 512
MARGIN = 0.08
BACKGROUND = (0xDF, 0xEA, 0xE0)  # assets/prompts/breads/scone--choco-chip.json background, pale sage #DFEAE0


def main(src: str, dst: str) -> int:
    width, height, pixels, _ = load_image(Path(src))
    mask, stats, _ = build_foreground_mask(width, height, pixels)
    x0, y0, bw, bh = mask_bbox(width, height, mask)
    side = max(bw, bh) * (1 + 2 * MARGIN)
    cx, cy = x0 + bw / 2, y0 + bh / 2
    left, top = cx - side / 2, cy - side / 2

    out = bytearray()
    for y in range(SIZE):
        sy = int(top + (y + 0.5) * side / SIZE)
        for x in range(SIZE):
            sx = int(left + (x + 0.5) * side / SIZE)
            if 0 <= sx < width and 0 <= sy < height:
                r, g, b, a = pixels[sy * width + sx]
                if a < 250:
                    f = a / 255
                    r, g, b = (int(c * f + bg * (1 - f)) for c, bg in zip((r, g, b), BACKGROUND))
            else:
                r, g, b = BACKGROUND
            out += bytes((r, g, b))

    write_png_rgb(Path(dst), SIZE, SIZE, bytes(out))
    print(f"{dst}  bbox={bw}x{bh} coverage={stats['foregroundCoverage']} bg={stats['backgroundColor']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
