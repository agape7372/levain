# Verifies (without a render) that the main tube and both pole fans face outward, replicating
# the exact position/index formula baguette.ts will use. Same pattern as loaf's
# check_cap_winding.py - loaf hit TWO separate winding bugs (an inside-out tube, then an
# inside-out end cap) that only became visible as a render defect; verifying analytically first
# catches both before spending a render iteration.
import math
from station_gen import build_stations, SEGMENTS

STATIONS = build_stations()


def ring_positions(x, r, segments):
    pts = []
    for s in range(segments):
        t = (s / segments) * 2 * math.pi
        pts.append((x, r * math.cos(t), r * math.sin(t)))
    return pts


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def scale(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


centroid = (0.0, 0.0, 0.0)  # tube axis is X through the origin - any point ON the axis works


def face_normal(pa, pb, pc):
    return cross(sub(pb, pa), sub(pc, pa))


def check_slot(build_tri, label):
    """Tests ONE triangle-slot pattern (e.g. always (a0,a1,b1)) across the whole grid
    independently - the two triangles in a quad do not necessarily need the same flip
    relationship as a naive 'flip both together' guess assumes."""
    bad = 0
    total = 0
    for si in range(len(STATIONS) - 1):
        xA, rA = STATIONS[si]
        xB, rB = STATIONS[si + 1]
        if rA <= 1e-6 or rB <= 1e-6:
            continue  # poles checked separately
        ringA = ring_positions(xA, rA, SEGMENTS)
        ringB = ring_positions(xB, rB, SEGMENTS)
        for s in range(SEGMENTS):
            s1 = (s + 1) % SEGMENTS
            a0, b0, a1, b1 = ringA[s], ringA[s1], ringB[s], ringB[s1]
            tri = build_tri(a0, b0, a1, b1)
            n = face_normal(*tri)
            fc = scale(add(add(tri[0], tri[1]), tri[2]), 1 / 3)
            outward = (0.0, fc[1], fc[2])
            total += 1
            if dot(n, outward) <= 0:
                bad += 1
    print(f"{label}: {bad}/{total} inward-facing")
    return bad


def check_pole(is_first, flip, label):
    x0, r0 = STATIONS[0] if is_first else STATIONS[-1]
    x1, r1 = STATIONS[1] if is_first else STATIONS[-2]
    assert r0 <= 1e-6
    pole = (x0, 0.0, 0.0)
    ring = ring_positions(x1, r1, SEGMENTS)
    bad = 0
    for s in range(SEGMENTS):
        s1 = (s + 1) % SEGMENTS
        tri = (pole, ring[s1], ring[s]) if flip else (pole, ring[s], ring[s1])
        n = face_normal(*tri)
        fc = scale(add(add(tri[0], tri[1]), tri[2]), 1 / 3)
        outward = (x0 - x1, fc[1], fc[2])
        if dot(n, outward) <= 0:
            bad += 1
    print(f"{label}: flip={flip} -> {bad}/{SEGMENTS} inward-facing pole triangles")


# Test each of the 4 candidate triangle patterns independently (2 slots x 2 orders each) -
# find which single pattern is 0/total for each slot, rather than assuming both slots flip together.
print("--- slot 1 (a0,b1 diagonal side) ---")
check_slot(lambda a0, b0, a1, b1: (a0, a1, b1), "(a0,a1,b1)")
check_slot(lambda a0, b0, a1, b1: (a0, b1, a1), "(a0,b1,a1)")
print("--- slot 2 (b0,a1 diagonal side, shares a0-b1 edge with slot 1? no - shares no edge, uses the OTHER diagonal a0-b1 too via a0,b0,b1) ---")
check_slot(lambda a0, b0, a1, b1: (a0, b0, b1), "(a0,b0,b1)")
check_slot(lambda a0, b0, a1, b1: (a0, b1, b0), "(a0,b1,b0)")

check_pole(True, True, "start pole flip=True")
check_pole(True, False, "start pole flip=False")
check_pole(False, True, "end pole flip=True")
check_pole(False, False, "end pole flip=False")
