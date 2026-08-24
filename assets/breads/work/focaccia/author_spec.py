# Authors the subject-specific half of object-sculpt-spec.json in place.
# Pattern lifted from assets/breads/work/cracker/author_spec.py (box+grid slab precedent).
#
# Geometry frame: Y up, +Z forward, half-width(X) 1.0 = rectangular slab half-width, all relative.
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "focaccia.png"

PIPELINE_OWNED = ("reviewHistory", "visualEvidence", "sculptPipeline")


def regenerate_skeleton() -> dict:
    carried: dict = {}
    if SPEC.exists():
        old = json.loads(SPEC.read_text(encoding="utf-8"))
        carried = {k: old[k] for k in PIPELINE_OWNED if old.get(k)}
    SPEC.unlink(missing_ok=True)
    subprocess.run(
        [sys.executable, str(SKILL / "forge" / "stage2_spec" / "new_sculpt_spec.py"),
         "Focaccia", "--image", str(REFERENCE), "--assessment", str(ASSESSMENT), "--out", str(SPEC)],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


HALF_X = 1.0
HALF_Z = 0.65  # rectangular, not square - unlike cracker
THICK = 0.28   # "low uniform height" - thicker relative proportion than cracker's thin wafer
NX = 14        # grid subdivisions along X
NZ = 10        # grid subdivisions along Z

DIMPLE_COUNT = 20  # ~5x4 grid feel, matches reference density
DIMPLE_DEPTH = 0.05
TOP_HEX = "#D9A552"
OIL_HEX = "#B8813C"

TOPPING_COUNT = 22  # olive + rosemary + salt combined, geometry-only (shares crust material)
TOPPING_BUMP = 0.03


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant, "secondaryAlbedo": secondary, "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust, roughness 1.0, no specular - same class as pancake/cracker/flatbread precedent.",
        "zone": zone, "evidenceRefs": ["assets/prompts/breads/focaccia.json geometry.crust"],
    }


VIEW_EVIDENCE = [
    {"id": "view-three-quarter", "view": "three-quarter top-front", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["thin rectangular slab, mildly rounded corners", "evenly gridded finger-dimples with a visibly darker oil-pool interior", "raised dark olive bumps, thin rosemary sprigs, tiny salt specks scattered across the top"], "confidence": 0.95},
    {"id": "view-front", "view": "front elevation", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["low flat profile, dimples read as shallow ripples along the top edge line"], "confidence": 0.9},
    {"id": "view-top", "view": "top-down", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["dimple grid covers nearly the whole top face, evenly spaced", "olives/rosemary/salt scattered with no obvious pattern, avoiding dimple centers"], "confidence": 0.9},
]


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role, "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": False, "twist": False, "detach": False, "visibility": True, "materialState": True},
        "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Flat box proxy matching the slab bounding volume."},
        "constraints": [], "destruction": {"breakable": False, "fractureGroup": cid, "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-top"},
    }


def surface_detail(bump: float, notes: str) -> dict:
    return {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump, "normalPattern": "faceted planar shading from split vertices",
            "displacementPattern": "grid-cell vertex displacement (dimples recessed, toppings raised)", "occlusionPattern": "cavity darkening inside each dimple pit",
            "edgeWearPattern": "none", "notes": notes}


SLAB = {
    "id": "slab", "name": "Focaccia rectangular slab", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9,
    "primitive": "box", "topologyClass": "assembled-solid",
    "topologyRationale": "Single rigid rectangular slab, box primitive is structurally correct for a flat extruded volume (cracker precedent). 'continuous-sculpt' is disallowed with primitive 'box' (validate_sculpt_spec.py DISALLOWED_TOPOLOGY_PRIMITIVE_PAIRS).",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, faceted after generation",
        "gridProfile": {"note": "Cartesian NX x NZ grid slab, not a lathe.", "segmentsX": NX, "segmentsZ": NZ, "halfX": HALF_X, "halfZ": HALF_Z, "thickness": THICK},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [{"id": "corner-round", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.03, "notes": "Mild corner rounding + edge noise on the perimeter loop only, same mechanism as cracker's hand-cut edge wobble."}],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement",
    },
    "parent": None, "attachment": None,
    "dimensions": {"width": round(2 * HALF_X, 4), "height": THICK, "depth": round(2 * HALF_Z, 4), "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("slab", "root"), "material": "crust-top", "materialLayers": ["crust-top"],
    "colorMaterialRecipe": color_recipe("rgba(217, 165, 82, 1.0)", "rgba(217, 165, 82, 1.0)", "whole slab except dimple interiors"),
    "deformations": ["corner-round"], "joints": [], "seams": [],
    "localFeatures": [{"id": "slab-corner-round", "name": "Mildly rounded corner edge", "kind": "contour", "description": "Perimeter loop gets mild corner rounding + noise.", "evidenceRefs": ["view-top"], "confidence": 0.8}],
    "surfaceDetail": surface_detail(0.0, "Base slab; identity-critical relief lives on the top-face child component."),
    "evidenceRefs": ["view-three-quarter", "view-front"], "details": ["slab-corner-round"], "fidelityTier": "blockout",
}

