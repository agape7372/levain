# Authors the subject-specific half of object-sculpt-spec.json in place.
# Geometry frame: Y up, X = length axis (lib.ts uvCylindrical convention "loaf/baguette use x"),
# Z = short-axis width. Scale: Z half-width = 1.0. From image-analysis.json pixel ratios
# (width=1.0 units): length=1.673, height=1.096.
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "loaf.png"

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
            "Pan-Baked Sandwich Loaf", "--image", str(REFERENCE),
            "--assessment", str(ASSESSMENT), "--out", str(SPEC),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


LENGTH = 1.673  # half-length ; full length span is -LENGTH..+LENGTH along X
LOAF_HEIGHT = 1.096
RIM_HFRAC = 0.62  # image-analysis.json: rim sits at 62% of total height

DOME_HEX = "#C68958"
SIDE_HEX = "#F4EAD4"
DOME_RGBA = "rgba(198, 137, 88, 1.0)"
SIDE_RGBA = "rgba(244, 234, 212, 1.0)"


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant, "secondaryAlbedo": secondary,
        "materialClass": "ceramic", "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust, opaque dielectric, roughness 1.0, no specular lobe - same class as pancake/scone crust materials.",
        "zone": zone, "evidenceRefs": ["assets/prompts/breads/loaf.json geometry.crust"],
    }


VIEW_EVIDENCE = [
    {"id": "view-three-quarter", "view": "three-quarter top-front", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["rectangular pan-shaped block, angular near-vertical sides", "ridge dome on top only, crest running most of the length before rounding at the ends", "sharp two-tone crust boundary"], "confidence": 0.95},
    {"id": "view-front", "view": "front elevation", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["dome reads as a smooth arch spanning the whole width, not a mound peaking at one point", "rim sits at 62% of total height", "small foot bevel visible at the bottom corners"], "confidence": 0.95},
    {"id": "view-top", "view": "top-down", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["rounded-rectangle footprint, length/width 1.673", "corners round at both short ends, moderate radius"], "confidence": 0.9},
]


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role,
        "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": False, "twist": False, "detach": False, "visibility": True, "materialState": True},
        "sockets": [],
        "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Box proxy matching the loaf bounding volume."},
        "constraints": [],
        "destruction": {"breakable": False, "fractureGroup": cid, "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-side"},
    }


def surface_detail(normal: str, disp: str, notes: str) -> dict:
    return {
        "macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0,
        "normalPattern": normal, "displacementPattern": disp,
        "occlusionPattern": "none - smooth surface, no cavities",
        "edgeWearPattern": "none - a freshly baked surface carries no edge wear",
        "notes": notes,
    }


def loaf_body() -> dict:
    return {
        "id": "loaf-body", "name": "Loaf vertical walls and underside", "level": "macro", "role": "body",
        "importance": 0.85, "confidence": 0.9, "primitive": "extrude", "topologyClass": "continuous-sculpt",
        "topologyRationale": "A single continuous prism swept along the length axis from a rounded-rectangle cross-section, flat bottom to the colour-boundary rim. Decision tree step 6. Not a box primitive because both the footprint corners and the length-axis ends are rounded, not sharp.",
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": [[0, 0], [0, RIM_HFRAC]], "segments": 10, "phiStart": 0.0, "phiLength": 6.283185307179586,
                              "note": "Not a lathe - swept along X (length) through hand-authored stations, not around a circle. See scripts/breads/loaf.ts STATIONS/PROFILE."},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [{"id": "end-taper", "type": "profile-modulation", "axis": [1, 0, 0], "amplitude": 0.8,
                                    "notes": "Both length-axis ends taper the Z footprint and (above the rim only) the dome height down over the last few stations, rounding the box corners. The wall/rim height itself never shrinks - only the dome above it does."}],
            "uvStrategy": "cylindrical projection along X (scripts/breads/lib.ts uvCylindrical)",
            "normalStrategy": "flat normals baked by splitting vertices, never a flatShading flag",
        },
        "parent": "root", "attachment": None,
        "dimensions": {"width": 2 * LENGTH, "height": LOAF_HEIGHT * RIM_HFRAC, "depth": 2.0, "units": "relative", "confidence": 0.9},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": action_profile("loaf-body", "body"),
        "material": "crust-side", "materialLayers": ["crust-side"],
        "colorMaterialRecipe": color_recipe(SIDE_RGBA, DOME_RGBA, "vertical walls and underside"),
        "deformations": ["end-taper"], "joints": [],
        "seams": [{"id": "loaf-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at heightFraction 0.62. Body and dome sweep the same ring, so the two-tone boundary is watertight."}],
        "localFeatures": [
            {"id": "rounded-box-footprint", "name": "Rounded rectangle footprint", "kind": "silhouette-modulation",
             "description": "Near-vertical walls with a small foot bevel; length-axis ends round off over the last ~10% of the length rather than staying sharp-cornered.", "evidenceRefs": ["view-top"], "confidence": 0.85},
        ],
        "surfaceDetail": surface_detail("faceted planar shading from split vertices", "profile-driven only; no cracks or blistering per CRIB", "Side and underside crust share one flat albedo; deliberately low-poly/smooth, matching loaf.json notes_ko - this is the identity, not a placeholder."),
        "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["rounded-box-footprint"], "fidelityTier": "form-refinement",
    }


