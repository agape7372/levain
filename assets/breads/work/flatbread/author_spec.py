# Authors the subject-specific half of object-sculpt-spec.json in place.
# Pattern lifted from assets/breads/work/cracker/author_spec.py (itself from pancake).
#
# Geometry frame: Y up, +Z forward, radius 1.0 = disk long-axis radius. Single oval lathe disk
# (not a Cartesian grid like cracker - flatbread has no straight edges to preserve).
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "flatbread.png"

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
            "Flatbread", "--image", str(REFERENCE),
            "--assessment", str(ASSESSMENT), "--out", str(SPEC),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


# --- authored proportions (assets/prompts/breads/flatbread.json geometry) ----------------------
RADIUS = 1.0            # long-axis radius; short axis scaled by ELLIPSE_RATIO
ELLIPSE_RATIO = 0.86    # oval, not perfectly round - z-axis squish
THICK = (2 * RADIUS) / 12  # thickness/diameter = 1/12 per spec silhouette
SEGMENTS = 28
FACE_RINGS = 7  # radial divisions from the shared perimeter ring to the center, on the top face

# Blister domes - raised vertex-cluster bumps (center + partial 1-ring spread), NOT single-vertex
# spikes: the reference shows wide, clearly domed bumps (flatbread-2.png side profile), unlike
# cracker's small pinhole pits. 11 domes, three size classes.
BLISTER_CLASSES = [
    {"id": "large", "height": 0.09, "spread": 0.65, "share": 0.27},
    {"id": "medium", "height": 0.065, "spread": 0.55, "share": 0.46},
    {"id": "small", "height": 0.045, "spread": 0.4, "share": 0.27},
]
BLISTER_COUNT = 11

# Char/scorch spots - material-only (no geometry of their own): most sit on a blister's crown,
# a smaller set scatter on the flat area between blisters, matching the reference exactly
# (flatbread-3.png shows dark spots both centered on bumps and scattered flat).
CHAR_ON_BLISTER_COUNT = 9   # of the 11 blisters, most (not all) get a scorched crown
CHAR_FLAT_COUNT = 12        # additional small flat char spots away from any blister

BASE_HEX = "#D9A552"  # assets/prompts/breads/flatbread.json geometry.crust[0]
BASE_RGBA = "rgba(217, 165, 82, 1.0)"
# Not specified in the prompt JSON (silent on char color) - authored decision, not a JSON
# transcription: a dark scorched brown consistent with the reference's near-black crater centers
# and low-poly matte-clay style (no pure black, keeps some warmth).
CHAR_HEX = "#4A2E1A"
CHAR_RGBA = "rgba(74, 46, 26, 1.0)"


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant,
        "secondaryAlbedo": secondary,
        "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust, roughness 1.0, no specular lobe - same class as pancake/cracker precedent.",
        "zone": zone,
        "evidenceRefs": ["assets/prompts/breads/flatbread.json geometry.crust"],
    }


VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter", "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "thin oval disk with an irregular hand-stretched outline",
            "roughly a dozen raised blister domes of varying size across the top face",
            "most blister crowns carry a dark scorched center; smaller dark char spots also sit on the flat area",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-front", "view": "front elevation",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "domes clearly bulge above the base disk surface - true raised geometry, not a flat texture",
            "thin base profile, roughly a twelfth of the diameter",
        ],
        "confidence": 0.9,
    },
    {
        "id": "view-top", "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "oval outline, mildly irregular (not a clean ellipse)",
            "blisters scattered with no obvious grid; char spots both on blister crowns and independently on flat area",
        ],
        "confidence": 0.9,
    },
]


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role,
        "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": False, "twist": False, "detach": False, "visibility": True, "materialState": True},
        "sockets": [],
        "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Flat cylinder proxy matching the disk bounding volume."},
        "constraints": [],
        "destruction": {"breakable": False, "fractureGroup": cid, "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-base"},
    }


def surface_detail(bump: float, notes: str) -> dict:
    return {
        "macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump,
        "normalPattern": "faceted planar shading from split vertices",
        "displacementPattern": "vertex-cluster dome displacement (blisters); char is material-only, no displacement",
        "occlusionPattern": "cavity darkening in facet creases between dome and flat area",
        "edgeWearPattern": "none",
        "notes": notes,
    }


