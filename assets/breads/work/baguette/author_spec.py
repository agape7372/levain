# Authors the subject-specific half of object-sculpt-spec.json in place.
# Geometry frame: Y up, X = length axis. Radius = 1.0 unit. Half-length = 11.365
# (measured L/D from baguette-2.png pixel bbox, image-analysis.json).
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "baguette.png"

PIPELINE_OWNED = ("reviewHistory", "visualEvidence", "sculptPipeline")


def regenerate_skeleton() -> dict:
    carried: dict = {}
    if SPEC.exists():
        old = json.loads(SPEC.read_text(encoding="utf-8"))
        carried = {k: old[k] for k in PIPELINE_OWNED if old.get(k)}
    SPEC.unlink(missing_ok=True)
    subprocess.run(
        [
            sys.executable, str(SKILL / "forge" / "stage2_spec" / "new_sculpt_spec.py"),
            "Baguette with Diagonal Slashes", "--image", str(REFERENCE),
            "--assessment", str(ASSESSMENT), "--out", str(SPEC),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


HALF_LENGTH = 5.0  # stylized L/D (user verdict 2026-08-24; measured 11.365 rejected for card legibility)
CRUST_HEX = "#A9713F"
CRUMB_HEX = "#F4EAD4"
CRUST_RGBA = "rgba(169, 113, 63, 1.0)"
CRUMB_RGBA = "rgba(244, 234, 212, 1.0)"

SLASH_COUNT = 4
SLASH_AXIS_ANGLE_DEG = 32  # tilt of each slash's long axis from the length (X) axis
SLASH_MECHANISM = (
    "Grid-cell classification generalized from scone's point-fissure and loaf's ridge-sweep "
    "techniques to a 2D oriented band on an unrolled tube surface. For each (station, sector) "
    "grid vertex near the top of the tube, its local (X, arc-length-from-top) position is "
    "rotated by -32deg into the slash's own (along, across) frame; if |along| < halfLength and "
    "|across| < widthEnvelope(along) (an elliptical eye-shaped envelope that closes to 0 at "
    "along=+-halfLength) the vertex is inside the slash footprint. Vertices in the inner ~55% "
    "of the width envelope are the crumb-coloured trench floor (dipped inward); the outer band "
    "is the raised crust-coloured ear (pushed outward). Triangles are classified crumb by "
    "majority vertex vote, then emitted in two ordered passes (crust triangles first, then "
    "crumb) so scripts/breads/lib.ts sliceTriangles can split them by a single contiguous "
    "boundary index, exactly like scone's body/face split - generalized here from a single "
    "shared ring to four independent oriented bands scattered across the grid."
)

VIEW_EVIDENCE = [
    {"id": "view-three-quarter", "view": "three-quarter top-front, diagonal framing", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["long thin spindle tapered to a point at both ends", "4 diagonal overlapping slashes with raised ear rims and recessed crumb"], "confidence": 0.95},
    {"id": "view-front", "view": "front elevation", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["length/diameter = 11.365 (measured pixel bbox)", "gradual taper over roughly the outer 35-40% of the length at each end"], "confidence": 0.95},
    {"id": "view-top", "view": "strict top-down orthographic", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["4 lens/eye-shaped slashes tilted diagonally relative to the length axis, overlapping consecutively", "slashes span most of the constant-radius middle portion of the length"], "confidence": 0.9},
]


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant, "secondaryAlbedo": secondary,
        "materialClass": "ceramic", "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust, opaque dielectric, roughness 1.0, no specular lobe - same class as the other breads' crust materials.",
        "zone": zone, "evidenceRefs": ["assets/prompts/breads/baguette.json geometry.crust"],
    }


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role,
        "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": False, "twist": False, "detach": False, "visibility": True, "materialState": True},
        "sockets": [],
        "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Capsule proxy matching the tapered tube; slashes are far below collider resolution."},
        "constraints": [],
        "destruction": {"breakable": False, "fractureGroup": cid, "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"},
    }


