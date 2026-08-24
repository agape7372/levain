# Authors the subject-specific half of object-sculpt-spec.json in place. Pattern copied from
# assets/breads/work/pancake/author_spec.py, boilerplate factored into work/_spec_common.py.
#
# Geometry frame: Y up, radius 1.0 = dome base radius, all values relative. Profile points are
# (radiusFraction, tFrac) where tFrac is the normalized pole-to-apex parameter (0 at the base rim,
# 1 at the apex) - real height = tFrac * DOME_HEIGHT. Mirrors scripts/breads/campagne.ts exactly;
# when tuning constants there during the review loop, mirror the change here too.
import json
import math
import pathlib
import sys

WORK = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(WORK.parent))
import _spec_common as sc  # noqa: E402

SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
REFERENCE = WORK.parents[1] / "src" / "campagne.png"

# --- measured proportions (assets/breads/src/campagne.png, campagne-2.png, campagne-3.png) ----
# Values below are the FINAL tuned constants from scripts/breads/campagne.ts after the 3-iteration
# review loop - kept in sync here per team-lead directive (2026-08-24): the spec is the record of
# truth, so regenerating it must never resurrect numbers the render loop already disproved.
DOME_HEIGHT = 0.76           # height/diameter 0.379 (measured front elevation 440px/1160px)
# 8의 배수 - divisible by 8 so the slash's 45/135deg arms land on exact sector boundaries. Raised
# 24->32 during review: a halfAngle narrower than 15deg (24-segment spacing) couldn't fit a
# separate ear column next to the crumb column - 32 segments (11.25deg spacing) can.
SEGMENTS = 32
GROOVE_COUNT = 8
# tFrac range (0=base rim, 1=apex) carrying ring grooves. Widened from an early (0.05,0.86) that
# left the dome's lower flank bald under the 3/4 camera (see buildDomeProfile's own t-vs-rho note).
GROOVE_ZONE = (0.08, 0.97)
GROOVE_HALF_WIDTH_T = 0.014
GROOVE_DEPTH = 0.03           # radius units
SLASH_ARM_COUNT = 4
# Slash is full depth from the apex (t=1) down to SLASH_T_FULL, smoothstep-tapers to 0 by
# SLASH_T_END (t below that is untouched). SLASH_T_END=0.6 in t-space is base_radius(0.6)=0.8 in
# radius-fraction terms, matching the measured ~75-80% reach - t and radius fraction are NOT the
# same axis (see buildDomeProfile docstring), an early version of this file conflated them.
SLASH_T_FULL = 0.92
SLASH_T_END = 0.6
# At 32 segments (11.25deg spacing): halfAngle=12deg includes the immediate neighbor column
# (11.25deg) but excludes the next one (22.5deg) - one crumb column plus one ear column per side.
SLASH_HALF_ANGLE_DEG = 12
SLASH_CRUMB_HALF_ANGLE_DEG = 5
SLASH_DEPTH = 0.09
EAR_HEIGHT = 0.02
WOBBLE = {"lobe3": 0.02, "lobe7": 0.012, "noise": 0.012}


def base_radius(t: float) -> float:
    return math.sqrt(max(0.0, 1.0 - t * t))


def dome_profile() -> list[list[float]]:
    """t-ascending profile. The fixed tail below assumes GROOVE_ZONE's upper bound stays below
    ~0.9; when it doesn't (as here), the last groove's tOut can exceed the tail's first value,
    so everything except the two base-rim points is collected, sorted by t, and near-duplicates
    (within EPS) are dropped - otherwise buildRevolvedShell-equivalent lathe code stitches rings
    out of order and folds a self-intersecting pleat near the apex (session code-review finding,
    2026-08-24; fixed identically in scripts/breads/domeShell.ts buildDomeProfile). Sorting is
    deterministic (rng-independent), so this does not touch types.ts section 5.
    """
    rest: list[list[float]] = []
    for t in (0.015, 0.03):
        rest.append([round(base_radius(t), 5), t])
    for i in range(GROOVE_COUNT):
        tc = GROOVE_ZONE[0] + (GROOVE_ZONE[1] - GROOVE_ZONE[0]) * (i + 0.5) / GROOVE_COUNT
        t_in, t_out = tc - GROOVE_HALF_WIDTH_T, tc + GROOVE_HALF_WIDTH_T
        rest.append([round(base_radius(t_in), 5), round(t_in, 5)])
        rest.append([round(base_radius(tc) - GROOVE_DEPTH, 5), round(tc, 5)])
        rest.append([round(base_radius(t_out), 5), round(t_out, 5)])
    for t in (0.90, 0.94, 0.97, 1.0):
        rest.append([round(base_radius(t), 5), t])
    rest.sort(key=lambda p: p[1])
    eps = 1e-4
    deduped: list[list[float]] = []
    for p in rest:
        if not deduped or p[1] - deduped[-1][1] > eps:
            deduped.append(p)
    return [[0.0, 0.0], [1.0, 0.0], *deduped]


