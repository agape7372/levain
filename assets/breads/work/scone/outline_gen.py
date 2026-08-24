# Shared outline generator for scone.ts / check_fissures.py - keeps the two in sync without
# hand-transcribing trig. Cartesian-first: corners are named points, fillets are simple corner
# cuts (2 points each, matching the low-poly faceted look - no smooth circular arcs), and each
# straight cut edge gets explicit interior points so fissure target-Z bands have something to
# match against instead of only the 3 apex-fillet points (see check_fissures.py v1 failure:
# only 3/10 sectors matched near the apex because scaled-ring sampling of a 10-point outline
# with all intermediate resolution at the corners cannot represent a mid-edge Z level at all).
import math

# Raw sharp-corner triangle (Cartesian, X=left/right, Z=apex(+)/back(-)). Apex leans slightly
# toward +X ("pointed corner facing forward and slightly to the side", prompts/breads/scone.json).
# v2 (iteration 1 fix, cmp-1.png): APEX was (0.10, 1.05) with a 10% fillet bite -> rendered as
# an almost knife-sharp point (tier1 bilateralSymmetryError 0.195, IoU 0.669). Pulled the raw
# corner in and widened the bite (0.10->0.26) - cmp-2.png still read sharp: the angle AT the
# apex_tip vertex itself was 66.8 degrees (computed from apex_l/apex_tip/apex_r), because
# widening the bite moves the SHOULDERS but apex_tip itself is still the far raw corner, so it
# keeps poking out past them. A wider bite alone cannot blunt a corner if the tip vertex doesn't
# also move.
# v3: decouples the two roles. APEX_CORNER still sets the cut DIRECTION for apex_l/apex_r (how
# the fillet shoulders sit relative to the back corners) but the vertex actually placed at the
# tip is APEX_TIP, pulled back close to the shoulders' Z level so the apex_l-apex_tip-apex_r
# angle opens up to ~148 degrees (obtuse, blunt) instead of a point sticking out past its own
# shoulders.
APEX_CORNER = (0.09, 0.90)
APEX_TIP = (0.05, 0.66)
# v4 (iteration 1 tier1 numbers): pulling APEX_TIP back in v3 shrank the apex-to-back Z depth
# to 1.31 against an X width of 1.92 (ratio 0.68), well under the ~0.88 depth/width read off
# scone-3.png's top-down silhouette - the wedge was reading too flat/blade-like. Pushed both
# back corners further back (Z -0.52/-0.58 -> -0.72/-0.78) to restore depth without touching
# the apex fillet fix.
BACK_LEFT = (-0.98, -0.72)
BACK_RIGHT = (0.94, -0.78)  # slightly larger than back-left: hand-poured asymmetry, not RNG


def lerp(a, b, f):
    return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)


def to_polar(p):
    x, z = p
    r = math.hypot(x, z)
    t = math.degrees(math.atan2(z, x)) % 360
    return t, r


def build_outline():
    """Returns an ordered list of (label, t_deg, r_frac) around the wedge footprint."""
    # Apex fillet: still the tightest corner cut, but v2 widens it a lot (0.10->0.26) - the
    # reference's apex is blunt, not a knife edge; "tighter than the back corners" only means
    # a smaller cut than 0.30, not a near-sharp point.
    apex_l = lerp(APEX_CORNER, BACK_LEFT, 0.26)
    apex_r = lerp(APEX_CORNER, BACK_RIGHT, 0.26)
    # Back-left fillet: wider cut (back corners read rounder than the apex in scone-3.png).
    bl_toward_apex = lerp(BACK_LEFT, APEX_CORNER, 0.30)
    bl_toward_arc = lerp(BACK_LEFT, BACK_RIGHT, 0.14)
    # Back-right fillet.
    br_toward_arc = lerp(BACK_RIGHT, BACK_LEFT, 0.14)
    br_toward_apex = lerp(BACK_RIGHT, APEX_CORNER, 0.30)
    # Back arc midpoint: shallow outward bulge (the original round scone's crust edge).
    arc_mid = lerp(BACK_LEFT, BACK_RIGHT, 0.5)
    arc_mid = (arc_mid[0], arc_mid[1] - 0.10)  # bulge further back (more negative Z)

    # 4 interior points per straight edge (was 2): raises segment count from 14 to 18, which
    # both improves general roundness (low-poly is the target look, but 10 total sectors read
    # visibly under-tessellated next to pancake's 30) and gives fissure target-Z bands more
    # candidate sectors to land on (see check_fissures.py coverage counts).
    EDGE_FRACS = (0.22, 0.44, 0.66, 0.88)
    points = [("apex_l", apex_l)]
    for i, f in enumerate(EDGE_FRACS):
        points.append((f"left_edge_{i}", lerp(apex_l, bl_toward_apex, f)))
    points += [
        ("bl_toward_apex", bl_toward_apex),
        ("back_left_tip", BACK_LEFT),
        ("bl_toward_arc", bl_toward_arc),
        ("arc_mid", arc_mid),
        ("br_toward_arc", br_toward_arc),
        ("back_right_tip", BACK_RIGHT),
        ("br_toward_apex", br_toward_apex),
    ]
    # Traversal direction here is br_toward_apex -> apex_r, so f must increase to match
    # (a bug where an earlier version reversed this produced a non-monotonic angle sequence
    # that folds the outline instead of tracing it in order).
    for i, f in enumerate(EDGE_FRACS):
        points.append((f"right_edge_{i}", lerp(br_toward_apex, apex_r, f)))
    points.append(("apex_r", apex_r))
    points.append(("apex_tip", APEX_TIP))
    # apex_tip is the true corner point but was placed last so the loop still reads
    # apex_l -> ... -> apex_r -> apex_tip -> (wrap to apex_l), giving the tip its own facet
    # between the two shoulder points rather than being skipped.
    return [(label, *to_polar(p)) for label, p in points]


if __name__ == "__main__":
    for label, t, r in build_outline():
        print(f"{label:16s} t={t:7.2f} r={r:.4f}")
    print(f"count = {len(build_outline())}")