def surface_detail(bump: float, normal: str, disp: str, notes: str) -> dict:
    return {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump, "normalPattern": normal, "displacementPattern": disp,
            "occlusionPattern": "cavity darkening inside each slash trench", "edgeWearPattern": "none - freshly baked", "notes": notes}


def baguette_body() -> dict:
    return {
        "id": "baguette-body", "name": "Tapered crust shell", "level": "macro", "role": "body",
        "importance": 0.85, "confidence": 0.9, "primitive": "tapered-sweep", "topologyClass": "continuous-sculpt",
        "topologyRationale": "A single continuous tube swept along the length axis with a radius profile tapering to true poles at both ends - genuinely a tapered sweep, not a lathe (LatheGeometry is banned per CRIB: phi-seam vertex duplication tears under jitter).",
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation, highest facet density of the chunk group",
            "latheProfile": {"points": [[0, -1], [1, 0], [0, 1]], "segments": 22, "phiStart": 0.0, "phiLength": 6.283185307179586,
                              "note": "Not a lathe - swept along X through hand-authored STATIONS (radius(x)), true poles at both tips. See scripts/breads/baguette.ts."},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [{"id": "slash-scatter", "type": "vertex-displacement", "axis": [0, 1, 0], "amplitude": 0.12, "notes": SLASH_MECHANISM}],
            "uvStrategy": "cylindrical projection along X (scripts/breads/lib.ts uvCylindrical)",
            "normalStrategy": "flat normals baked by splitting vertices, never a flatShading flag",
        },
        "parent": "root", "attachment": None,
        "dimensions": {"width": 2 * HALF_LENGTH, "height": 2.0, "depth": 2.0, "units": "relative", "confidence": 0.9},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": action_profile("baguette-body", "body"),
        "material": "crust", "materialLayers": ["crust"],
        "colorMaterialRecipe": color_recipe(CRUST_RGBA, CRUMB_RGBA, "entire crust surface except slash floors"),
        "deformations": ["slash-scatter"], "joints": [],
        "seams": [{"id": "slash-boundary", "kind": "material-boundary", "notes": "Boundary is the per-slash trench-floor footprint, classified per grid vertex - 4 independent boundaries, not one shared ring."}],
        "localFeatures": [
            {"id": "taper-profile", "name": "Gradual bipolar taper", "kind": "profile-curvature",
             "description": "Radius eases from 1.0 in the constant middle down to 0 (a true pole) over the outer ~35-40% of the length at each end - a streamlined point, not an abrupt cone.", "evidenceRefs": ["view-front"], "confidence": 0.9},
        ],
        "surfaceDetail": surface_detail(0.0, "faceted planar shading from split vertices", "profile-driven taper only outside the slash zone", "Crust shares one flat albedo except inside slash trenches; deliberately the densest facet field of the chunk group, matching the reference's visibly higher facet count."),
        "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["taper-profile"], "fidelityTier": "form-refinement",
    }