PROFILE = dome_profile()

# --- palette -------------------------------------------------------------------------------
# Light end is the JSON's own hex. The dark gradient end has no explicit hex anywhere in
# assets/prompts/breads/campagne.json ("amber to dark brown blend" - no stop color given), so it is
# derived deterministically (fixed-ratio channel darken), never pixel-sampled (types.ts section 8).
# 0.70 (raised from an initial 0.62 during review, which over-darkened the ungrooved lower flank)
# still lands clearly darker than wholewheat's own crust (#8C5A32=140,90,50 vs campagne's darkened
# stop 118,79,44 - darker on every channel) so campagne's darkest gradient stop never reads lighter
# than a plain wholewheat crust.
CRUST_LIGHT_HEX = "#A9713F"  # assets/prompts/breads/campagne.json geometry.crust[0]
CRUST_DARK_RATIO = 0.70


def darken(hexcolor: str, ratio: float) -> str:
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))
    return f"#{round(r * ratio):02X}{round(g * ratio):02X}{round(b * ratio):02X}"


CRUST_DARK_HEX = darken(CRUST_LIGHT_HEX, CRUST_DARK_RATIO)
# Flour dusting has no hex anywhere in the prompt family; a generic pale warm off-white,
# consistent with (but distinct from) the family's cream crumb tone below.
FLOUR_HEX = "#EFE7D2"
# Crumb hex is NOT invented: assets/prompts/breads/baguette.json gives "cream-colored crumb
# #F4EAD4 visible inside each open slash" for the same visual concept (interior exposed at a
# slash) on a sibling bread in this family. Reused deliberately as the family's crumb constant
# rather than deriving a new value from campagne's own crust hex.
CRUMB_HEX = "#F4EAD4"

DETAIL_BINDINGS = {
    "ring-groove-field": ("groove", "dome-ring-grooves"),
    "cross-slash-valley": ("groove", "dome-slash-crumb-cross-slash"),
    "slash-ear-ridge": ("ridge", "dome-slash-crumb-ear-ridge"),
    "flour-dusting": ("stain", "flour-dusting"),
    "crust-gradient": ("stain", "crust-gradient"),
}

VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter",
        "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "low wide dome with a continuous curved silhouette, widest at the base",
            "concentric ring grooves cover the whole visible dome surface",
            "a cross-shaped slash meets at the apex, each arm opening into a raised ear",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-front",
        "view": "front elevation",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "width/height ratio measured 2.64 (1160px / 440px) - a flattened dome, not a hemisphere",
            "widest point sits at the base rim, curving continuously up to the apex",
            "slash cut visible in profile as a V-notch reaching almost to the apex",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-top",
        "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "10-11 concentric rings visible from apex outward, centered on the slash intersection",
            "cross slash reads as an X, each arm a wedge widest near the center and tapering toward its tip",
            "flour highlights concentrate on the raised ring ridges rather than spreading evenly",
        ],
        "confidence": 0.9,
    },
]


def campagne_root() -> dict:
    return {
        "id": "root", "name": "Campagne Boule", "level": "macro", "role": "assembly",
        "importance": 1.0, "confidence": 0.95, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": "Transform-only assembly node carrying the dome body; it emits no geometry of its own.",
        "geometryDescriptor": {
            "topologyIntent": "transform node only",
            "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children",
        },
        "parent": None, "attachment": None,
        "dimensions": {"width": 2.0, "height": DOME_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.95},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": sc.action_profile("root", "root"),
        "material": "crust", "materialLayers": ["crust"],
        "colorMaterialRecipe": sc.color_recipe(CRUST_LIGHT_HEX, CRUMB_HEX, "assembly node, inherits from children"),
        "deformations": [], "joints": [], "seams": [], "localFeatures": [],
        "surfaceDetail": sc.surface_detail(0.0, 0.0, 0.0, "n/a", "n/a", "Assembly node; no surface of its own."),
        "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": [], "fidelityTier": "blockout",
    }


