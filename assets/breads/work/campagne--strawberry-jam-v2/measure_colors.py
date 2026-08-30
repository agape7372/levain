"""Top-down fixed-plane color measurement, wide-net sampling (sibling-team method).
Usage: python3 measure_colors.py
"""
import sys
from pathlib import Path
from PIL import Image
import numpy as np

WS = Path(__file__).resolve().parent
SRC = WS.parents[1] / "src"

REF_TOP = SRC / "campagne--strawberry-jam-3.png"
REF_FRONT = SRC / "campagne--strawberry-jam-2.png"
OUR_TOP = WS / "view-top-v3.png"
OUR_FRONT = WS / "view-front-v3.png"

BG_SAGE = np.array([223, 234, 224])  # approx pale sage bg, generous threshold below


def load(path):
    return np.array(Image.open(path).convert("RGB"), dtype=np.int32)


def fg_mask(arr, bg, thresh=28):
    d = np.abs(arr - bg[None, None, :]).sum(axis=2)
    return d > thresh


def crust_sample(arr, mask):
    """Wide net: brightest quartile of foreground pixels by luma, median RGB.
    Excludes near-white (dusting/highlight outliers) and near-black (deep groove shadow)."""
    fg = arr[mask]
    luma = fg.mean(axis=1)
    # exclude extremes (dusting speckle / groove-bottom shadow), keep the broad mid-bright band
    lo, hi = np.percentile(luma, [55, 85])
    band = fg[(luma >= lo) & (luma <= hi)]
    return np.median(band, axis=0), len(band)


def crumb_sample(arr, mask, region_box):
    """region_box = (x0,y0,x1,y1) normalized 0..1, restricted to the pale (non-jam, non-crust)
    band: high brightness, low red-dominance (jam is red-heavy, crust is darker)."""
    h, w, _ = arr.shape
    x0, y0, x1, y1 = region_box
    sub = arr[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    subm = mask[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    fg = sub[subm]
    if len(fg) == 0:
        return None, 0
    luma = fg.mean(axis=1)
    redness = fg[:, 0].astype(float) - fg[:, 1:].mean(axis=1)
    pale = fg[(luma > 150) & (redness < 25)]
    if len(pale) == 0:
        return None, 0
    return np.median(pale, axis=0), len(pale)


def hexstr(rgb):
    r, g, b = [int(round(c)) for c in rgb]
    return f"#{r:02X}{g:02X}{b:02X} ({r},{g},{b})"


def main():
    ref_top = load(REF_TOP)
    our_top = load(OUR_TOP)
    ref_front = load(REF_FRONT)
    our_front = load(OUR_FRONT)

    ref_top_mask = fg_mask(ref_top, np.array([223, 234, 224]))
    our_top_mask = fg_mask(our_top, np.array(our_top[2, 2]))
    ref_front_mask = fg_mask(ref_front, np.array([223, 234, 224]))
    our_front_mask = fg_mask(our_front, np.array(our_front[2, 2]))

    print("=== crust (top-down fixed plane) ===")
    ref_crust, n1 = crust_sample(ref_top, ref_top_mask)
    our_crust, n2 = crust_sample(our_top, our_top_mask)
    print(f"reference crust median: {hexstr(ref_crust)}  n={n1}")
    print(f"ours crust median     : {hexstr(our_crust)}  n={n2}")
    canon = np.array([0xA9, 0x71, 0x3F])
    print(f"canon hex #A9713F     : {hexstr(canon)}")
    print(f"ours vs canon delta   : {our_crust - canon}")
    print(f"ref vs canon delta    : {ref_crust - canon}")

    print()
    print("=== crumb (front elevation, pale band) ===")
    ref_crumb, n3 = crumb_sample(ref_front, ref_front_mask, (0.25, 0.35, 0.75, 0.75))
    our_crumb, n4 = crumb_sample(our_front, our_front_mask, (0.25, 0.35, 0.75, 0.75))
    print(f"reference crumb median: {hexstr(ref_crumb) if ref_crumb is not None else None}  n={n3}")
    print(f"ours crumb median     : {hexstr(our_crumb) if our_crumb is not None else None}  n={n4}")
    canon_crumb = np.array([0xF4, 0xEA, 0xD4])
    print(f"canon CRUMB #F4EAD4   : {hexstr(canon_crumb)}")
    if our_crumb is not None:
        print(f"ours vs canon delta   : {our_crumb - canon_crumb}")
    if ref_crumb is not None:
        print(f"ref vs canon delta    : {ref_crumb - canon_crumb}")

    print()
    print("=== pore speckle stats (crumb region, our render vs reference) ===")
    def speckle_stats(arr, mask, region_box, name):
        h, w, _ = arr.shape
        x0, y0, x1, y1 = region_box
        sub = arr[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
        subm = mask[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
        luma = sub.mean(axis=2)
        # "very bright" pixels relative to local crumb band (>235) as a proxy for visible white specks
        bright = (luma > 235) & subm
        frac = bright.sum() / max(subm.sum(), 1)
        print(f"{name}: bright(>235) fraction of crumb region = {frac:.4f}  (region px={subm.sum()})")

    speckle_stats(ref_front, ref_front_mask, (0.25, 0.35, 0.75, 0.75), "reference")
    speckle_stats(our_front, our_front_mask, (0.25, 0.35, 0.75, 0.75), "ours")


if __name__ == "__main__":
    main()
