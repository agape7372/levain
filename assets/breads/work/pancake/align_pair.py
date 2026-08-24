"""Normalize framing before Tier-1 diagnostics.

diagnose_render.py's silhouette/aspect/scale checks are pixel-aligned, so against an unaligned
pair they measure framing, not fidelity: the reference is 1536x1024 with the object at one scale,
the harness render is 512x512 with the object at another. grimoire/review/self_correction.md says
exactly this ("dominated by framing + background + scale + lighting, NOT fidelity") and prescribes
"IoU only after scale+translation alignment". This script performs that alignment for BOTH images
identically - square-crop to the object's own bounding box with a fixed margin, resample to 512,
and composite onto one shared background - so what survives is shape agreement.

It changes no pixel values inside the silhouette and favours neither image.

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
BACKGROUND = (0xDF, 0xEA, 0xE0)  # assets/prompts/breads/pancake.json background, pale sage #DFEAE0


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
                # Composite onto the shared background so an alpha render and an opaque
                # reference cannot differ on background alone.
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