TOP_FACE = {
    "id": "slab-top-face", "name": "Focaccia top face (dimples + toppings)", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9,
    "primitive": "box", "topologyClass": "assembled-solid",
    "topologyRationale": "Same rigid grid volume as the parent; carries the top face's identity-critical local features separately from the parent's edge feature, mirroring cracker's wafer/wafer-top-face split.",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, faceted after generation",
        "gridProfile": {"note": "Same NX x NZ grid as the parent's top ring; dimples/toppings are grid-cell displacements, zero added triangles.", "segmentsX": NX, "segmentsZ": NZ},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "dimple-grid", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": DIMPLE_DEPTH, "notes": f"{DIMPLE_COUNT} finger-dimple pits distributed nearly evenly across the top face, single-vertex dip per cell with the touching quads carrying the oil material."},
            {"id": "topping-scatter", "type": "vertex-displacement", "axis": [0, 1, 0], "amplitude": TOPPING_BUMP, "notes": f"{TOPPING_COUNT} raised bumps (olive/rosemary/salt combined) on the crust material only - the 2-material budget is spent on the oil-pool split, so toppings carry no separate color, only silhouette."},
        ],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "flat normals baked by splitting vertices after displacement",
    },
    "parent": "slab", "attachment": None,
    "dimensions": {"width": round(2 * HALF_X * 0.95, 4), "height": round(DIMPLE_DEPTH, 4), "depth": round(2 * HALF_Z * 0.95, 4), "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("slab-top-face", "surface"), "material": "crust-top", "materialLayers": ["crust-top", "oil-pool"],
    "colorMaterialRecipe": color_recipe("rgba(217, 165, 82, 1.0)", "rgba(184, 129, 60, 1.0)", "top face base + dimple oil-pool zones"),
    "deformations": ["dimple-grid", "topping-scatter"], "joints": [],
    "seams": [{"id": "slab-top-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent's perimeter ring exactly."}],
    "localFeatures": [
        {"id": "slab-top-face-dimples", "name": "Finger-dimple grid", "kind": "hole", "description": f"{DIMPLE_COUNT} evenly distributed shallow pits with a darker oil-pool interior tone, the single most identity-defining trait.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.95, "repetitionSystemRef": "dimple-grid"},
        {"id": "slab-top-face-toppings", "name": "Topping scatter (olive/rosemary/salt)", "kind": "ridge", "description": "Raised bumps for olive/rosemary/salt, geometry-only (no separate color budget).", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.8, "repetitionSystemRef": "topping-scatter"},
    ],
    "surfaceDetail": surface_detail(DIMPLE_DEPTH, "assets/prompts/breads/focaccia.json notes_ko: dimples + oil pool are what makes it focaccia rather than a plain flat slab."),
    "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["slab-top-face-dimples", "slab-top-face-toppings"], "fidelityTier": "surface-pass",
}


def material(mid: str, name: str, hexcolor: str, zone: str) -> dict:
    return {
        "id": mid, "name": name, "type": "standard", "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/focaccia.json geometry.crust."},
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureResolution": 64,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture emitted; UVs only satisfy mergeByMaterial's attribute-consistency requirement."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "flat rectangular slab silhouette", "carrier": "geometry"},
            {"id": "meso", "frequency": 4.0, "amplitude": 0.03, "role": "corner rounding", "carrier": "geometry"},
            {"id": "micro", "frequency": 20.0, "amplitude": 0.05, "role": "dimple grid + topping bumps", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"},
        "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": zone, "amplitude": DIMPLE_DEPTH, "scale": 1.0, "silhouetteAffects": False},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": [{"id": "dimple-triangle-bucket", "name": "Oil-pool material triangle bucket", "maskSource": "geometry",
            "description": "Oil zone is a second material assigned to a contiguous triangle-index range after facet+jitter (cracker/flatbread precedent), not vertex colors or a texture.",
            "evidenceRefs": ["view-top"], "appliesTo": ["slab-top-face"]}] if mid == "oil-pool" else [],
        "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading."],
        "notes": f"{zone}. Two flat colors, no texture (scripts/breads/types.ts section 9). Toppings share crust-top - no third material slot available.",
    }


