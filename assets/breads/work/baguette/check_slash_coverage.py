# Pre-render check: does each slash's oriented footprint actually cover enough grid cells to
# read as a lens shape with a distinct trench + ear band, at this station/segment resolution?
# Mirrors CRIB's "grid cell, not continuous falloff" rule and scone's check_fissures.py pattern,
# generalized from a 1D Z-band match to a 2D oriented-ellipse footprint on the unrolled tube.
import math
from station_gen import build_stations, SEGMENTS, RADIUS

STATIONS = build_stations()

SLASH_AXIS_ANGLE_DEG = 32
SLASH_HALF_LENGTH = 1.0
SLASH_HALF_WIDTH = 0.65  # v5: widened again - v2-v4's trench read as a thin checkmark, not a lens
TRENCH_FRACTION = 0.68  # inner fraction of the width envelope = trench; outer = ear
SLASH_CENTERS_X = [-2.25, -0.75, 0.75, 2.25]


def classify(x, s_arc, center_x, angle_deg, half_length, half_width):
    """Returns ('trench'|'ear'|None, along, across)."""
    a = math.radians(angle_deg)
    dx = x - center_x
    ds = s_arc  # slash is always centered at the top (arc offset 0), see baguette.ts
    along = dx * math.cos(a) + ds * math.sin(a)
    across = -dx * math.sin(a) + ds * math.cos(a)
    if abs(along) >= half_length:
        return None, along, across
    envelope = half_width * math.sqrt(max(0.0, 1 - (along / half_length) ** 2))
    if abs(across) >= envelope:
        return None, along, across
    return ("trench" if abs(across) < envelope * TRENCH_FRACTION else "ear"), along, across


for ci, center_x in enumerate(SLASH_CENTERS_X):
    trench_cells = []
    ear_cells = []
    for si, (x, r) in enumerate(STATIONS):
        for sec in range(SEGMENTS):
            t = (sec / SEGMENTS) * 2 * math.pi
            # arc offset from top (t=0), wrapped to [-pi, pi], scaled to local arc-length at this station's radius
            dt = t if t <= math.pi else t - 2 * math.pi
            s_arc = dt * max(r, 1e-6)
            kind, along, across = classify(x, s_arc, center_x, SLASH_AXIS_ANGLE_DEG, SLASH_HALF_LENGTH, SLASH_HALF_WIDTH)
            if kind == "trench":
                trench_cells.append((si, sec))
            elif kind == "ear":
                ear_cells.append((si, sec))
    stations_hit = len(set(si for si, _ in trench_cells))
    print(f"slash[{ci}] x={center_x}: trench_cells={len(trench_cells)} (across {stations_hit} stations), ear_cells={len(ear_cells)}")
    if len(trench_cells) < 6 or stations_hit < 4:
        print(f"  WARNING: slash {ci} trench too sparse - will read as a dot/notch, not a lens")

print(f"\nSEGMENTS={SEGMENTS}, arc-length per sector at r=1.0: {2*math.pi*RADIUS/SEGMENTS:.4f}, slash full width: {2*SLASH_HALF_WIDTH:.4f} -> ~{2*SLASH_HALF_WIDTH/(2*math.pi*RADIUS/SEGMENTS):.2f} sectors wide")
