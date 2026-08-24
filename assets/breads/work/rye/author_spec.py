# Authors the subject-specific half of object-sculpt-spec.json in place. Pattern copied from
# campagne/author_spec.py, boilerplate factored into work/_spec_common.py.
#
# Geometry frame: Y up, radius 1.0 = the SHORT (Z) footprint radius, X stretched by
# LENGTH_STRETCH to form the oval bâtard. Profile points are (radiusFraction, tFrac) with tFrac=0
# at the base rim (both tips, since X is stretched uniformly) and tFrac=1 at the single apex,
# same convention as campagne/wholewheat - first bread in this batch with true directional
# (non-radial) asymmetry (elongated footprint + one lengthwise slash, not radial).
import json
import math
import pathlib
import sys

WORK = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(WORK.parent))
import _spec_common as sc  # noqa: E402

SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
REFERENCE = WORK.parents[1] / "src" / "rye.png"

# --- measured proportions (assets/breads/src/rye.png, -2, -3) ----------------------------------
DOME_HEIGHT = 0.375          # height/width 0.375 (front elevation ~450px/1200px) - nearly campagne's 0.379
LENGTH_STRETCH = 1.74        # top-down length/width 1220px/700px - the X-axis ellipse stretch factor
SEGMENTS = 32                 # no groove system needed (unlike campagne/wholewheat) so this stays lean
PROFILE_RINGS = (0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 0.97)  # smooth taper, no groove notches
SLASH_T_FULL = 0.9            # full depth from the apex down to here
SLASH_T_END = 0.58            # depth reaches 0 here (~81% of the half-length, matching the measured ~19% end margin)
SLASH_HALF_ANGLE_DEG = 11     # < 360/SEGMENTS*1.5 so it stays a single narrow column, weaker than campagne's
SLASH_DEPTH = 0.05            # shallower than campagne's 0.09 - "only a faintly opened ear" per the prompt JSON
WOBBLE = {"lobe3": 0.016, "lobe7": 0.009, "noise": 0.01}


def base_radius(t: float) -> float:
    return math.sqrt(max(0.0, 1.0 - t * t))


def dome_profile() -> list[list[float]]:
    pts: list[list[float]] = [[0.0, 0.0], [1.0, 0.0]]
    for t in PROFILE_RINGS:
        pts.append([round(base_radius(t), 5), t])
    pts.append([0.0, 1.0])
    return pts


PROFILE = dome_profile()

# --- palette -------------------------------------------------------------------------------
# assets/prompts/breads/rye.json gives only the dark patch hex directly.
CRUST_DARK_HEX = "#4A3226"
# Chestnut base has no hex anywhere in the prompt family ("deep chestnut brown" description only).
# Derived as a documented fixed-ratio LIGHTEN of the dark patch hex (not sampled) - the ratio is
# picked to land in a visibly reddish-brown "chestnut" range, clearly lighter than the patches but
# still a "deep" tone, not pale.
CHESTNUT_LIGHTEN_RATIO = 1.7


def scale_hex(hexcolor: str, ratio: float) -> str:
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))
    clamp = lambda v: max(0, min(255, round(v * ratio)))
    return f"#{clamp(r):02X}{clamp(g):02X}{clamp(b):02X}"


CRUST_BASE_HEX = scale_hex(CRUST_DARK_HEX, CHESTNUT_LIGHTEN_RATIO)
# Seeds + slash crumb share ONE bright material (types.ts <=2 materials constraint forces this
# reuse). Not invented: assets/prompts/breads/cracker.json and flatbread.json both use a "golden"
# family hex #D9A552 for a baked, seed/topping-adjacent surface - reused here deliberately rather
# than deriving a third color for this bread alone.
SEED_CRUMB_HEX = "#D9A552"

DETAIL_BINDINGS = {
    "mottled-crust": ("stain", "mottle-patches"),
    "caraway-seed-scatter": ("stain", "caraway-seeds"),
    "lengthwise-slash": ("groove", "dome-slash-crumb-lengthwise-slash"),
}

VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter", "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "elongated oval loaf, rounded at both ends",
            "dense caraway seed scatter across the whole visible surface",
            "hard-edged dark mottled patches over a lighter chestnut base",
            "single shallow slash along the top, centered, not reaching either tip",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-front", "view": "front elevation",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "width/height ratio measured 2.67 (height/width 0.375) - nearly identical to campagne's 0.379",
            "slash reads as a shallow, fairly wide-floored valley - weaker than campagne's sharp V",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-top", "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "clean oval footprint, length/width 1.74",
            "slash spans ~57% of the length, centered, ~19% margin unslashed at each end",
            "seeds dense and fairly uniform, no obvious margin unlike campagne's pore field",
        ],
        "confidence": 0.9,
    },
]


