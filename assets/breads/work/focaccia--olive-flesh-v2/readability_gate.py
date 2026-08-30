"""CRIB readability gate: composite the 512^2 render onto the real card background color
(docs/VISUAL.md --bg-soft #F2E6D3, not the AI-render's pale-sage placeholder), then downsample to
64^2 with LANCZOS -- that is closer to the actual on-screen thumbnail size (~64px) than a DPR
render on a white/sage background. Chroma-keys out the harness's uniform background (sampled from
a corner pixel) since breadlab-shot bakes it into the PNG rather than leaving it transparent.
"""
import sys
from PIL import Image

CARD_BG = (0xF2, 0xE6, 0xD3)  # docs/VISUAL.md --bg-soft
THRESHOLD = 24  # per-channel distance to treat as background


def main(src_path: str, out_path: str) -> None:
    img = Image.open(src_path).convert("RGBA")
    bg = img.getpixel((2, 2))[:3]
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - bg[0]) <= THRESHOLD and abs(g - bg[1]) <= THRESHOLD and abs(b - bg[2]) <= THRESHOLD:
                px[x, y] = (r, g, b, 0)
    card = Image.new("RGBA", img.size, CARD_BG + (255,))
    card.alpha_composite(img)
    card = card.convert("RGB")
    small = card.resize((64, 64), Image.LANCZOS)
    # Also save a scaled-up-for-viewing copy (nearest neighbor, no smoothing) so the 64px result
    # is inspectable without the image viewer's own interpolation lying about it.
    small.save(out_path)
    viewer = small.resize((512, 512), Image.NEAREST)
    viewer.save(out_path.replace(".png", "-viewer512.png"))
    print(f"wrote {out_path} (64x64) and viewer copy")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