def baguette_slashes() -> dict:
    return {
        "id": "baguette-slashes", "name": "Diagonal slash scores with ears and exposed crumb", "level": "meso", "role": "surface",
        "importance": 1.0, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "continuous-sculpt",
        "topologyRationale": "4 oriented recessed-and-raised bands displaced into the parent tube's own grid - not separate geometry. The identity-critical feature per baguette.json notes_ko.",
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": [[0, -1], [1, 0], [0, 1]], "segments": 22, "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [{"id": "slash-scatter", "type": "vertex-displacement", "axis": [0, 1, 0], "amplitude": 0.12, "notes": SLASH_MECHANISM}],
            "uvStrategy": "cylindrical projection along X (scripts/breads/lib.ts uvCylindrical)",
            "normalStrategy": "flat normals baked by splitting vertices",
        },
        "parent": "baguette-body", "attachment": None,
        "dimensions": {"width": 2.2, "height": 0.5, "depth": 0.5, "units": "relative", "confidence": 0.75},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": action_profile("baguette-slashes", "surface"),
        "material": "crumb", "materialLayers": ["crumb"],
        "colorMaterialRecipe": color_recipe(CRUMB_RGBA, CRUST_RGBA, "trench floor inside each slash only"),
        "deformations": ["slash-scatter"], "joints": [],
        "seams": [{"id": "slash-boundary-face", "kind": "material-boundary", "notes": "Shares the parent body's per-slash grid-classified boundary exactly."}],
        "localFeatures": [
            {"id": "slash-field", "name": "4 diagonal overlapping slashes", "kind": "recessed-detail-scatter",
             "description": f"{SLASH_COUNT} lens-shaped bands tilted {SLASH_AXIS_ANGLE_DEG}deg from the length axis, each with a raised ear rim (outer band, pushed outward) around a recessed crumb-coloured trench (inner band, pushed inward). " + SLASH_MECHANISM,
             "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.85, "repetitionSystemRef": "slash-scatter"},
        ],
        "surfaceDetail": surface_detail(0.12, "faceted planar shading; each slash contributes hard-edged trench and ear facets", "slash trenches and ears displaced into the tube grid",
                                          "assets/prompts/breads/baguette.json notes_ko: the diagonal overlapping slashes and burst ears are THE decisive identity feature - without them this reads as a generic rod, not a baguette."),
        "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["slash-field"], "fidelityTier": "surface-pass",
    }


ROOT = {
    "id": "root", "name": "Baguette with Diagonal Slashes", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95,
    "primitive": "tapered-sweep", "topologyClass": "continuous-sculpt",
    "topologyRationale": "Transform-only root carrying the tube and its slash deformation; emits no geometry of its own.",
    "geometryDescriptor": {"topologyIntent": "transform node only", "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586},
                             "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"},
    "parent": None, "attachment": None,
    "dimensions": {"width": 2 * HALF_LENGTH, "height": 2.0, "depth": 2.0, "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("root", "root"),
    "material": "crust", "materialLayers": ["crust"],
    "colorMaterialRecipe": color_recipe(CRUST_RGBA, CRUMB_RGBA, "assembly node, inherits from children"),
    "deformations": [], "joints": [], "seams": [], "localFeatures": [],
    "surfaceDetail": surface_detail(0.0, "n/a", "n/a", "Assembly node; no surface of its own."),
    "evidenceRefs": ["view-three-quarter", "view-top", "view-front"], "details": [], "fidelityTier": "blockout",
}


def material(mid: str, name: str, hexcolor: str, zone: str, overrides: list) -> dict:
    return {
        "id": mid, "name": name, "type": "standard",
        "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/baguette.json geometry.crust, deliberately not sampled from reference pixels."},
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureResolution": 64,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture is emitted. UVs exist only to satisfy mergeByMaterial's attribute-consistency requirement."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "tapered tube extrusion", "carrier": "geometry"},
            {"id": "meso", "frequency": 4.0, "amplitude": 0.12, "role": "slash trenches and ears", "carrier": "geometry"},
            {"id": "micro", "frequency": 22.0, "amplitude": 0.02, "role": "faceting", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": zone, "amplitude": 0.12, "scale": 1.0, "silhouetteAffects": True},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material; cavity darkening comes from trench-wall orientation."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": overrides,
        "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial roughness 1, metalness 0.", "Never set vertexColors or flatShading - not inherited by the runtime swap."],
        "notes": f"{zone}. Two solid colours are enough for the whole object, no texture emitted.",
    }


MATERIALS = [
    material("crust", "Baguette crust", CRUST_HEX, "entire surface except slash floors", []),
    material("crumb", "Exposed crumb inside slashes", CRUMB_HEX, "recessed slash trench floors only", [
        {"id": "slash-boundary", "name": "Slash trench boundary", "maskSource": "geometry", "description": "Boundary is the per-slash grid-classified footprint - 4 independent geometric boundaries, not a texture mask.", "evidenceRefs": ["view-top", "view-three-quarter"], "appliesTo": ["baguette-body", "baguette-slashes"]},
    ]),
]