def rye_root() -> dict:
    return {
        "id": "root", "name": "Rye Bâtard", "level": "macro", "role": "assembly",
        "importance": 1.0, "confidence": 0.95, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": "Transform-only assembly node carrying the loaf body; it emits no geometry of its own.",
        "geometryDescriptor": {
            "topologyIntent": "transform node only",
            "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children",
        },
        "parent": None, "attachment": None,
        "dimensions": {"width": round(2 * LENGTH_STRETCH, 4), "height": DOME_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.95},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": sc.action_profile("root", "root"),
        "material": "crust", "materialLayers": ["crust"],
        "colorMaterialRecipe": sc.color_recipe(CRUST_BASE_HEX, SEED_CRUMB_HEX, "assembly node, inherits from children"),
        "deformations": [], "joints": [], "seams": [], "localFeatures": [],
        "surfaceDetail": sc.surface_detail(0.0, 0.0, 0.0, "n/a", "n/a", "Assembly node; no surface of its own."),
        "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": [], "fidelityTier": "blockout",
    }


def rye_dome() -> dict:
    return {
        "id": "dome", "name": "Rye loaf body", "level": "macro", "role": "body",
        "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": (
            "One continuous, smoothly varying mass, revolved then stretched along X into an oval "
            "footprint (radialScale in scripts/breads/lib.ts buildRevolvedShell) - this bread's family "
            "member is elongated rather than radially symmetric, the first such case in this batch."
        ),
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": PROFILE, "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {
                    "id": "length-stretch", "type": "radial-modulation", "axis": [1, 0, 0], "amplitude": LENGTH_STRETCH,
                    "notes": f"Uniform {LENGTH_STRETCH}x scale on X at every ring (buildRevolvedShell radialScale), turning the circular dome into an oval bâtard footprint.",
                },
                {
                    "id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0],
                    "amplitude": WOBBLE["lobe3"] + WOBBLE["lobe7"] + WOBBLE["noise"],
                    "notes": "Same wobble mechanism as campagne/wholewheat (scripts/breads/domeShell.ts-style makeDomeWobble, applied locally since rye has no groove profile to share via domeShell.ts).",
                },
            ],
            "uvStrategy": "cylindrical projection along X (scripts/breads/lib.ts uvCylindrical) - the length axis, matching the repo convention documented in lib.ts for elongated loaves",
            "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag",
        },
        "parent": "root", "attachment": None,
        "dimensions": {"width": round(2 * LENGTH_STRETCH, 4), "height": DOME_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.9},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": sc.action_profile("dome", "body"),
        "material": "crust", "materialLayers": ["crust"],
        "colorMaterialRecipe": sc.color_recipe(CRUST_BASE_HEX, CRUST_DARK_HEX, "whole loaf surface"),
        "deformations": ["length-stretch", "outline-wobble"], "joints": [], "seams": [],
        "localFeatures": [],
        "surfaceDetail": sc.surface_detail(
            0.0, 0.0, 0.0,
            "faceted planar shading from split vertices",
            "none on the body itself - mottle and seeds are texture-carried",
            "Mottled patches and caraway seed scatter are baked into a canvas basecolor texture (bakeTexture, uvCylindrical projection) rather than geometry: both are continuous color trends/small color flecks, not deep relief the way campagne's ring grooves or pancake's pores needed to be (CRIB divide: identity-critical RELIEF is geometric, identity-critical COLOR pattern is texture). Seeds were evaluated as micro-geometry per the reference's own faceted seed relief, but the render-verified texture approach reads clearly at this budget without the tessellation cost a ~100-seed geometric grid would add - see task report.",
        ),
        "evidenceRefs": ["view-front", "view-three-quarter", "view-top"],
        "details": [], "fidelityTier": "surface-pass",
    }