def campagne_dome() -> dict:
    return {
        "id": "dome", "name": "Campagne dome body", "level": "macro", "role": "body",
        "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": (
            "One continuous, smoothly varying rotationally symmetric mass with no internal seams: a flat base "
            "cap swept out to an ellipse-profile dome. Decision tree step 6. A sphere/hemisphere primitive is "
            "structurally close but cannot carry the flat base cap or the ring-groove profile modulation."
        ),
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": PROFILE, "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {
                    "id": "ring-grooves", "type": "radial-modulation", "axis": [0, 1, 0],
                    "amplitude": GROOVE_DEPTH,
                    "notes": (
                        f"{GROOVE_COUNT} narrow V-notch rings baked directly into the profile radius (not a "
                        "separate displacement pass): each notch is 3 profile points (shoulder, trough, shoulder) "
                        "spanning 2*GROOVE_HALF_WIDTH_T in tFrac. Axially symmetric by construction - no per-sector "
                        "variation - so it needs no sector-grid density the way pancake's pore field did."
                    ),
                },
                {
                    "id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0],
                    "amplitude": WOBBLE["lobe3"] + WOBBLE["lobe7"] + WOBBLE["noise"],
                    "notes": "Per-sector radius multiplier 1 + lobe3*sin(3t+phi) + lobe7*sin(7t+psi) + rng noise, gentler than pancake's poured-disk wobble since the reference boule reads as fairly clean.",
                },
            ],
            "uvStrategy": "dome polar projection (scripts/breads/lib.ts uvDome)",
            "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag",
        },
        "parent": "root", "attachment": None,
        "dimensions": {"width": 2.0, "height": DOME_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.9},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": sc.action_profile("dome", "body"),
        "material": "crust", "materialLayers": ["crust"],
        "colorMaterialRecipe": sc.color_recipe(CRUST_LIGHT_HEX, CRUST_DARK_HEX, "whole dome surface"),
        "deformations": ["ring-grooves", "outline-wobble"], "joints": [],
        "seams": [{"id": "dome-slash-crumb-boundary", "kind": "material-boundary", "notes": "Boundary is the angular falloff edge of the slash trench (SLASH_HALF_ANGLE_DEG), a geometric edge shared with dome-slash-crumb, not a texture boundary."}],
        "localFeatures": [
            {
                "id": "dome-ring-grooves", "name": "Concentric banneton ring grooves", "kind": "recessed-detail-scatter",
                "description": f"{GROOVE_COUNT} concentric V-notch grooves centered on the apex, covering tFrac {GROOVE_ZONE[0]}-{GROOVE_ZONE[1]} of the dome radius. The single defining feature per assets/prompts/breads/campagne.json notes_ko.",
                "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.95, "repetitionSystemRef": "ring-groove-field",
            },
        ],
        "surfaceDetail": sc.surface_detail(
            0.0, 0.0, GROOVE_DEPTH,
            "faceted planar shading from split vertices; each groove contributes its own hard-edged channel",
            "ring grooves and outline wobble baked into the revolved profile",
            "Two-tone crust gradient and flour dusting are baked into a canvas basecolor texture (scripts/breads/lib.ts bakeTexture, uvDome projection) rather than a second material, because they are a continuous trend correlated with the same ring-phase math as the geometry, not a discrete zone split (CRIB divide: discrete regions get separate materials, continuous trends get texture).",
        ),
        "evidenceRefs": ["view-front", "view-three-quarter", "view-top"],
        "details": ["dome-ring-grooves"], "fidelityTier": "surface-pass",
    }


