# Shared station generator for baguette.ts / check_slash_coverage.py - keeps the two in sync.
# Three zones per CRIB's "densify only where needed" rule: dense where the 4 slashes live,
# sparse plain-crust buffer, cosine-eased taper down to a true pole at each tip.
import math

RADIUS = 1.0
HALF_LENGTH = 5.0  # stylized L/D (user verdict 2026-08-24; measured 11.365 rejected for card legibility)
# v4 (cmp-3.png): raising station density (v3) barely changed the jagged look - check_slash_
# coverage showed only ~1.5 trench cells per station even at 30 stations, meaning WIDTH
# (segment) resolution was the actual bottleneck, not along-axis density. Raised segments
# 24->32 and traded station density back down since it wasn't the limiting factor.
SEGMENTS = 32

# v3 (cmp-1/cmp-2.png): even with 20 dense stations (~5 stations across a slash's X-projection),
# each slash rendered as scattered jagged triangular notches, not a smooth connected lens - 5
# stations isn't enough for a visually smooth boundary. Raised to 30 (~8 stations across a
# slash) and tightened the dense span to where the slashes actually are, trading the triangle
# budget above the 800-1500 CRIB target band (this bread has 4 independent slash systems, the
# most detail of the three chunk breads) but staying well under the 8000tri/250KB hard cap.
# v6: now that width is fixed (SLASH_HALF_WIDTH 0.42->0.65 in the caller), along-axis
# resolution is back to being the limiting factor (~5 stations across a slash's length made
# each lens read as a stepped chevron). Raised dense stations again; accepting a higher
# triangle count than the CRIB per-bread target since the hard cap (8000tri/250KB) has room
# and this is the one bread where the identity feature genuinely needs the resolution.
DENSE_HALF_SPAN = 3.0  # physical X half-span of the slash-bearing middle zone
SPARSE_HALF_SPAN = 4.0  # physical X half-span of the constant-radius zone (dense + plain buffer)
DENSE_STATIONS = 26
SPARSE_STATIONS_PER_SIDE = 1
TAPER_STATIONS_PER_SIDE = 3


def build_stations():
    """Returns [(x, radius), ...] ordered from -HALF_LENGTH to +HALF_LENGTH, true poles at both ends."""
    stations = []
    # dense middle zone
    for i in range(DENSE_STATIONS):
        t = i / (DENSE_STATIONS - 1)
        x = -DENSE_HALF_SPAN + t * (2 * DENSE_HALF_SPAN)
        stations.append((x, 1.0))
    # sparse buffer zones (both sides), excluding the shared endpoint with the dense zone
    for side in (-1, 1):
        for i in range(1, SPARSE_STATIONS_PER_SIDE + 1):
            t = i / SPARSE_STATIONS_PER_SIDE
            x = side * (DENSE_HALF_SPAN + t * (SPARSE_HALF_SPAN - DENSE_HALF_SPAN))
            stations.append((x, 0.99))  # near-constant radius, matches the reference's flat mid-section
    # taper zones (both sides), cosine ease from ~0.97 down to a true pole (0.0)
    for side in (-1, 1):
        for i in range(1, TAPER_STATIONS_PER_SIDE + 1):
            t = i / TAPER_STATIONS_PER_SIDE
            x = side * (SPARSE_HALF_SPAN + t * (HALF_LENGTH - SPARSE_HALF_SPAN))
            r = 0.97 * math.cos(t * math.pi / 2)
            stations.append((x, max(r, 0.0)))
    stations.sort(key=lambda s: s[0])
    return stations


if __name__ == "__main__":
    st = build_stations()
    print(f"count={len(st)}")
    for x, r in st:
        print(f"  x={x:+7.3f} r={r:.4f}")