def rye_slash_crumb() -> dict:
    return {
        "id": "dome-slash-crumb", "name": "Lengthwise slash crumb", "level": "meso", "role": "surface",
        "importance": 0.9, "confidence": 0.85, "primitive": "lathe", "topologyClass": "continuous-sculpt",
        "topologyRationale": (
            "Not a separate solid: the same revolved-and-stretched loaf mass, masked to the triangles "
            "inside the slash's angular falloff band (now just 2 opposite arms at 0/180deg along the "
            "length axis, not campagne's 4-fold cross) and re-materialed."
        ),
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": PROFILE, "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {
                    "id": "lengthwise-slash", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": SLASH_DEPTH,
                    "notes": (
                        f"2 opposite arms at 0/180deg (along the stretched X length axis), cosine "
                        f"falloff across +/-{SLASH_HALF_ANGLE_DEG}deg, full depth from the apex down to "
                        f"tFrac={SLASH_T_FULL}, smoothstep taper to 0 by tFrac={SLASH_T_END} (~81% of the "
                        "half-length, matching the measured ~19% unslashed end margin). No separate ear-bump "
                        "band, unlike campagne - the prompt JSON explicitly calls this ear 'weaker, less "
                        "pronounced', so the shallower SLASH_DEPTH alone carries that distinction."
                    ),
                },
            ],
            "uvStrategy": "cylindrical projection along X (scripts/breads/lib.ts uvCylindrical)",
            "normalStrategy": "flat normals baked by splitting vertices after displacement",
        },
        "parent": "dome", "attachment": None,
        "dimensions": {
            "width": round(2 * base_radius(SLASH_T_END) * LENGTH_STRETCH, 4),
            "height": SLASH_DEPTH,
            "depth": round(2 * math.sin(math.radians(SLASH_HALF_ANGLE_DEG)), 4),
            "units": "relative", "confidence": 0.8,
        },
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": sc.action_profile("dome-slash-crumb", "surface"),
        "material": "seed-crumb", "materialLayers": ["seed-crumb"],
        "colorMaterialRecipe": sc.color_recipe(SEED_CRUMB_HEX, CRUST_BASE_HEX, "lengthwise slash trench floor"),
        "deformations": ["lengthwise-slash"], "joints": [],
        "seams": [{"id": "dome-slash-crumb-boundary", "kind": "material-boundary", "notes": "Boundary is the angular falloff edge of the slash trench, a geometric edge shared with dome."}],
        "localFeatures": [
            {
                "id": "dome-slash-crumb-lengthwise-slash", "name": "Lengthwise slash valley", "kind": "groove",
                "description": f"One shallow trench running along the length, 2-fold symmetric about the apex (2 opposite arms, not campagne's 4-fold cross), reaching tFrac={SLASH_T_END}, exposing the shared seed/crumb color {SEED_CRUMB_HEX} at the floor.",
                "evidenceRefs": ["view-three-quarter", "view-top"], "confidence": 0.9, "repetitionSystemRef": "slash-arms",
            },
        ],
        "surfaceDetail": sc.surface_detail(
            0.0, 0.0, SLASH_DEPTH,
            "faceted planar shading from split vertices",
            "lengthwise slash displaced into the revolved-and-stretched loaf",
            "assets/prompts/breads/rye.json notes_ko: without the mottled color and caraway seeds the model reads as a plain bâtard, but the slash itself is explicitly called weaker/less pronounced than campagne's - kept shallow rather than dropped.",
        ),
        "evidenceRefs": ["view-three-quarter", "view-top"],
        "details": ["dome-slash-crumb-lengthwise-slash"], "fidelityTier": "surface-pass",
    }


ROOT = rye_root()
DOME = rye_dome()
SLASH_CRUMB = rye_slash_crumb()

MATERIALS = [
    sc.material(
        "crust", "Mottled rye crust", CRUST_BASE_HEX, "whole loaf surface",
        "Chestnut base derived by a documented fixed-ratio lighten (this file, CHESTNUT_LIGHTEN_RATIO=1.7) "
        "of the dark patch hex #4A3226, which IS given directly in assets/prompts/breads/rye.json geometry.crust.",
        [
            {
                "id": "mottle-patches", "name": "Hard-edged dark mottled patches", "maskSource": "texture",
                "description": f"Baked canvas blob patches in {CRUST_DARK_HEX} over the {CRUST_BASE_HEX} base, hard-edged (not a smooth gradient), scattered via the builder rng.",
                "evidenceRefs": ["view-three-quarter", "view-front"], "appliesTo": ["dome"],
            },
            {
                "id": "caraway-seeds", "name": "Dense caraway seed scatter", "maskSource": "texture",
                "description": f"Baked canvas elongated ellipse strokes in {SEED_CRUMB_HEX} (the shared seed/crumb hex), densely and near-uniformly scattered, small random rotation per seed for a scattered look.",
                "evidenceRefs": ["view-top", "view-three-quarter"], "appliesTo": ["dome"],
            },
        ],
        texture_size=192,
        texture_note="uvCylindrical(axis='x') projection; one 192x192 basecolor canvas carries the mottle blobs + dense seed scatter.",
    ),
    sc.material(
        "seed-crumb", "Shared seed and slash-crumb tone", SEED_CRUMB_HEX, "slash trench floor and caraway seed color",
        "Reused, not invented: assets/prompts/breads/cracker.json and flatbread.json both use the family's "
        "'golden' hex #D9A552 for a baked surface tone. Sharing it here for both the slash crumb and the "
        "seed color keeps rye within the <=2-material contract while both regions plausibly read as a "
        "similarly bright warm tone against the dark mottled crust.",
        [],
    ),
]

