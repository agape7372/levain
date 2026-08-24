# Pre-render check: does each fissure's target Z actually land near an existing face-ring
# vertex, at enough sectors to read as a line spanning the local width (not a single dot)?
# Mirrors the "grid cell, not continuous falloff" rule (CRIB) by finding, per sector, the
# closest available FACE ring to the target Z and reporting the miss distance instead of
# interpolating a new vertex there.
import math
from outline_gen import build_outline

# Outline points (label, angle_deg, radiusFraction) - generated from Cartesian corners,
# see outline_gen.py. Ported verbatim into scripts/breads/scone.ts OUTLINE once this passes.
OUTLINE = build_outline()

# Face-only rings eligible for fissure dips (rFrac); shared rim (0.98) and crown (0.0) excluded
# to keep the two-tone boundary and the crown point undisturbed.
FACE_RINGS = [0.87, 0.74, 0.60, 0.45, 0.30, 0.15]
FISSURE_TARGETS_Z = [0.48, 0.28, 0.08]
MATCH_TOLERANCE = 0.18  # sector skipped if no ring gets this close (fissure legitimately ends there)

def outline_z(r_deg, r_frac):
    return r_frac * math.sin(math.radians(r_deg))

for fi, target in enumerate(FISSURE_TARGETS_Z):
    hits = []
    for name, t, r in OUTLINE:
        best_ring, best_delta = None, None
        for ring_frac in FACE_RINGS:
            z = ring_frac * outline_z(t, r)
            delta = abs(z - target)
            if best_delta is None or delta < best_delta:
                best_ring, best_delta = ring_frac, delta
        if best_delta <= MATCH_TOLERANCE:
            hits.append((name, best_ring, round(best_delta, 3)))
    covered = [h[0] for h in hits]
    n = len(OUTLINE)
    print(f"fissure[{fi}] target_z={target}: {len(hits)}/{n} sectors matched -> {hits}")
    if len(hits) < 4:
        print(f"  WARNING: fissure {fi} covers too few sectors, will read as a dot not a line")
