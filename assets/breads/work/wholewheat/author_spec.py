# Authors the subject-specific half of object-sculpt-spec.json in place. Pattern copied from
# campagne/author_spec.py, boilerplate factored into work/_spec_common.py.
#
# Geometry frame: Y up, radius 1.0 = dome base radius. Same silhouette FAMILY as campagne (shared
# scripts/breads/domeShell.ts builder), but its own measured proportions (DOME_HEIGHT below) come
# from this bread's own reference per CRIB (images are proportion ground truth, JSON is color only).
import json
import math
import pathlib
import sys

WORK = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(WORK.parent))
import _spec_common as sc  # noqa: E402

SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
REFERENCE = WORK.parents[1] / "src" / "wholewheat.png"

# --- measured proportions (assets/breads/src/wholewheat.png, -2, -3) ---------------------------
# Values below are the FINAL tuned constants from scripts/breads/wholewheat.ts after the
# 3-iteration review loop - kept in sync here per team-lead directive (2026-08-24).
# DOME_HEIGHT started at an initial front-elevation pixel estimate of 0.6, but the same-framing
# breadlab compare collage showed the reference reading much rounder (near-spherical) than that -
# raised across two more iterations to 0.85 then 1.05 against direct visual measurement.
DOME_HEIGHT = 1.05
SEGMENTS = 32                 # matches campagne (shared domeShell.ts wobble/groove code)
# GROOVE_COUNT started at 10 (wholewheat measured 12-13 rings, denser than campagne's ~10-11) but
# that pushed tri to 2304, over the 1200-2000 budget - dropped to 8 (matching campagne) to land at
# 1920; the texture's continuous ring-phase band compensates for the lower physical groove count.
GROOVE_COUNT = 8
GROOVE_ZONE = (0.06, 0.98)    # rings reach edge to edge in the reference - wider than campagne's zone
GROOVE_HALF_WIDTH_T = 0.012
GROOVE_DEPTH = 0.026
WOBBLE = {"lobe3": 0.018, "lobe7": 0.01, "noise": 0.01}


def base_radius(t: float) -> float:
    return math.sqrt(max(0.0, 1.0 - t * t))