def campagne_slash_crumb() -> dict:
    return {
        "id": "dome-slash-crumb", "name": "Cross-slash crumb and ear ridge", "level": "meso", "role": "surface",
        "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": (
            "Not a separate solid: the same revolved dome mass, masked to the triangles inside the slash's "
            "angular falloff band and re-materialed. Decision tree step 6 - it is the dome's own surface where "
            "the crust tore open, not a conforming shell over another form."
        ),
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": PROFILE, "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {
                    "id": "cross-slash", "type": "vertex-displacement", "axis": [0, -1, 0],
                    "amplitude": SLASH_DEPTH,
                    "notes": (
                        f"{SLASH_ARM_COUNT} arms at 45/135/225/315deg, cosine falloff across "
                        f"+/-{SLASH_HALF_ANGLE_DEG}deg from each arm's exact angle, tapering to 0 depth by "
                        f"tFrac={SLASH_T_END}. Height displacement (a valley cut into the surface), not a "
                        "radius pull-in, matching a real blade score."
                    ),
                },
                {
                    "id": "ear-ridge", "type": "vertex-displacement", "axis": [0, 1, 0], "amplitude": EAR_HEIGHT,
                    "notes": f"Small raised lip in the {SLASH_CRUMB_HALF_ANGLE_DEG}-{SLASH_HALF_ANGLE_DEG}deg band flanking each arm, where the crust visibly lifted.",
                },
            ],
            "uvStrategy": "dome polar projection (scripts/breads/lib.ts uvDome)",
            "normalStrategy": "flat normals baked by splitting vertices after displacement",
        },
        "parent": "dome", "attachment": None,
        "dimensions": {"width": round(2 * math.sin(math.radians(SLASH_HALF_ANGLE_DEG)), 4), "height": SLASH_DEPTH, "depth": round(2 * SLASH_T_END, 4), "units": "relative", "confidence": 0.85},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": sc.action_profile("dome-slash-crumb", "surface"),
        "material": "crumb", "materialLayers": ["crumb"],
        "colorMaterialRecipe": sc.color_recipe(CRUMB_HEX, CRUST_LIGHT_HEX, "cross-slash trench floor and ear ridge"),
        "deformations": ["cross-slash", "ear-ridge"], "joints": [],
        "seams": [{"id": "dome-slash-crumb-boundary", "kind": "material-boundary", "notes": "Shares the parent dome's slash angular-falloff boundary exactly."}],
        "localFeatures": [
            {
                "id": "dome-slash-crumb-cross-slash", "name": "Cross-slash valley", "kind": "recessed-detail-scatter",
                "description": f"Two perpendicular V-trenches meeting at the apex, {SLASH_ARM_COUNT}-fold symmetric, reaching tFrac={SLASH_T_END}, exposing crumb color {CRUMB_HEX} at the floor.",
                "evidenceRefs": ["view-three-quarter", "view-top"], "confidence": 0.95, "repetitionSystemRef": "slash-arms",
            },
            {
                "id": "dome-slash-crumb-ear-ridge", "name": "Slash ear ridge", "kind": "profile-curvature",
                "description": "Raised lip flanking each trench edge where the crust tore open and lifted.",
                "evidenceRefs": ["view-three-quarter"], "confidence": 0.85,
            },
        ],
        "surfaceDetail": sc.surface_detail(
            0.0, 0.0, SLASH_DEPTH,
            "faceted planar shading from split vertices; the trench walls contribute their own hard-edged facets",
            "cross-slash and ear-ridge displaced into the revolved dome",
            "assets/prompts/breads/campagne.json notes_ko: the ear along each cut line is named alongside the ring markings, so this is identity-critical rather than decorative.",
        ),
        "evidenceRefs": ["view-three-quarter", "view-top"],
        "details": ["dome-slash-crumb-cross-slash", "dome-slash-crumb-ear-ridge"], "fidelityTier": "surface-pass",
    }


ROOT = campagne_root()
DOME = campagne_dome()
SLASH_CRUMB = campagne_slash_crumb()

