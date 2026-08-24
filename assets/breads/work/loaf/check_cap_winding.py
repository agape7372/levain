# Verifies (without a render) that both end caps face outward, by replicating loaf.ts's exact
# position formula and computing actual face normals via the cross product, then checking each
# against the vector from the object centroid to the face - CRIB's "render-free pre-check"
# pattern (assets/breads/work/pancake/check_pores.py; assets/breads/work/scone/check_fissures.py).
LENGTH = 1.673
LOAF_HEIGHT = 1.096
RIM_HFRAC = 0.62

PROFILE = [
    (0.0, 0.0), (0.95, 0.0), (1.0, 0.03), (1.0, RIM_HFRAC), (0.85, 0.78), (0.55, 0.94),
    (0.0, 1.0), (-0.55, 0.94), (-0.85, 0.78), (-1.0, RIM_HFRAC), (-1.0, 0.03), (-0.95, 0.0),
]

STATIONS = [
    (-LENGTH, 0.3, 0.6), (-1.62, 0.75, 0.9), (-1.55, 0.95, 0.99), (-1.5, 1.0, 1.0),
    (-0.65, 1.0, 1.0), (0.0, 1.0, 1.0), (0.65, 1.0, 1.0), (1.5, 1.0, 1.0),
    (1.55, 0.95, 0.99), (1.62, 0.75, 0.9), (LENGTH, 0.3, 0.6),
]


def loaf_position(station, profile_point):
    x, zscale, domescale = station
    zfrac, hfrac = profile_point
    is_dome = hfrac > RIM_HFRAC + 1e-6
    height_scale = domescale if is_dome else 1.0
    scaled_hfrac = RIM_HFRAC + (hfrac - RIM_HFRAC) * height_scale if is_dome else hfrac
    return (zfrac * zscale, scaled_hfrac * LOAF_HEIGHT, x)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


centroid = (0.0, LOAF_HEIGHT * 0.4, 0.0)  # rough interior point, good enough for an outward-vs-inward sign check


def face_normal(pa, pb, pc):
    return cross(sub(pb, pa), sub(pc, pa))


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def check_cap(station_index, flip, label):
    station = STATIONS[station_index]
    p0 = loaf_position(station, PROFILE[0])
    ok = True
    for k in range(1, len(PROFILE) - 1):
        pb = loaf_position(station, PROFILE[k])
        pc = loaf_position(station, PROFILE[k + 1])
        tri = (p0, pc, pb) if flip else (p0, pb, pc)
        n = face_normal(*tri)
        face_center = scale(add(add(tri[0], tri[1]), tri[2]), 1 / 3)
        outward = sub(face_center, centroid)
        d = dot(n, outward)
        if d <= 0:
            ok = False
    print(f"{label}: flip={flip} station_x={station[0]:+.3f} -> {'OUTWARD (correct)' if ok else 'INWARD (bug - invisible from outside)'}")


check_cap(0, True, "cap0 (near end)")
check_cap(len(STATIONS) - 1, False, "capN (far end)")
print("--- trying the other combination for comparison ---")
check_cap(0, False, "cap0 flip=False")
check_cap(len(STATIONS) - 1, True, "capN flip=True")