DISK_BODY = {
    "id": "disk", "name": "Flatbread disk (rim wall + underside)", "level": "macro", "role": "body",
    "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt",
    "topologyRationale": "One continuous revolved mass (rim + underside), same reasoning as pancake's disk body - a lathe profile with an XZ ellipse squish for the oval outline. Decision tree step 6.",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, faceted after generation",
        "latheProfile": {"points": [[0.0, 0.0], [0.85, -0.42], [1.0, 0.0], [0.97, 0.85]], "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.045,
             "notes": "Per-sector radius wobble (2 low-freq lobes + rng noise) applied identically to body and face so the shared perimeter ring stays welded, same mechanism as pancake."}
        ],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)",
        "normalStrategy": "flat normals baked by splitting vertices after displacement",
    },
    "parent": None, "attachment": None,
    "dimensions": {"width": round(2 * RADIUS, 4), "height": round(THICK, 4), "depth": round(2 * RADIUS * ELLIPSE_RATIO, 4), "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("disk", "root"),
    "material": "crust-base", "materialLayers": ["crust-base"],
    "colorMaterialRecipe": color_recipe(BASE_RGBA, BASE_RGBA, "rim wall and underside"),
    "deformations": ["outline-wobble"], "joints": [],
    "seams": [{"id": "disk-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring between rim and top face; body and face lathe the same ring so the boundary is watertight."}],
    "localFeatures": [{"id": "disk-outline-wobble", "name": "Hand-stretched outline wobble", "kind": "contour", "description": "Radius wobble per sector, oval base shape.", "evidenceRefs": ["view-top"], "confidence": 0.85}],
    "surfaceDetail": surface_detail(0.0, "Rim/underside carry no relief of their own; all identity-critical relief is on the top face."),
    "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["disk-outline-wobble"], "fidelityTier": "blockout",
}

DISK_FACE = {
    "id": "disk-top-face", "name": "Flatbread top face (blisters + char)", "level": "meso", "role": "surface",
    "importance": 1.0, "confidence": 0.9, "primitive": "lathe", "topologyClass": "continuous-sculpt",
    "topologyRationale": "Single revolved cap carrying blister displacement and char material zones, same class as pancake's disk-face. Char is a role of 'surface' material assignment, not a recessed feature (no cavity/recess/hollow token), so the recessed-feature gate does not apply.",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, faceted after generation",
        "latheProfile": {"points": [[0.97, 0.85], [0.6, 0.9], [0.3, 0.93], [0.0, 0.95]], "segments": SEGMENTS, "phiStart": 0.0, "phiLength": 6.283185307179586},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.045, "notes": "Identical to parent body so the shared ring stays welded."},
            {"id": "blister-domes", "type": "vertex-displacement", "axis": [0, 1, 0], "amplitude": BLISTER_CLASSES[0]["height"],
             "notes": f"{BLISTER_COUNT} raised vertex-cluster domes (center vertex + partial 1-ring spread) in three size classes, seeded scatter with Chebyshev-distance rejection so domes never merge."},
        ],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)",
        "normalStrategy": "flat normals baked by splitting vertices after displacement",
    },
    "parent": "disk", "attachment": None,
    "dimensions": {"width": round(2 * RADIUS * 0.97, 4), "height": round(BLISTER_CLASSES[0]["height"], 4), "depth": round(2 * RADIUS * ELLIPSE_RATIO * 0.97, 4), "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("disk-top-face", "surface"),
    "material": "crust-base", "materialLayers": ["crust-base", "crust-char"],
    "colorMaterialRecipe": color_recipe(BASE_RGBA, CHAR_RGBA, "top face base + char zones"),
    "deformations": ["outline-wobble", "blister-domes"], "joints": [],
    "seams": [{"id": "disk-top-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly."}],
    "localFeatures": [
        {"id": "disk-top-face-blister-domes", "name": "Blister dome field", "kind": "ridge",
         "description": f"{BLISTER_COUNT} raised low-poly hemispherical bumps of three size classes, scattered with a minimum separation so they read as distinct domes.",
         "evidenceRefs": ["view-front", "view-top"], "confidence": 0.9, "repetitionSystemRef": "blister-scatter"},
        {"id": "disk-top-face-char-spots", "name": "Char/scorch spot scatter", "kind": "stain",
         "description": f"{CHAR_ON_BLISTER_COUNT} blister crowns plus {CHAR_FLAT_COUNT} independent flat-area spots carry the dark crust-char material - material-only, no separate displacement.",
         "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.85, "repetitionSystemRef": "char-scatter"},
    ],
    "surfaceDetail": surface_detail(BLISTER_CLASSES[0]["height"], "assets/prompts/breads/flatbread.json notes_ko: without the char spots and blisters the object reads as a plain tortilla - both fields are identity-critical."),
    "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["disk-top-face-blister-domes", "disk-top-face-char-spots"], "fidelityTier": "surface-pass",
}


def material(mid: str, name: str, hexcolor: str, zone: str) -> dict:
    return {
        "id": mid, "name": name, "type": "standard",
        "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Base hand-transcribed from assets/prompts/breads/flatbread.json geometry.crust. Char hex is an authored decision (the JSON is silent on char color) - see author_spec.py CHAR_HEX comment."},
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureResolution": 64,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture emitted; UVs only satisfy mergeByMaterial's attribute-consistency requirement."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "oval disk silhouette", "carrier": "geometry"},
            {"id": "meso", "frequency": 4.0, "amplitude": 0.045, "role": "outline wobble", "carrier": "geometry"},
            {"id": "micro", "frequency": 11.0, "amplitude": 0.09, "role": "blister domes; char is a flat material zone with no geometric carrier", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": zone, "amplitude": BLISTER_CLASSES[0]["height"], "scale": 1.0, "silhouetteAffects": True},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": [
            {"id": "char-triangle-bucket", "name": "Char material triangle bucket", "maskSource": "geometry",
             "description": "Char zone is a second material assigned to a contiguous triangle-index range after facet+jitter (pancake's sliceTriangles pattern), not vertex colors or a texture.",
             "evidenceRefs": ["view-top"], "appliesTo": ["disk-top-face"]},
        ] if mid == "crust-char" else [],
        "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading - neither survives the runtime Lambert swap."],
        "notes": f"{zone}. Two flat colors, no texture (scripts/breads/types.ts section 9).",
    }