MATERIALS = [
    sc.material(
        "crust", "Dome crust", CRUST_LIGHT_HEX, "whole dome surface",
        "Light end hand-transcribed from assets/prompts/breads/campagne.json geometry.crust[0]. Dark gradient "
        "end has no hex in the prompt JSON and is derived by a documented fixed-ratio darken (this file, "
        "CRUST_DARK_RATIO=0.70), never pixel-sampled from the reference (types.ts section 8).",
        [
            {
                "id": "crust-gradient", "name": "Light-to-dark radial gradient", "maskSource": "texture",
                "description": f"Baked canvas gradient from {CRUST_LIGHT_HEX} near the apex/ring ridges to {CRUST_DARK_HEX} lower on the dome, 2-3 discrete tone bands (not a photographic smooth gradient) correlated with the same ring-phase math as the geometry grooves.",
                "evidenceRefs": ["view-front", "view-three-quarter"], "appliesTo": ["dome"],
            },
            {
                "id": "flour-dusting", "name": "Flour dusting on ring ridges", "maskSource": "texture",
                "description": f"Baked canvas speckle in {FLOUR_HEX}, concentrated where the ring-phase function is at a ridge (not a trough), seeded from the builder rng so placement is deterministic.",
                "evidenceRefs": ["view-top", "view-three-quarter"], "appliesTo": ["dome"],
            },
        ],
        texture_size=160,
        texture_note="uvDome projection; one 160x160 basecolor canvas carries the gradient bands + flour speckle (dropped from an initial 256px during review to bring GLB size back under the 200KB fire-bread-group target), both computed from the same ring-phase function the geometry grooves use so bright dust lands on the geometric ridges.",
    ),
    sc.material(
        "crumb", "Slash crumb", CRUMB_HEX, "cross-slash trench floor",
        "Reused, not invented: assets/prompts/breads/baguette.json gives 'cream-colored crumb #F4EAD4 visible "
        "inside each open slash' for the identical visual concept on a sibling bread in this family.",
        [],
    ),
]