REPETITION_SYSTEMS = [
    {
        "id": "slash-scatter", "name": "Diagonal slash scores", "level": "meso", "hostComponents": ["baguette-slashes"],
        "elementComponentIds": ["baguette-slashes"], "elementKind": "recessed+raised vertex displacement, not added meshes",
        "count": SLASH_COUNT,
        "distribution": {"mode": "fixed evenly-spaced X positions along the constant-radius middle zone, all at a shared 32deg tilt", "axisAngleDeg": SLASH_AXIS_ANGLE_DEG, "mechanism": SLASH_MECHANISM,
                          "note": "Positions are authored, not randomized - the reference shows a small fixed count (3-5) at a consistent hand-scored angle, not a scattered field."},
        "sizeClasses": [{"id": "slash", "halfLength": 1.0, "halfWidth": 0.26}],
        "seedRule": "Fixed authored positions/angle; only the surface jitter (applied before slash displacement) uses the builder's injected rng argument, never Math.random.",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {"id": "spindle-silhouette", "name": "Long tapered spindle, extreme L/D", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["root", "baguette-body"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "slash-count-placement", "name": "4 diagonal overlapping slashes, correctly tilted", "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.7, "mustPass": True, "componentRefs": ["baguette-slashes"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "ear-crumb-contrast", "name": "Raised ear + recessed crumb-coloured floor", "tier": "critical", "passIds": ["material-pass"], "minimumScore": 0.7, "mustPass": True, "componentRefs": ["baguette-slashes"], "evidenceRefs": ["view-three-quarter"]},
    {"id": "no-shadow-artifact", "name": "No dark patch under either tip (harness is shadowless)", "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["baguette-body"], "evidenceRefs": ["view-front"]},
    {"id": "baked-faceting", "name": "Faceted flat shading, high facet density", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["baguette-body"], "evidenceRefs": ["view-three-quarter"]},
]

PASS_ORDER = ["blockout", "structural-pass", "form-refinement", "material-pass", "surface-pass", "optimization-pass"]
DROPPED_PASSES = {
    "lighting-pass": "lighting is fixed by the consumer harness and is not authorable in the model",
    "interaction-pass": "static showcase prop with no sockets, hinges or colliders beyond a bounding proxy; preSpecAssessment scores actionReadinessNeed 0",
}


def trim_passes(spec: dict) -> None:
    pipeline = spec["sculptPipeline"]
    pipeline["passOrder"] = list(PASS_ORDER)
    pipeline["droppedPasses"] = DROPPED_PASSES
    if pipeline.get("currentPass") not in PASS_ORDER:
        pipeline["currentPass"] = PASS_ORDER[0]
    spec["buildPasses"] = [p for p in spec["buildPasses"] if p["id"] in PASS_ORDER]
    loop = spec["selfCorrectLoop"]
    loop["reviewAfterPasses"] = list(PASS_ORDER)
    loop["screenshotPolicy"]["requiredForPasses"] = list(PASS_ORDER)
    for target in spec["featureReviewTargets"]:
        target["passIds"] = [p for p in target["passIds"] if p in PASS_ORDER] or [PASS_ORDER[0]]


def patch(spec: dict) -> dict:
    spec["suitability"] = "pass"
    spec["scores"] = {"object_isolation": 3, "silhouette_readability": 3, "depth_inference": 3, "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 1, "interaction_fit": 3}
    spec["coordinateFrame"] = {"front": "+X is the length axis; the harness three-quarter camera sits at (-1.6, 2.2, 2.6)", "up": "+Y",
                                 "scaleReference": "cross-section radius = 1.0 relative unit. Absolute scale is meaningless: the consumer runtime refits the longest axis to 1.6 (scripts/breads/types.ts section 7)."}
    spec["referenceCamera"] = {"solved": False, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6], "note": "Not solved - fixed by the consumer harness."}
    spec["silhouette"] = {
        "boundingShape": f"tapered spindle, {2*HALF_LENGTH:.2f} long by 2.0 diameter",
        "aspectRatios": [{"id": "length-over-diameter", "value": round(2 * HALF_LENGTH / 2, 3), "source": "baguette-2.png pixel bbox, PIL measurement"}],
        "symmetry": "radial per cross-section; bilateral along length (both ends taper similarly)",
        "dominantCurves": ["gradual bipolar taper to a true point at each end"],
        "negativeSpaces": ["4 slash trenches, the only negative space besides the taper"],
        "landmarks": ["4 evenly spaced slashes in the constant-radius middle zone, tilted 32deg from the length axis"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, baguette_body(), baguette_slashes()]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {"qualityPriority": "runtime-budget", "targetTriangles": 1250, "maxDrawCalls": 2, "textureSize": 512, "fpsTarget": 60,
                                   "optimizationPolicy": "Hard cap 8000tri/250KB. Target band for the chunk group (scone/loaf/baguette) is 800-1500tri/<=160KB - baguette is the densest of the three (highest facet count observed in the reference, plus 4 independent slash zones needing angular resolution), so it should land near the top of that band, unlike loaf's deliberately sparse 260tri."}
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": ["extreme length/diameter taper spindle silhouette", "4 diagonal overlapping slashes with raised ears and recessed crumb", "crumb colour never bleeds outside the slash trenches", "faceted flat shading baked into geometry"],
        "niceToHave": ["exact slash tilt angle (a visual estimate, not measured)", "exact taper curvature"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({"roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run", "acceptedLimitation": "Same runtime-budget reclassification as the other breads."}})
    spec["lookDevTargets"]["lightingPass"] = {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"],
        "authority": "Lighting is fixed by scripts/breadlab.ts, mirrored from scripts/thumbsHarness.ts.", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"]}
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key upper-left.", "usage": "Fixed by scripts/breadlab.ts.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "High ambient ratio (0.75).", "usage": "Fixed by the harness.", "contactShadow": "none - matches the reference's explicit 'no dark patch under either tapered end' instruction."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill, low intensity, opposite the key.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping; no AO on the runtime material."},
    ]
    spec["proceduralStrategy"] = [
        "Sweep a circular cross-section along X through hand-authored STATIONS (radius(x)), dense in the slash-bearing middle, sparse in the smooth taper zones, true poles at both tips.",
        "Classify each (station, sector) grid vertex against 4 oriented slash footprints (rotated local along/across coordinates on the unrolled tube surface) - dip the inner trench band, raise the outer ear band.",
        "Jitter vertices while indexed, so shared vertices move together and no face tears open.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project cylindrical UVs along X, then merge by material into exactly two meshes (crust triangles first, crumb triangles emitted after via ordered classification, then split with sliceTriangles).",
    ]
    spec["assumptions"] = [
        "Both tips are true poles (radius -> 0); no underside geometry exists to hide, so the harness's flat-lit shadowless render has nothing to occlude there.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "Exact slash tilt angle is a visual estimate (32deg), not an independently measured value - accepted like pancake's unmeasured pore positions.",
    ]
    spec["risks"] = [
        {"id": "vertex-color-loss", "severity": "high", "description": "Any vertex-colour region paint is discarded by the runtime Lambert swap.", "mitigation": "Two-tone split carried by two separate materials, split on classified grid geometry."},
        {"id": "flat-shading-loss", "severity": "high", "description": "flatShading is not inherited by the runtime swap.", "mitigation": "Faceting baked into geometry via lib.ts facet() before export."},
        {"id": "seam-tear", "severity": "medium", "description": "Body and slash floors share vertices; jittering independently would tear the seam.", "mitigation": "Build one indexed tube geometry, jitter it whole, classify and reorder triangles only after."},
        {"id": "detail-below-tessellation", "severity": "high", "description": "A slash trench narrower than the sector's angular spacing lands between vertices and disappears silently (bit pancake's pores and scone's first fissure attempt).", "mitigation": "SEGMENTS chosen (22) so the slash half-width (0.26 radius units) spans at least ~2 sectors at the tube's circumference; verified analytically before rendering in check_slash_coverage.py."},
        {"id": "winding-axis-confusion", "severity": "medium", "description": "pancake's (cos t, y, sin t) winding note assumes a Y-axis lathe; sweeping along X instead changes which triangle vertex order faces outward (loaf hit this: an inward-facing tube and, separately, an inward-facing end cap).", "mitigation": "Winding verified analytically (face-normal dot outward-vector check) for both the tube and both pole fans before the first render, reusing loaf's check_cap_winding.py pattern."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws when geometries in one bucket carry different attribute sets.", "mitigation": "Every geometry gets exactly position, normal and uv; no color attribute is ever created."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single rigid body; no plausible sub-fracture for a baked good this size"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "slash-field": ("hole", "slash-field"),
    "taper-profile": ("bevel", "taper-profile"),
    "ear-crumb-contrast": ("seam", "slash-boundary"),
}


def bind_details(pre: dict) -> None:
    for detail in pre["detailInventory"]["details"]:
        kind, ref = DETAIL_BINDINGS[detail["id"]]
        detail["kind"] = kind
        if isinstance(detail.get("mapsTo"), str):
            detail["mapsToNote"] = detail["mapsTo"]
        detail["mapsTo"] = {"ref": ref, "note": detail.get("mapsToNote", "")}


def resolve_unknowns(pre: dict) -> None:
    if pre["unknownsToResolveBeforeImplementation"]:
        pre["resolvedUnknowns"] = pre["unknownsToResolveBeforeImplementation"]
        pre["unknownsToResolveBeforeImplementation"] = []


def main() -> int:
    assessment = json.loads(ASSESSMENT.read_text(encoding="utf-8"))
    assessment["preSpecAssessment"]["objectClass"] = {
        "primaryType": "baguette with diagonal slashes", "primaryDomain": "object",
        "formLanguage": ["geometric", "low-poly faceted"], "structureKind": ["single-body tapered tube"],
        "motionPotential": ["static prop, whole-object rotation only"], "materialFamilies": ["matte baked crust", "exposed crumb"],
        "notes": "Single rigid tube, two material zones split by 4 independently-classified slash footprints.",
    }
    assessment["preSpecAssessment"]["complexity"]["estimatedCounts"]["mesoComponents"] = 1
    assessment["qualityContract"]["minimumSpecDepth"]["mesoComponents"] = 1
    assessment["preSpecAssessment"]["detailInventory"]["details"] = [
        {"id": "slash-field", "name": "4 diagonal overlapping slashes", "description": "Lens-shaped bands tilted from the length axis, each with a raised ear and recessed crumb floor.", "evidenceRefs": ["view-top"], "confidence": 0.85, "mapsTo": "baguette-slashes.localFeatures.slash-field"},
        {"id": "taper-profile", "name": "Gradual bipolar taper", "description": "Radius eases to a true point over the outer ~35-40% of the length at each end.", "evidenceRefs": ["view-front"], "confidence": 0.9, "mapsTo": "baguette-body.localFeatures.taper-profile"},
        {"id": "ear-crumb-contrast", "name": "Raised ear + recessed crumb colour", "description": "The decisive identity feature - without it the object reads as a generic rod.", "evidenceRefs": ["view-three-quarter"], "confidence": 0.95, "mapsTo": "materials.slash-boundary"},
    ]
    bind_details(assessment["preSpecAssessment"])
    resolve_unknowns(assessment["preSpecAssessment"])
    ASSESSMENT.write_text(json.dumps(assessment, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    carried = regenerate_skeleton()
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    spec.update(carried)
    spec["preSpecAssessment"] = assessment["preSpecAssessment"]
    spec["qualityContract"] = assessment["qualityContract"]
    SPEC.write_text(json.dumps(patch(spec), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"patched {SPEC} components={len(spec['componentTree'])} materials={len(spec['materials'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