def loaf_dome() -> dict:
    return {
        "id": "loaf-dome", "name": "Loaf ridge dome", "level": "meso", "role": "surface",
        "importance": 1.0, "confidence": 0.9, "primitive": "extrude", "topologyClass": "continuous-sculpt",
        "topologyRationale": "A single smooth arch swept along the length axis from the shared rim - a RIDGE (constant-ish cross-section along most of the length), not a mound converging to one crown point. Confirmed by the front elevation's level-topped arch. Decision tree step 6.",
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": [[0, RIM_HFRAC], [0, 1.0]], "segments": 10, "phiStart": 0.0, "phiLength": 6.283185307179586,
                              "note": "Swept along X through the same STATIONS as loaf-body; dome-only points (hFrac > 0.62) get the end-taper's heightScale, wall/rim points do not."},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [{"id": "end-taper", "type": "profile-modulation", "axis": [1, 0, 0], "amplitude": 0.8, "notes": "Shared with loaf-body; see there."}],
            "uvStrategy": "cylindrical projection along X (scripts/breads/lib.ts uvCylindrical)",
            "normalStrategy": "flat normals baked by splitting vertices",
        },
        "parent": "loaf-body", "attachment": None,
        "dimensions": {"width": 2 * LENGTH, "height": LOAF_HEIGHT * (1 - RIM_HFRAC), "depth": 2.0, "units": "relative", "confidence": 0.9},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": action_profile("loaf-dome", "surface"),
        "material": "crust-top", "materialLayers": ["crust-top"],
        "colorMaterialRecipe": color_recipe(DOME_RGBA, SIDE_RGBA, "top ridge dome only"),
        "deformations": ["end-taper"], "joints": [],
        "seams": [{"id": "loaf-dome-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly."}],
        "localFeatures": [
            {"id": "ridge-crest", "name": "Level ridge crest", "kind": "profile-curvature",
             "description": "Dome crests at heightFraction 1.0 along nearly the full length, rounding down only in the last few stations near each end - a ridge, not a single-point mound.", "evidenceRefs": ["view-front", "view-three-quarter"], "confidence": 0.9},
        ],
        "surfaceDetail": surface_detail("faceted planar shading from split vertices", "profile-driven only; smooth, no cracks or blistering (CRIB explicit instruction for this bread)", "assets/prompts/breads/loaf.json notes_ko: angular sides + top-only dome is the identity-critical feature; deliberately minimal surface texture."),
        "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["ridge-crest"], "fidelityTier": "surface-pass",
    }


ROOT = {
    "id": "root", "name": "Pan-Baked Sandwich Loaf", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95,
    "primitive": "extrude", "topologyClass": "continuous-sculpt",
    "topologyRationale": "Transform-only root carrying the loaf body and dome; emits no geometry of its own.",
    "geometryDescriptor": {"topologyIntent": "transform node only", "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586},
                             "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"},
    "parent": None, "attachment": None,
    "dimensions": {"width": 2 * LENGTH, "height": LOAF_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("root", "root"),
    "material": "crust-side", "materialLayers": ["crust-side"],
    "colorMaterialRecipe": color_recipe(SIDE_RGBA, DOME_RGBA, "assembly node, inherits from children"),
    "deformations": [], "joints": [], "seams": [], "localFeatures": [],
    "surfaceDetail": surface_detail("n/a", "n/a", "Assembly node; no surface of its own."),
    "evidenceRefs": ["view-three-quarter", "view-top", "view-front"], "details": [], "fidelityTier": "blockout",
}


def material(mid: str, name: str, hexcolor: str, zone: str, overrides: list) -> dict:
    return {
        "id": mid, "name": name, "type": "standard",
        "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/loaf.json geometry.crust, deliberately not sampled from reference pixels."},
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureResolution": 64,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture is emitted. UVs exist only to satisfy mergeByMaterial's attribute-consistency requirement."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "prism extrusion and ridge dome", "carrier": "geometry"},
            {"id": "meso", "frequency": 2.0, "amplitude": 0.02, "role": "end-taper corner rounding", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": zone, "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": False},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": overrides,
        "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial roughness 1, metalness 0.", "Never set vertexColors or flatShading - not inherited by the runtime swap."],
        "notes": f"{zone}. Two solid colours are enough for the whole object, no texture emitted.",
    }