REPETITION_SYSTEMS = [
    {
        "id": "slash-arms", "name": "Lengthwise slash arms", "level": "meso",
        "hostComponents": ["dome", "dome-slash-crumb"], "elementComponentIds": ["dome-slash-crumb"],
        "elementKind": "recessed vertex displacement, not an added mesh",
        "count": 2,
        "distribution": {
            "mode": "2-fold rotational symmetry at 0/180deg (along the stretched length axis), cosine angular falloff",
            "halfAngleDeg": SLASH_HALF_ANGLE_DEG, "tEnd": SLASH_T_END,
        },
        "sizeClasses": [{"id": "arm", "halfAngleDeg": SLASH_HALF_ANGLE_DEG, "depth": SLASH_DEPTH}],
        "seedRule": "Fixed authored angles, not random - a single lengthwise cut is deliberate, not procedurally scattered.",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "caraway-seed-scatter", "name": "Caraway seed scatter", "level": "micro",
        "hostComponents": ["dome"], "elementComponentIds": [],
        "elementKind": "baked texture scatter, not geometry or an instanced mesh",
        "count": 260,
        "distribution": {"mode": "rng-seeded scatter across the uvCylindrical canvas, dense and near-uniform (denser than campagne's pores or wholewheat's speckle)"},
        "sizeClasses": [{"id": "seed", "lengthPxAt192": [4, 9]}],
        "seedRule": "Positions come exclusively from the builder's injected rng argument, never Math.random (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {
        "id": "batard-silhouette", "name": "Elongated oval bâtard silhouette", "tier": "critical",
        "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["root", "dome"], "evidenceRefs": ["view-front", "view-top"],
    },
    {
        "id": "lengthwise-slash", "name": "Single lengthwise slash, weaker than campagne's", "tier": "critical",
        "passIds": ["form-refinement"], "minimumScore": 0.75, "mustPass": True,
        "componentRefs": ["dome-slash-crumb"], "evidenceRefs": ["view-three-quarter", "view-top"],
    },
    {
        "id": "mottled-crust", "name": "Hard-edged mottled crust pattern", "tier": "critical",
        "passIds": ["material-pass"], "minimumScore": 0.75, "mustPass": True,
        "componentRefs": ["dome"], "evidenceRefs": ["view-three-quarter", "view-front"],
    },
    {
        "id": "caraway-seeds", "name": "Dense caraway seed coverage", "tier": "critical",
        "passIds": ["material-pass"], "minimumScore": 0.75, "mustPass": True,
        "componentRefs": ["dome"], "evidenceRefs": ["view-top", "view-three-quarter"],
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
        "scaleReference": "short-axis (Z) radius = 1.0 relative unit before the X length-stretch; absolute scale is meaningless (scripts/breads/types.ts section 7).",
    }
    spec["referenceCamera"] = {
        "solved": False, "fovDegrees": 0.0, "aspect": 1.0,
        "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6],
        "note": "Not solved and deliberately not matched to the reference, same convention as campagne/pancake. The loaf's long axis is placed along world X per lib.ts's documented uvCylindrical convention for elongated loaves.",
    }
    spec["silhouette"] = {
        "boundingShape": f"elongated stretched dome, {round(2*LENGTH_STRETCH,2)} long by 2.0 wide by {DOME_HEIGHT} tall in short-radius units",
        "aspectRatios": [
            {"id": "height-over-width", "value": DOME_HEIGHT, "source": "rye-2.png front elevation, ~450px/1200px"},
            {"id": "length-over-width", "value": LENGTH_STRETCH, "source": "rye-3.png top-down, ~1220px/700px"},
            {"id": "slash-reach-fraction", "value": round(1 - base_radius(SLASH_T_END), 4), "source": "rye-3.png, slash covers ~81% of the half-length"},
        ],
        "symmetry": "bilateral about the long (X) axis; not radial (first directionally-asymmetric bread in this batch)",
        "dominantCurves": ["continuous ellipse-profile dome stretched along X, rounded at both tips", "shallow lengthwise slash valley along the top"],
        "negativeSpaces": ["the lengthwise slash trench itself"],
        "landmarks": ["apex at the slash's midpoint", "tips at tFrac 0 on both ends", "slash ends at tFrac 0.58 on both sides"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, DOME, SLASH_CRUMB]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget",
        "targetTriangles": 1200, "maxDrawCalls": 2, "textureSize": 192, "fpsTarget": 60,
        "optimizationPolicy": (
            "Hard consumer budget per scripts/breads/types.ts section 6; fire-bread-group target "
            "1200-2000 tri, GLB <=200KB. This bread has no ring-groove system (unlike campagne/wholewheat), "
            "so it naturally lands toward the low end of the band without needing dense tessellation - "
            "CRIB: don't raise the grid when there's no dense surface detail to carry."
        ),
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": [
            "elongated oval bâtard silhouette, length/width ~1.74",
            "single lengthwise slash, weaker/shallower than campagne's, not reaching either tip",
            "hard-edged mottled dark/light crust pattern",
            "dense caraway seed coverage",
            "faceted flat shading baked into geometry",
        ],
        "niceToHave": ["exact mottle patch shapes", "exact seed positions", "micro-geometry seed relief (evaluated, texture chosen instead - see task report)"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update(sc.material_pass_look_dev())
    spec["lookDevTargets"]["lightingPass"] = sc.lighting_block()
    spec["lightingFromPhoto"] = sc.lighting_from_photo()
    spec["proceduralStrategy"] = [
        "Build a smooth (no groove notches) dome profile and revolve manually into an indexed shell via scripts/breads/lib.ts buildRevolvedShell, with radialScale stretching X by LENGTH_STRETCH at every ring - never THREE.LatheGeometry.",
        "Apply the per-sector outline wobble identically to every ring.",
        "Displace one lengthwise slash (2 opposite arms at 0/180deg) into the same indexed shell using an angular cosine falloff, shallower than campagne's.",
        "Jitter vertices while the geometry is still indexed.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project cylindrical UVs along X, bake the mottle+seed canvas texture, split triangles by slash angular membership into crust vs seed-crumb, merge by material into exactly two meshes.",
    ]
    spec["assumptions"] = [
        "The flat base is never visible: no turntable azimuth above the horizon faces it.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "Exact mottle patch shapes and exact seed positions are not identity-critical; coverage/density and hard-edged patchiness are what is matched.",
    ]
    spec["risks"] = [
        {
            "id": "seed-representation-tradeoff", "severity": "medium",
            "description": "The reference renders caraway seeds as small raised faceted geometry, not flat color. A texture-only approach risks reading as flat dots rather than seeds.",
            "mitigation": "Verified via the breadlab-shot review render before finalizing (see task report): elongated, rotated ellipse strokes at high density read convincingly as a seed topping at this render scale/style, and a geometric seed grid dense enough for ~100 seeds would blow the triangle budget for a texture-carried detail. Documented as a deliberate choice, not an oversight.",
        },
        {
            "id": "vertex-color-loss", "severity": "high",
            "description": "Any vertex-color-based region paint is silently discarded by the runtime's MeshLambertMaterial swap.",
            "mitigation": "Mottle/seeds are baked canvas texture (map survives the swap); crust vs seed-crumb split is a geometric angular boundary, never vertex colors.",
        },
        {
            "id": "seam-tear", "severity": "medium",
            "description": "Dome and slash-crumb are the same continuous mesh split by material after the fact.",
            "mitigation": "Build one indexed loaf shell, wobble/slash/jitter it whole, then split its triangles into two material buckets by angular membership (campagne.ts pattern, scripts/breads/lib.ts splitTrianglesByVertexMask).",
        },
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup on the whole loaf; no plausible sub-break for a bâtard"]
    sc.trim_passes(spec)
    return spec


def main() -> int:
    assessment = json.loads(ASSESSMENT.read_text(encoding="utf-8"))
    sc.bind_details(assessment["preSpecAssessment"], DETAIL_BINDINGS)
    sc.resolve_unknowns(assessment["preSpecAssessment"])
    ASSESSMENT.write_text(json.dumps(assessment, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    carried = sc.regenerate_skeleton(SPEC, ASSESSMENT, REFERENCE, "Rye Bâtard")
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    spec.update(carried)
    spec["preSpecAssessment"] = assessment["preSpecAssessment"]
    spec["qualityContract"] = assessment["qualityContract"]
    SPEC.write_text(json.dumps(patch(spec), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"patched {SPEC} components={len(spec['componentTree'])} materials={len(spec['materials'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