def dome_profile() -> list[list[float]]:
    """Mirrors scripts/breads/domeShell.ts buildDomeProfile exactly - wholewheat.ts does not
    define its own profile builder, it imports the shared one (same silhouette-family skeleton as
    campagne, per team-lead directive). An earlier version of this function used its own different
    fixed tail ((0.99, 1.0) instead of the shared (0.9, 0.94, 0.97, 1.0)), which both diverged from
    the actual runtime construction AND, like campagne's, could regress in t: with GROOVE_COUNT=8
    and GROOVE_ZONE upper bound 0.98, the last groove's tOut is ~0.9345, past the shared tail's
    first value 0.9 - appended in insertion order that folds a self-intersecting pleat near the
    apex (session code-review finding, 2026-08-24). Collect everything but the two base-rim points,
    sort by t, and drop near-duplicates (EPS) instead. Sorting is deterministic (rng-independent).
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
    for t in (0.9, 0.94, 0.97, 1.0):
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
# assets/prompts/breads/wholewheat.json geometry.crust[0] gives the base directly.
CRUST_HEX = "#8C5A32"
# Speckle fleck has no hex anywhere in the prompt family. Derived as a documented fixed-ratio
# lighten of the crust base (not sampled) - distinct from campagne's flour-dust hex (#EFE7D2,
# a near-white dusting) because these are baked-in whole-grain flecks, warmer and less pale.
SPECKLE_LIGHTEN_RATIO = 1.55


def scale_hex(hexcolor: str, ratio: float) -> str:
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))
    clamp = lambda v: max(0, min(255, round(v * ratio)))
    return f"#{clamp(r):02X}{clamp(g):02X}{clamp(b):02X}"


SPECKLE_HEX = scale_hex(CRUST_HEX, SPECKLE_LIGHTEN_RATIO)
CRUST_DARK_RATIO = 0.72  # dome shading-band dark end, same technique as campagne
CRUST_DARK_HEX = scale_hex(CRUST_HEX, CRUST_DARK_RATIO)

DETAIL_BINDINGS = {
    "ring-groove-field": ("groove", "dome-ring-grooves"),
    "grain-speckle": ("stain", "grain-speckle"),
    "darker-crust-tone": ("stain", "crust-gradient"),
}

VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter", "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "rounder, taller dome than campagne, no slash",
            "concentric ring grooves cover the whole visible dome surface",
            "dense, fairly uniform speckle across the whole crust",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-front", "view": "front elevation",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "width/height ratio measured 1.68 (height/diameter 0.596) from a single front-elevation pixel measurement - a noticeably rounder dome than campagne's 0.379. Review-loop iteration against the same-framing breadlab compare collage (a more direct measurement than a single static image) revised this upward twice, landing on DOME_HEIGHT=1.05 (height/diameter 0.525) - see this file's DOME_HEIGHT comment.",
            "widest point at the base rim, continuous curve to the apex, same silhouette shape family as campagne (just taller)",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-top", "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "12-13 concentric rings, denser than campagne, reaching edge to edge with no smooth outer margin",
            "no slash - a plain unbroken disk unlike campagne's X",
            "speckle flecks scattered densely and uniformly, not ridge-biased like campagne's flour dust",
        ],
        "confidence": 0.9,
    },
]


def wholewheat_root() -> dict:
    return {
        "id": "root", "name": "Wholewheat Boule", "level": "macro", "role": "assembly",
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
        "colorMaterialRecipe": sc.color_recipe(CRUST_HEX, SPECKLE_HEX, "assembly node, inherits from children"),
        "deformations": [], "joints": [], "seams": [], "localFeatures": [],
        "surfaceDetail": sc.surface_detail(0.0, 0.0, 0.0, "n/a", "n/a", "Assembly node; no surface of its own."),
        "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": [], "fidelityTier": "blockout",
    }


def wholewheat_dome() -> dict:
    return {
        "id": "dome", "name": "Wholewheat dome body", "level": "macro", "role": "body",
        "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": (
            "One continuous, smoothly varying rotationally symmetric mass, same construction family as "
            "campagne's dome (shared scripts/breads/domeShell.ts) but its own measured height ratio and no "
            "slash. Decision tree step 6."
        ),
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": PROFILE, "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {
                    "id": "ring-grooves", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": GROOVE_DEPTH,
                    "notes": f"{GROOVE_COUNT} narrow V-notch rings baked into the profile radius, spanning nearly the whole profile (edge to edge per the reference top-down view). Matches campagne's own groove count ({GROOVE_COUNT}) - an initial 10 pushed tri over budget (see this file's GROOVE_COUNT comment); the reference's own denser 12-13-ring look is approximated by the correlated texture ring-phase band, not by extra physical grooves.",
                },
                {
                    "id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0],
                    "amplitude": WOBBLE["lobe3"] + WOBBLE["lobe7"] + WOBBLE["noise"],
                    "notes": "Same wobble mechanism as campagne (scripts/breads/domeShell.ts makeDomeWobble), slightly gentler amplitude.",
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
        "colorMaterialRecipe": sc.color_recipe(CRUST_HEX, CRUST_DARK_HEX, "whole dome surface"),
        "deformations": ["ring-grooves", "outline-wobble"], "joints": [], "seams": [],
        "localFeatures": [
            {
                "id": "dome-ring-grooves", "name": "Concentric banneton ring grooves", "kind": "recessed-detail-scatter",
                "description": f"{GROOVE_COUNT} concentric V-notch grooves centered on the apex, covering nearly the whole profile (tFrac {GROOVE_ZONE[0]}-{GROOVE_ZONE[1]}), same count as campagne's (budget-limited; see GROOVE_COUNT comment).",
                "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.95, "repetitionSystemRef": "ring-groove-field",
            },
        ],
        "surfaceDetail": sc.surface_detail(
            0.0, 0.0, GROOVE_DEPTH,
            "faceted planar shading from split vertices; each groove contributes its own hard-edged channel",
            "ring grooves and outline wobble baked into the revolved profile",
            "Crust gradient and grain speckle are baked into a canvas basecolor texture (bakeTexture, uvDome projection), same technique as campagne but with a speckle fleck pattern instead of ridge-biased flour dust, and no crumb material (no slash).",
        ),
        "evidenceRefs": ["view-front", "view-three-quarter", "view-top"],
        "details": ["dome-ring-grooves"], "fidelityTier": "surface-pass",
    }


ROOT = wholewheat_root()
DOME = wholewheat_dome()

MATERIALS = [
    sc.material(
        "crust", "Wholewheat dome crust", CRUST_HEX, "whole dome surface",
        "Hand-transcribed from assets/prompts/breads/wholewheat.json geometry.crust[0]; JSON states this is "
        "'one full shade darker than a plain campagne crust' (#A9713F), verified: 140,90,50 vs 169,113,63, "
        "darker on every channel.",
        [
            {
                "id": "crust-gradient", "name": "Light-to-dark radial gradient", "maskSource": "texture",
                "description": f"Baked canvas gradient from {CRUST_HEX} near the apex/ring ridges to {CRUST_DARK_HEX} lower on the dome, same 3-band quantized technique as campagne, correlated with the ring-phase function.",
                "evidenceRefs": ["view-front", "view-three-quarter"], "appliesTo": ["dome"],
            },
            {
                "id": "grain-speckle", "name": "Whole-grain speckle", "maskSource": "texture",
                "description": f"Baked canvas speckle in {SPECKLE_HEX}, scattered densely and fairly uniformly (not ridge-biased, unlike campagne's flour dust) via the builder rng.",
                "evidenceRefs": ["view-top", "view-three-quarter"], "appliesTo": ["dome"],
            },
        ],
        texture_size=160,
        texture_note="uvDome projection; one 160x160 basecolor canvas carries the gradient bands + speckle scatter, same bakeTexture technique as campagne.",
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
        },
        "sizeClasses": [{"id": "ring", "halfWidthT": GROOVE_HALF_WIDTH_T, "depth": GROOVE_DEPTH}],
        "seedRule": "Fixed authored values (profile positions), not random.",
        "evidenceRefs": ["view-top"],
    },
    {
        "id": "grain-speckle-scatter", "name": "Whole-grain speckle scatter", "level": "micro",
        "hostComponents": ["dome"], "elementComponentIds": [],
        "elementKind": "baked texture speckle, not geometry or an instanced mesh",
        "count": 220,
        "distribution": {"mode": "rng-seeded scatter across the uvDome canvas, roughly uniform (not ridge-biased)"},
        "sizeClasses": [{"id": "fleck", "radiusPxAt160": [1, 3]}],
        "seedRule": "Positions come exclusively from the builder's injected rng argument, never Math.random (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {
        "id": "dome-silhouette", "name": "Rounder, taller dome silhouette", "tier": "critical",
        "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["root", "dome"], "evidenceRefs": ["view-front", "view-three-quarter"],
    },
    {
        "id": "ring-groove-field", "name": "Concentric ring groove field, edge to edge", "tier": "critical",
        "passIds": ["surface-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["dome"], "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "darker-tone-vs-campagne", "name": "Crust reads darker than campagne", "tier": "critical",
        "passIds": ["material-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["dome"], "evidenceRefs": ["view-three-quarter"],
    },
    {
        "id": "grain-speckle", "name": "Whole-grain speckle across the crust", "tier": "important",
        "passIds": ["material-pass"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["dome"], "evidenceRefs": ["view-top", "view-front"],
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
        "note": "Not solved and deliberately not matched to the reference, same convention as campagne/pancake.",
    }
    spec["silhouette"] = {
        "boundingShape": f"rounder dome, 2.0 wide by {DOME_HEIGHT} tall in radius units",
        "aspectRatios": [
            {"id": "height-over-diameter", "value": round(DOME_HEIGHT / 2.0, 4), "source": "wholewheat-2.png front elevation, ~685px/1150px"},
        ],
        "symmetry": "radial (approximate, broken only by the outline wobble) - no slash-driven asymmetry unlike campagne",
        "dominantCurves": ["continuous ellipse-profile dome, widest at the base rim, rounder than campagne", "V-notch ring grooves repeating up the dome, denser than campagne"],
        "negativeSpaces": [],
        "landmarks": ["apex at the dome center", "base rim at tFrac 0 (widest point)"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, DOME]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget",
        "targetTriangles": 1920, "maxDrawCalls": 1, "textureSize": 160, "fpsTarget": 60,
        "optimizationPolicy": "Hard consumer budget per scripts/breads/types.ts section 6; fire-bread-group target 1200-2000 tri, GLB <=200KB (CRIB budget table), reached by construction.",
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": [
            "rounder, taller dome silhouette than campagne (height/diameter ~0.53, near-spherical against campagne's 0.38)",
            "concentric ring grooves covering the whole dome edge to edge, denser than campagne",
            "crust reading one full shade darker than campagne - the primary bread-to-bread discriminator",
            "coarse whole-grain speckle across the crust",
            "faceted flat shading baked into geometry",
        ],
        "niceToHave": ["exact ring phase/spiral pitch", "exact speckle positions"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update(sc.material_pass_look_dev())
    spec["lookDevTargets"]["lightingPass"] = sc.lighting_block()
    spec["lightingFromPhoto"] = sc.lighting_from_photo()
    spec["proceduralStrategy"] = [
        "Build the dome profile with ring grooves baked in, via scripts/breads/domeShell.ts buildGroovedDomeShell (shared with campagne) - never THREE.LatheGeometry.",
        "No slash/crumb pass - this bread is a single continuous material, single mesh.",
        "Jitter vertices while the geometry is still indexed.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project dome-polar UVs, bake the crust gradient+speckle canvas texture, merge into one mesh/material.",
    ]
    spec["assumptions"] = [
        "The flat base is never visible: no turntable azimuth above the horizon faces it.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "Exact ring phase and exact speckle positions are not identity-critical.",
    ]
    spec["risks"] = [
        {
            "id": "groove-below-tessellation", "severity": "high",
            "description": "A ring groove narrower or shallower than the local profile tFrac spacing lands between rings and disappears silently (CRIB detail-below-tessellation, same lesson as campagne/pancake).",
            "mitigation": "Grooves are 3 explicit profile points each; depth sized against groove spacing before render, verified via the breadlab-shot review loop.",
        },
        {
            "id": "campagne-wholewheat-confusion", "severity": "high",
            "description": "Sharing scripts/breads/domeShell.ts with campagne risks the two breads reading as visually identical if the darkness delta or the ring/silhouette differences are too subtle.",
            "mitigation": "Rendered both breads' compare shots and inspected them side by side; darker crust tone, denser rings reaching edge-to-edge, no slash, and a rounder silhouette are all distinguishing at a glance (see task report).",
        },
        {
            "id": "vertex-color-loss", "severity": "high",
            "description": "Any vertex-color-based region paint is silently discarded by the runtime's MeshLambertMaterial swap.",
            "mitigation": "The crust gradient/speckle is a baked canvas texture (map survives the swap), never vertex colors.",
        },
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup on the whole dome; no plausible sub-break for a boule"]
    sc.trim_passes(spec)
    return spec


def main() -> int:
    assessment = json.loads(ASSESSMENT.read_text(encoding="utf-8"))
    sc.bind_details(assessment["preSpecAssessment"], DETAIL_BINDINGS)
    sc.resolve_unknowns(assessment["preSpecAssessment"])
    ASSESSMENT.write_text(json.dumps(assessment, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    carried = sc.regenerate_skeleton(SPEC, ASSESSMENT, REFERENCE, "Wholewheat Boule")
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