REPETITION_SYSTEMS = [
    {
        "id": "ring-groove-field", "name": "Concentric ring groove field", "level": "meso",
        "hostComponents": ["dome"], "elementComponentIds": ["dome"],
        "elementKind": "recessed profile modulation, not an added mesh",
        "count": GROOVE_COUNT,
        "distribution": {
            "mode": "evenly spaced in tFrac across the groove zone, baked directly into the lathe profile",
            "zone": list(GROOVE_ZONE), "halfWidthT": GROOVE_HALF_WIDTH_T, "depth": GROOVE_DEPTH,
            "note": "Axially symmetric (same at every sector), so density lives in the profile's tFrac spacing, not a sector grid - no analogue to pancake's Chebyshev-distance pore rejection is needed here.",
        },
        "sizeClasses": [{"id": "ring", "halfWidthT": GROOVE_HALF_WIDTH_T, "depth": GROOVE_DEPTH}],
        "seedRule": "Fixed authored values (profile positions), not random - the ring count and spacing are read off the reference top-down view.",
        "evidenceRefs": ["view-top"],
    },
    {
        "id": "slash-arms", "name": "Cross-slash arms", "level": "meso",
        "hostComponents": ["dome", "dome-slash-crumb"], "elementComponentIds": ["dome-slash-crumb"],
        "elementKind": "recessed vertex displacement, not an added mesh",
        "count": SLASH_ARM_COUNT,
        "distribution": {
            "mode": f"{SLASH_ARM_COUNT}-fold rotational symmetry at 45/135/225/315deg, cosine angular falloff",
            "halfAngleDeg": SLASH_HALF_ANGLE_DEG, "tEnd": SLASH_T_END,
        },
        "sizeClasses": [{"id": "arm", "halfAngleDeg": SLASH_HALF_ANGLE_DEG, "depth": SLASH_DEPTH}],
        "seedRule": "Fixed authored angles, not random - the X pattern is deliberate, not procedurally scattered.",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {
        "id": "dome-silhouette", "name": "Flattened dome silhouette", "tier": "critical",
        "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["root", "dome"], "evidenceRefs": ["view-front", "view-three-quarter"],
    },
    {
        "id": "ring-groove-field", "name": "Concentric ring groove field", "tier": "critical",
        "passIds": ["surface-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["dome"], "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "cross-slash-valley", "name": "Cross-slash valley with ear ridges", "tier": "critical",
        "passIds": ["form-refinement"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["dome-slash-crumb"], "evidenceRefs": ["view-three-quarter", "view-top"],
    },
    {
        "id": "crust-crumb-split", "name": "Crust/crumb two-tone split on the slash boundary", "tier": "critical",
        "passIds": ["material-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["dome", "dome-slash-crumb"], "evidenceRefs": ["view-three-quarter"],
    },
    {
        "id": "crust-gradient-and-dusting", "name": "Crust gradient and flour dusting", "tier": "important",
        "passIds": ["material-pass"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["dome"], "evidenceRefs": ["view-front", "view-top"],
    },
    {
        "id": "baked-faceting", "name": "Faceted flat shading baked into geometry", "tier": "important",
        "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["dome"], "evidenceRefs": ["view-three-quarter"],
    },
]


def patch(spec: dict) -> dict:
    spec["suitability"] = "pass"
    spec["scores"] = {
        "object_isolation": 3, "silhouette_readability": 3, "depth_inference": 3,
        "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 1,
        "interaction_fit": 3,
    }
    spec["coordinateFrame"] = {
        "front": "+Z, the direction the harness three-quarter camera at (-1.6, 2.2, 2.6) looks from",
        "up": "+Y",
        "scaleReference": "dome base radius = 1.0 relative unit. Absolute scale is meaningless: the consumer runtime refits the longest axis to 1.6 (scripts/breads/types.ts section 7).",
    }
    spec["referenceCamera"] = {
        "solved": False, "fovDegrees": 0.0, "aspect": 1.0,
        "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6],
        "note": "Not solved and deliberately not matched to the reference - the review camera is fixed by scripts/breadlab.ts (orthographic at (-1.6, 2.2, 2.6) looking at the origin), same convention as pancake.",
    }
    spec["silhouette"] = {
        "boundingShape": f"flattened dome, 2.0 wide by {DOME_HEIGHT} tall in radius units",
        "aspectRatios": [
            {"id": "height-over-diameter", "value": round(DOME_HEIGHT / 2.0, 4), "source": "campagne-2.png front elevation, 440px/1160px"},
            {"id": "slash-reach-fraction", "value": round(base_radius(SLASH_T_END), 4), "source": "campagne.png/-3.png, slash arms reach ~75-80% of the radius (radius-fraction axis, not the tFrac axis SLASH_T_END is authored on - see buildDomeProfile)"},
        ],
        "symmetry": "radial for the dome body (approximate, broken by the outline wobble); 4-fold symmetric slash breaks full radial symmetry",
        "dominantCurves": ["continuous ellipse-profile dome, widest at the base rim", "V-notch ring grooves repeating up the dome", "X-shaped slash valley converging at the apex"],
        "negativeSpaces": ["the cross-slash trench itself - the only negative space in the silhouette from the three-quarter camera"],
        "landmarks": ["apex at the slash intersection (tFrac 1)", "base rim at tFrac 0 (widest point)", f"slash tips at tFrac {SLASH_T_END} (radius fraction {round(base_radius(SLASH_T_END), 2)})"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, DOME, SLASH_CRUMB]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget",
        "targetTriangles": 1920,
        "maxDrawCalls": 2, "textureSize": 160, "fpsTarget": 60,
        "optimizationPolicy": (
            "Hard consumer budget: at most 8000 triangles and 250 KB per bread with at most two meshes "
            "(scripts/breads/types.ts section 6). Target band for the 'fire' bread group is 1200-2000 tri, "
            "GLB <=200KB (assets/breads/work/CRIB.md budget table), reached by construction (segment/ring "
            "counts chosen to land there), not by decimation.",
        ),
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": [
            "flattened dome silhouette, height/diameter ~0.38",
            "concentric ring grooves covering the whole dome - the single defining feature",
            "cross-shaped slash with raised ear ridges, surviving the runtime Lambert swap via a separate crumb material",
            "crust gradient and flour dusting baked into geometry-correlated texture",
            "faceted flat shading baked into geometry",
        ],
        "niceToHave": ["exact ring phase/spiral pitch", "the reference's soft contact shadow, which the shadowless harness cannot reproduce"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update(sc.material_pass_look_dev())
    spec["lookDevTargets"]["lightingPass"] = sc.lighting_block()
    spec["lightingFromPhoto"] = sc.lighting_from_photo()
    spec["proceduralStrategy"] = [
        "Build the dome profile with ring grooves baked in as explicit shoulder/trough/shoulder triples, then revolve it manually into an indexed shell (scripts/breads/lib.ts buildRevolvedShell) - never THREE.LatheGeometry (CRIB: phi-seam vertex duplication tears under jitter).",
        "Apply the per-sector outline wobble to every ring identically so no seam opens.",
        "Displace the cross-slash valley and ear ridges into the same indexed shell using an angular cosine falloff from each of the 4 arm angles.",
        "Jitter vertices while the geometry is still indexed, so shared vertices move together.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project dome-polar UVs, bake the crust gradient+dusting canvas texture, then split triangles by slash angular membership into crust vs crumb and merge by material into exactly two meshes.",
    ]
    spec["assumptions"] = [
        "The flat base is never visible: no turntable azimuth above the horizon faces it.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "Exact ring phase and exact pore-equivalent micro-noise are not identity-critical; ring count, spacing and depth are what the review scores.",
    ]
    spec["risks"] = [
        {
            "id": "groove-below-tessellation", "severity": "high",
            "description": "A ring groove narrower or shallower than the local profile tFrac spacing lands between rings and disappears silently, exactly like pancake's pore-radius lesson (CRIB detail-below-tessellation).",
            "mitigation": "Grooves are 3 explicit profile points each (shoulder/trough/shoulder), not a continuous displacement, so they cannot fall between samples by construction; depth 0.03 was sized against the 0.028 groove spacing (2*GROOVE_HALF_WIDTH_T) before any render.",
        },
        {
            "id": "vertex-color-loss", "severity": "high",
            "description": "Any vertex-color-based region paint is silently discarded by the runtime's MeshLambertMaterial swap.",
            "mitigation": "Crust vs crumb is carried by two separate materials split on a geometric angular boundary; the crust's gradient/dusting is a baked canvas texture (map survives the swap), never vertex colors.",
        },
        {
            "id": "seam-tear", "severity": "medium",
            "description": "Dome and slash-crumb are the same continuous mesh split by material after the fact; jittering them separately would tear the shared boundary.",
            "mitigation": "Build one indexed dome shell, wobble/groove/slash/jitter it whole, and only then split its triangles into the two material buckets by angular membership (pancake.ts sliceTriangles pattern, generalized to a boolean mask).",
        },
        {
            "id": "slash-angle-camera-mismatch", "severity": "low",
            "description": "The slash's absolute yaw is arbitrary (the reference gives no world-orientation ground truth beyond 'reads as an X' under the fixed 3/4 camera).",
            "mitigation": "Arms are placed at 45/135/225/315deg in local space; verified against the shipping camera via the breadlab-shot compare render, adjusted by a single yaw constant if an arm reads foreshortened.",
        },
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup on the whole dome; no plausible sub-break for a boule"]
    sc.trim_passes(spec)
    return spec


def main() -> int:
    assessment = json.loads(ASSESSMENT.read_text(encoding="utf-8"))
    oc = assessment["preSpecAssessment"]["objectClass"]
    oc["motionPotential"] = ["static prop", "whole-object transform"]
    oc["materialFamilies"] = ["ceramic"]
    # Real componentTree count: dome-slash-crumb is the only level=meso component (ring grooves and
    # flour dusting/gradient are localFeatures/localOverrides on the macro dome and a material, not
    # separate components) - 1, not the 2 first guessed before componentTree existed.
    assessment["preSpecAssessment"]["complexity"]["estimatedCounts"]["mesoComponents"] = 1
    assessment["qualityContract"]["minimumSpecDepth"]["mesoComponents"] = 1
    sc.bind_details(assessment["preSpecAssessment"], DETAIL_BINDINGS)
    sc.resolve_unknowns(assessment["preSpecAssessment"])
    ASSESSMENT.write_text(json.dumps(assessment, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    carried = sc.regenerate_skeleton(SPEC, ASSESSMENT, REFERENCE, "Campagne Boule")
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    spec.update(carried)
    spec["preSpecAssessment"] = assessment["preSpecAssessment"]
    spec["qualityContract"] = assessment["qualityContract"]
    SPEC.write_text(json.dumps(patch(spec), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    sc.sync_pipeline_state(SPEC)  # recompute sculptPipeline.currentPass from reviewHistory - see docstring
    print(f"patched {SPEC} components={len(spec['componentTree'])} materials={len(spec['materials'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