MATERIALS = [material("crust-top", "Focaccia base crust", TOP_HEX, "whole slab except dimple interiors"), material("oil-pool", "Focaccia dimple oil pool", OIL_HEX, "dimple interiors")]

REPETITION_SYSTEMS = [
    {"id": "dimple-grid", "name": "Finger-dimple grid", "level": "micro", "hostComponents": ["slab-top-face"], "elementComponentIds": ["slab-top-face"],
     "elementKind": "recessed vertex displacement, not an added mesh", "count": DIMPLE_COUNT, "countPerHost": {"slab-top-face": DIMPLE_COUNT},
     "distribution": {"mode": "near-regular grid with minimum separation, mirrors cracker's docking-hole-grid but with an oil-pool material split instead of a single crust color"},
     "sizeClasses": [{"id": "dimple", "depth": DIMPLE_DEPTH}], "seedRule": "Builder rng, deterministic positions.", "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "topping-scatter", "name": "Topping scatter (olive/rosemary/salt)", "level": "micro", "hostComponents": ["slab-top-face"], "elementComponentIds": ["slab-top-face"],
     "elementKind": "raised vertex displacement, not an added mesh, no separate material", "count": TOPPING_COUNT, "countPerHost": {"slab-top-face": TOPPING_COUNT},
     "distribution": {"mode": "seeded shuffle of face-grid cells not used by dimples, Chebyshev-distance rejection"},
     "sizeClasses": [{"id": "topping", "depth": TOPPING_BUMP}], "seedRule": "Builder rng only.", "evidenceRefs": ["view-top", "view-three-quarter"]},
]