MATERIALS = [
    material("crust-base", "Flatbread base crust", BASE_HEX, "whole disk except char zones"),
    material("crust-char", "Flatbread char/scorch", CHAR_HEX, "blister crowns + flat char spots"),
]

REPETITION_SYSTEMS = [
    {
        "id": "blister-scatter", "name": "Blister dome scatter", "level": "micro",
        "hostComponents": ["disk-top-face"], "elementComponentIds": ["disk-top-face"],
        "elementKind": "raised vertex-cluster displacement, not an added mesh", "count": BLISTER_COUNT,
        "countPerHost": {"disk-top-face": BLISTER_COUNT},
        "distribution": {"mode": "seeded shuffle of face-grid cells, Chebyshev-distance rejection so domes never merge", "minSeparationCells": 2},
        "sizeClasses": BLISTER_CLASSES,
        "seedRule": "Positions and class draws come exclusively from the builder's injected rng argument (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "char-scatter", "name": "Char/scorch spot scatter", "level": "micro",
        "hostComponents": ["disk-top-face"], "elementComponentIds": ["disk-top-face"],
        "elementKind": "material assignment only, no geometry of its own", "count": CHAR_ON_BLISTER_COUNT + CHAR_FLAT_COUNT,
        "countPerHost": {"disk-top-face": CHAR_ON_BLISTER_COUNT + CHAR_FLAT_COUNT},
        "distribution": {
            "mode": f"{CHAR_ON_BLISTER_COUNT} of {BLISTER_COUNT} blister crowns get char material (majority, not all); {CHAR_FLAT_COUNT} additional independent flat-area spots",
            "mechanism": "Char cells are collected first into a contiguous triangle-index block during construction so post-facet sliceTriangles can split materials cleanly (pancake precedent).",
        },
        "sizeClasses": [{"id": "char-spot", "note": "material only, sized by how many grid cells the triangle bucket covers per spot"}],
        "seedRule": "Builder rng only.",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {"id": "oval-thin-disk-silhouette", "name": "Thin oval disk silhouette", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["disk"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "blister-dome-field", "name": "Raised blister dome field", "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["disk-top-face"], "evidenceRefs": ["view-front", "view-top"]},
    {"id": "char-spot-material-split", "name": "Char/scorch two-tone material split", "tier": "critical", "passIds": ["material-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["disk-top-face"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "hand-stretched-outline", "name": "Irregular hand-stretched outline", "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["disk"], "evidenceRefs": ["view-top"]},
    {"id": "baked-faceting-flatbread", "name": "Faceted flat shading baked into geometry", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["disk", "disk-top-face"], "evidenceRefs": ["view-three-quarter"]},
]

PASS_ORDER = ["blockout", "structural-pass", "form-refinement", "material-pass", "surface-pass", "optimization-pass"]
DROPPED_PASSES = {
    "lighting-pass": "lighting is fixed by the consumer harness and is not authorable in the model",
    "interaction-pass": "static showcase prop; preSpecAssessment scores actionReadinessNeed 0",
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
    spec["coordinateFrame"] = {"front": "+Z, harness three-quarter camera at (-1.6, 2.2, 2.6)", "up": "+Y", "scaleReference": "long-axis radius = 1.0 relative unit; runtime refits longest axis to 1.6."}
    spec["referenceCamera"] = {"solved": False, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6], "note": "Fixed by scripts/breadlab.ts, not matched to the reference's perspective camera."}
    spec["silhouette"] = {
        "boundingShape": f"thin oval disk, thickness/diameter {THICK / (2 * RADIUS):.4f}",
        "aspectRatios": [{"id": "thickness-over-diameter", "value": THICK / (2 * RADIUS), "source": "assets/prompts/breads/flatbread.json silhouette (1/12 ratio, authoritative)"}],
        "symmetry": "oval, broken by outline wobble and asymmetric blister/char placement",
        "dominantCurves": ["low-poly hemispherical blister domes rising from a mostly flat top face"],
        "negativeSpaces": [], "landmarks": ["11 blister domes", "char material zones on most blister crowns + scattered flat spots"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [DISK_BODY, DISK_FACE]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget", "targetTriangles": 700, "maxDrawCalls": 2, "textureSize": 0, "fpsTarget": 60,
        "optimizationPolicy": ("Panel-group target band 500-1100 tri / <=120KB (CRIB budget table), reached by construction via a 7-ring x 28-sector oval lathe disk.",),
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": ["thin oval disk, thickness ~1/12 diameter", "raised blister dome field (~11 domes)", "char/scorch material on most blister crowns + scattered flat spots", "irregular hand-stretched outline", "faceted flat shading"],
        "niceToHave": ["exact blister/char positions", "reference's soft contact shadow"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({
        "roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run",
            "acceptedLimitation": "Same documented limitation as pancake/cracker: runtime keeps only map+color, PBR maps banned (docs/VISUAL.md section 8). All relief lives in geometry; char is a flat material zone."},
    })
    spec["lookDevTargets"]["lightingPass"] = {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Fixed by scripts/breadlab.ts.", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"]}
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key 0xffe2b0 at (-2, 6, 2), intensity 1.4, no exposure control, no tone mapping.", "usage": "Fixed by the harness.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "Ambient 0xfff0dc at 0.75.", "usage": "Fixed by the harness.", "contactShadow": "none - no shadow map or ground plane, so no contact shadow or ground shadow is rendered; accepted lighting delta."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill 0xdce8ff at (2.5, 3, -2), intensity 0.2.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."},
    ]
    spec["proceduralStrategy"] = [
        "Build one indexed oval lathe disk (body + face rings, ellipse XZ scale).",
        "Apply outline wobble to body and face profiles identically before any other displacement.",
        "Raise blister dome vertex clusters into the face.",
        "Classify each face triangle into a char bucket or base bucket during construction, ordering char triangles first so they form a contiguous range.",
        "Jitter vertices while indexed, so shared vertices move together.",
        "Bake faceting by splitting vertices and recomputing normals.",
        "Project top-planar UVs, slice the char/base triangle ranges, then merge by material into exactly two meshes.",
    ]
    spec["assumptions"] = ["Underside never visible above the horizon.", "Runtime normalizes longest axis to 1.6.", "Blister/char positions not identity-critical beyond count and rough distribution."]
    spec["risks"] = [
        {"id": "dome-below-tessellation", "severity": "high", "description": "A raised cluster too small relative to grid spacing reads as a spike, not a dome (cracker's docking-hole lesson, inverted).", "mitigation": "Blister spread parameter raises 1-ring neighbors at partial height, not just the center vertex, verified against actual cell spacing before authoring."},
        {"id": "seed-density-collapse", "severity": "high", "description": "Cracker's v1 defect: too many displaced cells with too little separation reads as a uniform corrugated texture instead of discrete features.", "mitigation": "Blister and char counts kept low relative to the grid (11 blisters / ~21 char spots against ~200 face cells) with an explicit minimum-separation rejection, informed directly by the cracker incident."},
        {"id": "flat-shading-loss", "severity": "high", "description": "flatShading flag not inherited by the runtime swap.", "mitigation": "Faceting baked via lib.ts facet()."},
        {"id": "seam-tear", "severity": "medium", "description": "Body and face share a perimeter ring; independent jitter would tear it.", "mitigation": "One indexed geometry, jittered whole, sliced by triangle range only after facet."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws on attribute-set mismatch across a bucket.", "mitigation": "Every geometry gets position, normal, uv - no color attribute."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup; plausible break is a tear, not modelled here"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "blister-dome-field": ("ridge", "disk-top-face-blister-domes"),
    "char-spot-scatter": ("stain", "disk-top-face-char-spots"),
    "hand-stretched-outline": ("contour", "disk-outline-wobble"),
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


def fill_assessment(assessment: dict) -> None:
    pre = assessment["preSpecAssessment"]
    pre["objectClass"] = {"primaryType": "single thin oval flatbread", "primaryDomain": "object", "formLanguage": ["organic", "sculptural"], "structureKind": ["single rigid disk"], "motionPotential": ["static prop", "whole-object transform"], "materialFamilies": ["ceramic"], "notes": "Matte baked crust with a dark scorch zone, same PBR class as pancake/cracker."}
    pre["complexity"] = {
        "tier": "simple",
        "scores": {"silhouetteComplexity": 1, "componentCount": 1, "hierarchyDepth": 1, "repetitionDensity": 2, "materialLayerCount": 1, "localDetailDensity": 2, "occlusionRisk": 1, "actionReadinessNeed": 0},
        "estimatedCounts": {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 2, "materialLayers": 2, "repetitionSystems": 2},
        "reasoning": [
            "One rigid macro body (disk), no repeated macro parts.",
            "Silhouette is an oval disk with outline wobble and blister bumps interrupting an otherwise smooth lathe form.",
            "Repetition density 2: blister-scatter + char-scatter, both identity-critical per flatbread.json notes_ko.",
            "Two albedo zones (base + char) in one material family, materialLayerCount 1.",
            "Occlusion risk 1: only the plain underside is hidden.",
            "Action readiness 0: static showcase prop.",
        ],
    }
    pre["specDepthDecision"] = {"requiredDepth": "simple", "minimumComponentLevels": ["macro", "meso"], "needsRepetitionSystems": True, "needsMaterialLocalOverrides": True, "needsMultipleReviewViews": True, "needsActionReadyHierarchy": True, "rationale": "Simple tier but needs a meso top-face node so blister/char repetition systems attach to real geometry."}
    pre["detailInventory"] = {
        "scanMethod": "component-zones", "targetMinDetails": 3,
        "note": "Enumerated by hand (CRIB: skip detail-inventory for a single repeated-system object).",
        "details": [
            {"id": "blister-dome-field", "zone": "top face", "observation": "~11 raised low-poly domes of varying size, scattered without an obvious grid.", "inference": "Steam pockets puffing up during griddle cooking.", "mapsTo": {"ref": "disk-top-face-blister-domes", "note": "component disk-top-face localFeatures + repetitionSystem blister-scatter"}, "confidence": 0.9, "evidenceRef": "flatbread-3.png full frame"},
            {"id": "char-spot-scatter", "zone": "top face", "observation": "Dark scorch material on most blister crowns plus independent flat-area spots.", "inference": "Direct flame/griddle contact scorching.", "mapsTo": {"ref": "disk-top-face-char-spots", "note": "component disk-top-face localFeatures + repetitionSystem char-scatter"}, "confidence": 0.85, "evidenceRef": "flatbread-3.png full frame"},
            {"id": "hand-stretched-outline", "zone": "perimeter", "observation": "Loosely irregular oval outline, not a clean ellipse.", "inference": "Hand-stretched dough.", "mapsTo": {"ref": "disk-outline-wobble", "note": "component disk localFeatures.outline-wobble"}, "confidence": 0.8, "evidenceRef": "flatbread-3.png outline"},
        ],
    }
    pre["unknownsToResolveBeforeImplementation"] = [
        "Underside fully occluded; modelled as a plain closed cap, never visible above the horizon.",
        "Exact blister/char positions not identity-critical beyond count and rough distribution; seeded from the builder rng.",
        "Char color not specified in the prompt JSON; authored as a dark scorched brown consistent with the reference and the matte low-poly style.",
    ]
    assessment["qualityContract"]["minimumSpecDepth"] = {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 2, "materialLayers": 2, "repetitionSystems": 2, "reviewViewpoints": 4}
    bind_details(pre)
    resolve_unknowns(pre)


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