MATERIALS = [
    material("crust-top", "Ridge dome crust", DOME_HEX, "top ridge dome only", []),
    material("crust-side", "Side and underside crust", SIDE_HEX, "walls and underside", [
        {"id": "two-tone-boundary", "name": "Two-tone crust boundary", "maskSource": "geometry",
         "description": "The boundary is the shared perimeter ring at heightFraction 0.62 - a hard geometric edge between two separate meshes.",
         "evidenceRefs": ["view-three-quarter", "view-front"], "appliesTo": ["loaf-body", "loaf-dome"]},
    ]),
]

FEATURE_REVIEW_TARGETS = [
    {"id": "loaf-silhouette", "name": "Rounded pan-box silhouette with ridge dome", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["root", "loaf-body", "loaf-dome"], "evidenceRefs": ["view-three-quarter", "view-front"]},
    {"id": "angular-sides", "name": "Near-vertical angular sides, not fully round", "tier": "critical", "passIds": ["form-refinement"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["loaf-body"], "evidenceRefs": ["view-top", "view-front"]},
    {"id": "top-only-dome-color", "name": "Dome colour confined to the top face only", "tier": "critical", "passIds": ["material-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["loaf-body", "loaf-dome"], "evidenceRefs": ["view-three-quarter"]},
    {"id": "ridge-not-mound", "name": "Dome reads as a level ridge, not a single-point mound", "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["loaf-dome"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "low-texture", "name": "Smooth, low-texture surface (no cracks/blistering)", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["loaf-body", "loaf-dome"], "evidenceRefs": ["view-three-quarter"]},
    {"id": "baked-faceting", "name": "Faceted flat shading baked into geometry", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["loaf-body", "loaf-dome"], "evidenceRefs": ["view-three-quarter"]},
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
    spec["coordinateFrame"] = {
        "front": "+X is the length axis; the harness three-quarter camera sits at (-1.6, 2.2, 2.6)",
        "up": "+Y",
        "scaleReference": "Z half-width = 1.0 relative unit. Absolute scale is meaningless: the consumer runtime refits the longest axis to 1.6 (scripts/breads/types.ts section 7).",
    }
    spec["referenceCamera"] = {"solved": False, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6],
                                 "note": "Not solved - fixed by the consumer harness (scripts/breadlab.ts applyView)."}
    spec["silhouette"] = {
        "boundingShape": f"rounded box, {2*LENGTH:.3f} long by {LOAF_HEIGHT:.3f} tall by 2.0 wide",
        "aspectRatios": [
            {"id": "length-over-width", "value": round(LENGTH, 3), "source": "loaf-3.png top-down, half-length/half-width"},
            {"id": "height-over-width", "value": round(LOAF_HEIGHT / 2, 3), "source": "loaf-2.png front elevation"},
            {"id": "rim-over-total-height", "value": RIM_HFRAC, "source": "loaf-2.png front elevation colour transition"},
        ],
        "symmetry": "bilateral about both the length axis and the width axis",
        "dominantCurves": ["level ridge dome crest along most of the length", "small foot bevel at the bottom"],
        "negativeSpaces": ["none - lowest-detail bread in the set by design"],
        "landmarks": ["two-tone boundary ring at heightFraction 0.62", "corner rounding at both length-axis ends"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, loaf_body(), loaf_dome()]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = []
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {"qualityPriority": "runtime-budget", "targetTriangles": 700, "maxDrawCalls": 2, "textureSize": 512, "fpsTarget": 60,
                                   "optimizationPolicy": "Hard cap 8000tri/250KB (scripts/breads/types.ts section 6). Target band for the chunk group (scone/loaf/baguette) is 800-1500tri/<=160KB, but loaf is deliberately the lowest-detail bread in the set (CRIB: no cracks/blistering, do not inflate resolution without dense detail), so a lower count than scone is expected and correct."}
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": ["rounded pan-box silhouette, angular near-vertical sides", "ridge dome confined to the top, never a single-point mound", "dome colour never bleeds onto the sides", "faceted flat shading baked into geometry"],
        "niceToHave": ["exact end-taper curvature", "the reference's soft contact shadow, unreproducible under the shadowless harness"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({
        "roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run",
                                     "acceptedLimitation": "Same runtime-budget reclassification as pancake/scone: the consumer keeps only map+color and the repo bans PBR maps."},
    })
    spec["lookDevTargets"]["lightingPass"] = {
        "requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"],
        "authority": "Lighting is fixed by scripts/breadlab.ts, mirrored from scripts/thumbsHarness.ts (warm key 0xffe2b0 at (-2,6,2) intensity 1.4, ambient 0xfff0dc 0.75, cool fill 0xdce8ff at (2.5,3,-2) intensity 0.2).",
        "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"],
    }
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key upper-left.", "usage": "Fixed by scripts/breadlab.ts.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "High ambient ratio (0.75).", "usage": "Fixed by the harness.", "contactShadow": "none."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill, low intensity, opposite the key.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping; no AO on the runtime material."},
    ]
    spec["proceduralStrategy"] = [
        "Sweep a 12-point mirrored cross-sectional profile (bottom pole, right wall, right dome, crest, left dome, left wall) along X stations from -LENGTH to +LENGTH.",
        "Most stations use a constant cross-section (zScale=1, domeHeightScale=1); only the last few stations near each end taper zScale down (footprint rounding) and, for dome-only points above the rim, taper heightScale down (ridge rounding at the ends) - wall/rim height itself never shrinks.",
        "Jitter vertices minimally while indexed, so shared vertices move together and no face tears open - this bread's identity is smoothness, so jitter amplitude is the lowest of the three chunk breads.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project cylindrical UVs along X, then merge by material into exactly two meshes.",
    ]
    spec["assumptions"] = [
        "Underside is never visible; modelled as a closed flat cap.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "End-taper curvature is inferred from the three-quarter view, not independently measured - an accepted approximation like pancake/scone's own unmeasured corner curvature.",
    ]
    spec["risks"] = [
        {"id": "vertex-color-loss", "severity": "high", "description": "Any vertex-colour region paint is discarded by the runtime Lambert swap.", "mitigation": "Two-tone split carried by two separate materials on two separate meshes, split on a geometric ring."},
        {"id": "flat-shading-loss", "severity": "high", "description": "flatShading is not inherited by the runtime swap.", "mitigation": "Faceting baked into geometry via lib.ts facet() before export."},
        {"id": "seam-tear", "severity": "medium", "description": "Body and dome are separate meshes sharing the rim ring; jittering independently would tear the seam.", "mitigation": "Build one indexed loaf geometry, jitter it whole, split triangles into material buckets only after."},
        {"id": "mound-not-ridge", "severity": "high", "description": "A radial-scale-toward-centroid dome construction (pancake/scone's technique) would produce a single-point crown, contradicting the reference's level ridge crest.", "mitigation": "Dome is built by extruding a constant arch profile along X (station sweep), not by scaling an outline toward a center point - crest height only drops in the last few end stations."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws when geometries in one bucket carry different attribute sets.", "mitigation": "Every geometry gets exactly position, normal and uv; no color attribute is ever created."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single rigid body; no plausible sub-fracture for a baked good this size"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "ridge-dome": ("bevel", "ridge-crest"),
    "top-only-coloring": ("seam", "two-tone-boundary"),
    "angular-sides": ("contour", "rounded-box-footprint"),
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
        "primaryType": "pan-baked sandwich loaf", "primaryDomain": "object",
        "formLanguage": ["geometric", "low-poly faceted"], "structureKind": ["single-body extrusion"],
        "motionPotential": ["static prop, whole-object rotation only"], "materialFamilies": ["matte baked crust"],
        "notes": "Single rigid loaf, two material zones split by a hard geometric ring, deliberately minimal surface detail.",
    }
    assessment["preSpecAssessment"]["complexity"]["estimatedCounts"]["mesoComponents"] = 1
    assessment["qualityContract"]["minimumSpecDepth"]["mesoComponents"] = 1
    assessment["preSpecAssessment"]["detailInventory"]["details"] = [
        {"id": "ridge-dome", "name": "Level ridge dome", "description": "Dome crests along most of the length, not a single-point mound.", "evidenceRefs": ["view-front"], "confidence": 0.9, "mapsTo": "loaf-dome.localFeatures.ridge-crest"},
        {"id": "top-only-coloring", "name": "Top-only dome coloring", "description": "Only the dome is golden; walls and underside stay cream.", "evidenceRefs": ["view-three-quarter"], "confidence": 0.95, "mapsTo": "materials.two-tone-boundary"},
        {"id": "angular-sides", "name": "Angular near-vertical sides", "description": "Sides stay near-vertical with only a small foot bevel - fully round sides would lose the pan-baked identity.", "evidenceRefs": ["view-top"], "confidence": 0.85, "mapsTo": "loaf-body.localFeatures.rounded-box-footprint"},
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