FEATURE_REVIEW_TARGETS = [
    {"id": "thin-rect-slab-silhouette", "name": "Thin rectangular slab silhouette", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["slab"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "dimple-grid-review", "name": "Even dimple grid with oil-pool material split", "tier": "critical", "passIds": ["surface-pass", "material-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["slab-top-face"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "topping-scatter-review", "name": "Topping bump scatter", "tier": "important", "passIds": ["surface-pass"], "minimumScore": 0.6, "mustPass": False, "componentRefs": ["slab-top-face"], "evidenceRefs": ["view-top"]},
    {"id": "baked-faceting-focaccia", "name": "Faceted flat shading baked into geometry", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["slab", "slab-top-face"], "evidenceRefs": ["view-three-quarter"]},
]

PASS_ORDER = ["blockout", "structural-pass", "form-refinement", "material-pass", "surface-pass", "optimization-pass"]
DROPPED_PASSES = {"lighting-pass": "lighting fixed by the consumer harness", "interaction-pass": "static showcase prop; actionReadinessNeed 0"}


def trim_passes(spec: dict) -> None:
    pipeline = spec["sculptPipeline"]; pipeline["passOrder"] = list(PASS_ORDER); pipeline["droppedPasses"] = DROPPED_PASSES
    if pipeline.get("currentPass") not in PASS_ORDER: pipeline["currentPass"] = PASS_ORDER[0]
    spec["buildPasses"] = [p for p in spec["buildPasses"] if p["id"] in PASS_ORDER]
    loop = spec["selfCorrectLoop"]; loop["reviewAfterPasses"] = list(PASS_ORDER); loop["screenshotPolicy"]["requiredForPasses"] = list(PASS_ORDER)
    for target in spec["featureReviewTargets"]:
        target["passIds"] = [p for p in target["passIds"] if p in PASS_ORDER] or [PASS_ORDER[0]]


def patch(spec: dict) -> dict:
    spec["suitability"] = "pass"
    spec["scores"] = {"object_isolation": 3, "silhouette_readability": 3, "depth_inference": 3, "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 1, "interaction_fit": 3}
    spec["coordinateFrame"] = {"front": "+Z, harness three-quarter camera at (-1.6, 2.2, 2.6)", "up": "+Y", "scaleReference": "half-width(X) = 1.0 relative unit; runtime refits longest axis to 1.6."}
    spec["referenceCamera"] = {"solved": False, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6], "note": "Fixed by scripts/breadlab.ts."}
    spec["silhouette"] = {
        "boundingShape": f"thin rectangular slab, {2*HALF_X:.2f} x {2*HALF_Z:.2f} x {THICK:.2f}",
        "aspectRatios": [{"id": "thickness-over-width", "value": THICK / (2 * HALF_X), "source": "assets/prompts/breads/focaccia.json silhouette (low uniform height)"}],
        "symmetry": "rectangular, broken by mild corner rounding", "dominantCurves": ["flat top/bottom planes with shallow dimple pits"],
        "negativeSpaces": [f"{DIMPLE_COUNT} shallow dimple pits"], "landmarks": ["near-regular dimple grid", "scattered topping bumps"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [SLAB, TOP_FACE]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {"qualityPriority": "runtime-budget", "targetTriangles": 800, "maxDrawCalls": 2, "textureSize": 0, "fpsTarget": 60,
        "optimizationPolicy": ("Panel-group target band 500-1100 tri / <=120KB, reached by construction via a 14x10 grid slab.",)}
    spec["qualityTargets"] = {"targetFidelity": 0.8,
        "mustMatch": ["thin flat rectangular slab", "near-even dimple grid with a visibly darker oil-pool interior", "scattered topping bumps", "faceted flat shading"],
        "niceToHave": ["olive/rosemary/salt color distinction (sacrificed to the 2-material budget)", "reference's soft contact shadow"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"]}
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({"roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run",
            "acceptedLimitation": "Runtime keeps only map+color, PBR maps banned. All relief lives in geometry; oil-pool is a flat material zone."}})
    spec["lookDevTargets"]["lightingPass"] = {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Fixed by scripts/breadlab.ts.", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"]}
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key 0xffe2b0 at (-2, 6, 2), intensity 1.4, no exposure control, no tone mapping.", "usage": "Fixed by the harness.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "Ambient 0xfff0dc at 0.75.", "usage": "Fixed by the harness.", "contactShadow": "none - no shadow map or ground plane, so no contact shadow or ground shadow is rendered."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill 0xdce8ff at (2.5, 3, -2), intensity 0.2.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."},
    ]
    spec["proceduralStrategy"] = [
        "Build one indexed NX x NZ grid slab: top ring, perimeter side wall, coarse fan underside (cracker precedent).",
        "Apply corner-round wobble to perimeter-loop vertices only.",
        "Displace the dimple grid (recessed) into the top face, classifying touching triangles into the oil-pool bucket.",
        "Displace topping bumps (raised) into the top face, always base material (no third color slot).",
        "Jitter vertices while indexed, so shared vertices move together.",
        "Bake faceting by splitting vertices; project top-planar UVs; slice oil/base triangle ranges; merge by material into exactly two meshes.",
    ]
    spec["assumptions"] = ["Underside never visible above the horizon.", "Runtime normalizes longest axis to 1.6.", "Dimple/topping positions not identity-critical beyond grid pattern and rough density."]
    spec["risks"] = [
        {"id": "cell-density-collapse", "severity": "high", "description": "cracker's v1 lesson: too many displaced/marked cells with too little separation reads as continuous texture instead of discrete features.", "mitigation": "Dimple count kept at a density matching the reference's own grid (~20 over 140 cells, 14%), with an explicit minimum-separation rejection informed directly by the cracker and flatbread incidents."},
        {"id": "material-triangle-bucket-inflation", "severity": "medium", "description": "flatbread's v1/v2 lesson: a single marked cell taints up to 4 quads (8 triangles), so raw cell counts must be sized down accordingly, not 1:1 with the visual spot count wanted.", "mitigation": "Dimple count and oil-material coverage sized with this multiplier in mind, verified via a Node-side dry run before spending a browser render."},
        {"id": "flat-shading-loss", "severity": "high", "description": "flatShading flag not inherited by the runtime swap.", "mitigation": "Faceting baked via lib.ts facet()."},
        {"id": "seam-tear", "severity": "medium", "description": "Top grid, side wall, and underside fan are separate structural regions of one geometry.", "mitigation": "Shared indices at the perimeter ring, jittered once on the whole thing (cracker precedent)."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws on attribute-set mismatch.", "mitigation": "Every geometry gets position, normal, uv."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup; plausible break is a snap in half, not modelled here"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {"dimple-grid": ("hole", "slab-top-face-dimples"), "topping-scatter": ("ridge", "slab-top-face-toppings"), "corner-round": ("contour", "slab-corner-round")}


def bind_details(pre: dict) -> None:
    for detail in pre["detailInventory"]["details"]:
        kind, ref = DETAIL_BINDINGS[detail["id"]]; detail["kind"] = kind
        if isinstance(detail.get("mapsTo"), str): detail["mapsToNote"] = detail["mapsTo"]
        detail["mapsTo"] = {"ref": ref, "note": detail.get("mapsToNote", "")}


def resolve_unknowns(pre: dict) -> None:
    if pre["unknownsToResolveBeforeImplementation"]:
        pre["resolvedUnknowns"] = pre["unknownsToResolveBeforeImplementation"]; pre["unknownsToResolveBeforeImplementation"] = []


def fill_assessment(assessment: dict) -> None:
    pre = assessment["preSpecAssessment"]
    pre["objectClass"] = {"primaryType": "thin rectangular focaccia slab", "primaryDomain": "object", "formLanguage": ["geometric", "hand-crafted"], "structureKind": ["single rigid slab"], "motionPotential": ["static prop", "whole-object transform"], "materialFamilies": ["ceramic"], "notes": "Matte baked crust, same PBR class as pancake/cracker/flatbread. Two albedo zones (crust + oil-pool)."}
    pre["complexity"] = {"tier": "simple",
        "scores": {"silhouetteComplexity": 1, "componentCount": 1, "hierarchyDepth": 1, "repetitionDensity": 2, "materialLayerCount": 1, "localDetailDensity": 2, "occlusionRisk": 0, "actionReadinessNeed": 0},
        "estimatedCounts": {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 2, "materialLayers": 2, "repetitionSystems": 2},
        "reasoning": ["One rigid macro body, no repeated macro parts.", "Silhouette is a flat rectangular slab with only corner-round wobble interrupting it.", "Repetition density 2: dimple grid + topping scatter, both identity-critical.", "Two albedo zones (crust + oil) in one material family.", "Occlusion risk 0: only the flat, featureless underside is hidden.", "Action readiness 0: static showcase prop."]}
    pre["specDepthDecision"] = {"requiredDepth": "simple", "minimumComponentLevels": ["macro", "meso"], "needsRepetitionSystems": True, "needsMaterialLocalOverrides": True, "needsMultipleReviewViews": True, "needsActionReadyHierarchy": True, "rationale": "Simple tier but needs a meso top-face node so the two repetition systems attach to real geometry."}
    pre["detailInventory"] = {"scanMethod": "component-zones", "targetMinDetails": 3, "note": "Enumerated by hand (CRIB: skip detail-inventory for repeated-system objects).",
        "details": [
            {"id": "dimple-grid", "zone": "top face", "observation": f"~{DIMPLE_COUNT} evenly distributed shallow pits, each with a darker oil-pool interior.", "inference": "Finger-pressed dimples filled with olive oil during baking.", "mapsTo": {"ref": "slab-top-face-dimples", "note": "component slab-top-face localFeatures + repetitionSystem dimple-grid"}, "confidence": 0.95, "evidenceRef": "focaccia-3.png full frame"},
            {"id": "topping-scatter", "zone": "top face", "observation": "Raised olive/rosemary/salt bumps scattered across the top.", "inference": "Toppings pressed into the dough before baking.", "mapsTo": {"ref": "slab-top-face-toppings", "note": "component slab-top-face localFeatures + repetitionSystem topping-scatter"}, "confidence": 0.85, "evidenceRef": "focaccia-3.png full frame"},
            {"id": "corner-round", "zone": "perimeter", "observation": "Mildly rounded corners, not sharp right angles.", "inference": "Dough relaxing in the pan before baking.", "mapsTo": {"ref": "slab-corner-round", "note": "component slab localFeatures.corner-round"}, "confidence": 0.75, "evidenceRef": "focaccia-3.png outline"},
        ]}
    pre["unknownsToResolveBeforeImplementation"] = [
        "Underside fully occluded; modelled as a coarse flat fan, never visible above the horizon.",
        "Exact dimple/topping positions not identity-critical beyond the grid pattern and rough scatter density.",
        "Olive/rosemary/salt color cannot be preserved within the 2-material budget (types.ts section 1); resolved by sharing the crust material and relying on raised silhouette shape alone.",
    ]
    assessment["qualityContract"]["minimumSpecDepth"] = {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 2, "materialLayers": 2, "repetitionSystems": 2, "reviewViewpoints": 4}
    bind_details(pre); resolve_unknowns(pre)


def main() -> int:
    assessment = json.loads(ASSESSMENT.read_text(encoding="utf-8"))
    fill_assessment(assessment)
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
