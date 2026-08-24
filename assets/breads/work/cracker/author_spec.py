# Authors the subject-specific half of object-sculpt-spec.json in place.
# Pattern lifted from assets/breads/work/pancake/author_spec.py (CRIB step 4).
#
# Geometry frame: Y up, +Z forward, half-width 1.0 = square wafer half-width, all values relative.
# The wafer is a Cartesian grid slab (box primitive, assembled-solid), NOT a lathe: docking holes
# and seed speckles are grid-cell vertex displacements, exactly the pancake pore mechanism applied
# on a square grid instead of a polar one.
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "cracker.png"

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
            "Square Cracker", "--image", str(REFERENCE),
            "--assessment", str(ASSESSMENT), "--out", str(SPEC),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


# --- measured / authored proportions (assets/prompts/breads/cracker.json geometry) ------------
HALF_WIDTH = 1.0          # full width = 2.0
THICK = 0.2                # width/10, per cracker.json silhouette + team-lead directive (spec > image)
N = 16                      # grid subdivisions per side (top-face resolution)
CELL = (2 * HALF_WIDTH) / N  # 0.125

# Docking holes: regular grid, margin 2 cells in from the edge, spacing 2 cells -> 7x7 = 49 holes,
# matching the reference's dense evenly-spaced pin pattern (cracker-3.png).
HOLE_INDICES = [2, 4, 6, 8, 10, 12, 14]
HOLE_DEPTH = 0.09  # world units; wall spans one cell (0.125) so slope = atan(0.09/0.125) = 35.8deg (>=30deg rule)
HOLE_COUNT = len(HOLE_INDICES) ** 2

# Seed speckles: raised vertex bumps at grid cells offset from the hole grid (odd indices), split
# into two size classes (sesame = larger oval-reading bump, poppy = tiny dot-reading bump). No
# color separation needed -- team-lead directive: whole object is one flat albedo, geometry-only.
SESAME_BUMP = 0.035
POPPY_BUMP = 0.018
SEED_COUNT_TARGET = 34  # hand-enumerated target (CRIB: skip detail-inventory grid scan for one repeated system)

EDGE_WOBBLE = {"lobe2": 0.02, "noise": 0.014, "rimHeightNoise": 0.10}  # fraction of HALF_WIDTH / THICK
JITTER_AMP = 0.006  # slightly below pancake's 0.008 -- the wafer is thinner, a bigger jitter would punch through

TOP_HEX = "#D9A552"  # assets/prompts/breads/cracker.json -> geometry.crust[0], "uniform matte golden surface"
TOP_RGBA = "rgba(217, 165, 82, 1.0)"


def color_recipe(dominant: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant,
        "secondaryAlbedo": dominant,  # single-zone object: no second tone, validator requires a valid rgba string here regardless
        "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust, roughness 1.0, no specular lobe -- same class as pancake.json precedent.",
        "zone": zone,
        "evidenceRefs": ["assets/prompts/breads/cracker.json geometry.crust"],
    }


VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter",
        "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "thin flat square wafer, one uniform golden tone across the whole top face",
            "regular grid of small dark-rimmed docking holes covering most of the top face",
            "scattered lighter oval sesame speckles and tiny dark poppy-seed dots between the holes",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-front",
        "view": "front elevation",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "very thin profile band, roughly a tenth of the width per the authored spec ratio",
            "slightly irregular top and bottom edge line, not a perfectly straight extrusion",
        ],
        "confidence": 0.85,
    },
    {
        "id": "view-top",
        "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "docking holes sit on a regular ~7x7 grid with a clear margin from the edges",
            "outline is a rounded square with mildly irregular, hand-cut-looking sides",
            "sesame and poppy speckles are scattered, not gridded, denser near hole rows",
        ],
        "confidence": 0.9,
    },
]


def action_profile(cid: str, role: str, breakable: bool = False) -> dict:
    return {
        "animationRole": role,
        "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {
            "translate": True, "rotate": True, "scale": True, "bend": False,
            "twist": False, "detach": False, "visibility": True, "materialState": True,
        },
        "sockets": [],
        "collider": {
            "type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False,
            "notes": "Flat box proxy matching the wafer bounding volume; holes/speckles are far below collider resolution.",
        },
        "constraints": [],
        "destruction": {
            "breakable": breakable, "fractureGroup": cid, "seamRefs": [],
            "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust",
        },
    }


def surface_detail(bump: float, notes: str) -> dict:
    return {
        "macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump,
        "normalPattern": "faceted planar shading from split vertices",
        "displacementPattern": "grid-cell vertex displacement (holes recessed, seeds raised)",
        "occlusionPattern": "cavity darkening inside each docking-hole pit",
        "edgeWearPattern": "none - a freshly baked surface carries no edge wear",
        "notes": notes,
    }


WAFER = {
    "id": "wafer",
    "name": "Cracker wafer slab",
    "level": "macro",
    "role": "body",
    "importance": 1.0,
    "confidence": 0.9,
    "primitive": "box",
    "topologyClass": "assembled-solid",
    "topologyRationale": (
        "A single rigid flat slab with no internal seams -- box is the structurally correct primitive "
        "for a thin extruded rectangular volume (unlike pancake's lathed disk, this silhouette has no "
        "rotational symmetry to revolve). 'continuous-sculpt' is disallowed with primitive 'box' "
        "(validate_sculpt_spec.py DISALLOWED_TOPOLOGY_PRIMITIVE_PAIRS), so assembled-solid is the correct class."
    ),
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, faceted after generation",
        "gridProfile": {
            "note": "Cartesian NxN grid slab, not a lathe profile. See scripts/breads/cracker.ts for the exact builder.",
            "segmentsPerSide": N,
            "halfWidth": HALF_WIDTH,
            "thickness": THICK,
        },
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {
                "id": "hand-cut-edge-wobble",
                "type": "radial-modulation",
                "axis": [0, 1, 0],
                "amplitude": EDGE_WOBBLE["lobe2"] + EDGE_WOBBLE["noise"],
                "notes": "Perimeter-loop vertices only get an outward/inward XZ nudge (2-lobe sine + rng noise) plus rim-height noise, so the edge reads hand-cut rather than machine-square. Interior grid vertices are untouched.",
            }
        ],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)",
        "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag",
    },
    "parent": None,
    "attachment": None,
    "dimensions": {
        "width": round(2 * HALF_WIDTH, 4), "height": THICK, "depth": round(2 * HALF_WIDTH, 4),
        "units": "relative", "confidence": 0.9,
    },
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("wafer", "root"),
    "material": "crust",
    "materialLayers": ["crust"],
    "colorMaterialRecipe": color_recipe(TOP_RGBA, "whole object, single tone"),
    "deformations": ["hand-cut-edge-wobble"],
    "joints": [],
    "seams": [],
    "localFeatures": [
        {
            "id": "wafer-edge-wobble",
            "name": "Hand-cut edge wobble",
            "kind": "contour",
            "description": "Perimeter loop radius/height perturbed by a low-frequency wobble plus per-vertex noise, so the square reads hand-cut rather than machine-die-cut.",
            "evidenceRefs": ["view-top", "view-front"],
            "confidence": 0.85,
        }
    ],
    "surfaceDetail": surface_detail(0.0, "Base slab carries no relief of its own; all relief lives on the top-face child component."),
    "evidenceRefs": ["view-three-quarter", "view-front"],
    "details": ["wafer-edge-wobble"],
    "fidelityTier": "blockout",
}

TOP_FACE = {
    "id": "wafer-top-face",
    "name": "Cracker top face (docking holes + speckles)",
    "level": "meso",
    "role": "surface",
    "importance": 1.0,
    "confidence": 0.9,
    "primitive": "box",
    "topologyClass": "assembled-solid",
    "topologyRationale": (
        "Same rigid grid volume as the parent wafer; this node exists to carry the top face's own "
        "identity-critical local features (docking-hole grid, seed speckles) separately from the "
        "parent's edge-wobble feature, mirroring pancake's disk/disk-face split. Not surface-relief: "
        "there is no separate host-plus-decal pair, the relief is authored directly into this face's "
        "own vertices."
    ),
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, faceted after generation",
        "gridProfile": {
            "note": "Same NxN grid as the parent's top ring; holes and seeds are single-vertex grid-cell displacements, zero added triangles.",
            "segmentsPerSide": N,
        },
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {
                "id": "docking-hole-grid",
                "type": "vertex-displacement",
                "axis": [0, -1, 0],
                "amplitude": HOLE_DEPTH,
                "notes": f"{HOLE_COUNT} holes on a regular 7x7 grid (indices {HOLE_INDICES} on each axis, margin 2 cells, spacing 2 cells). Single-vertex dip per hole, depth {HOLE_DEPTH} against a cell width of {CELL:.4f} -> wall slope ~36deg, clears the CRIB >=30deg Lambert-readability floor.",
            },
            {
                "id": "seed-speckle-scatter",
                "type": "vertex-displacement",
                "axis": [0, 1, 0],
                "amplitude": SESAME_BUMP,
                "notes": f"~{SEED_COUNT_TARGET} raised single-vertex bumps in two size classes (sesame {SESAME_BUMP}, poppy {POPPY_BUMP}) scattered on grid cells not used by the hole grid, via the same seeded-shuffle-with-rejection mechanism as pancake's pore scatter.",
            },
        ],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)",
        "normalStrategy": "flat normals baked by splitting vertices after displacement",
    },
    "parent": "wafer",
    "attachment": None,
    "dimensions": {
        "width": round(2 * HALF_WIDTH, 4), "height": round(HOLE_DEPTH, 4), "depth": round(2 * HALF_WIDTH, 4),
        "units": "relative", "confidence": 0.9,
    },
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("wafer-top-face", "surface"),
    "material": "crust",
    "materialLayers": ["crust"],
    "colorMaterialRecipe": color_recipe(TOP_RGBA, "top face"),
    "deformations": ["docking-hole-grid", "seed-speckle-scatter"],
    "joints": [],
    "seams": [],
    "localFeatures": [
        {
            "id": "wafer-top-face-docking-holes",
            "name": "Docking hole grid",
            "kind": "hole",
            "description": f"{HOLE_COUNT} evenly spaced small conical pits pressed into the top face on a regular grid, the single most identity-defining trait per cracker.json notes_ko.",
            "evidenceRefs": ["view-top", "view-three-quarter"],
            "confidence": 0.95,
            "repetitionSystemRef": "docking-hole-grid",
        },
        {
            "id": "wafer-top-face-seed-speckles",
            "name": "Seed speckle scatter",
            "kind": "ridge",
            "description": "Scattered sesame (larger) and poppy (tiny) seed bumps across the top face, off the hole grid.",
            "evidenceRefs": ["view-top", "view-three-quarter"],
            "confidence": 0.85,
            "repetitionSystemRef": "seed-speckle-scatter",
        },
    ],
    "surfaceDetail": surface_detail(
        HOLE_DEPTH,
        "assets/prompts/breads/cracker.json notes_ko: without the docking-hole grid and seed speckles the object reads as a plain flat square, so these fields are identity-critical rather than decorative.",
    ),
    "evidenceRefs": ["view-top", "view-three-quarter"],
    "details": ["wafer-top-face-docking-holes", "wafer-top-face-seed-speckles"],
    "fidelityTier": "surface-pass",
}


def material(mid: str, name: str, hexcolor: str) -> dict:
    return {
        "id": mid,
        "name": name,
        "type": "standard",
        "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor,
        "color": hexcolor,
        "albedo": {
            "dominant": hexcolor,
            "secondary": [],
            "samplingNotes": "Hand-transcribed from assets/prompts/breads/cracker.json geometry.crust, not sampled from reference pixels (those carry baked key-light shading).",
        },
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureResolution": 64,
        "textureProjection": {
            "mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1,
            "texelDensityIntent": "No texture is emitted. UVs exist only to satisfy mergeByMaterial's attribute-consistency requirement (scripts/breads/types.ts section 4).",
        },
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "flat slab silhouette", "carrier": "geometry"},
            {"id": "meso", "frequency": 4.0, "amplitude": 0.05, "role": "hand-cut edge wobble", "carrier": "geometry"},
            {"id": "micro", "frequency": 16.0, "amplitude": 0.09, "role": "docking-hole grid and seed speckles; on the edge band, faceting alone", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": "grid-cell vertex displacement", "amplitude": HOLE_DEPTH, "scale": 1.0, "silhouetteAffects": False},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material. Cavity darkening comes from pit-wall orientation."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": [
            {
                "id": "hole-cavity-shading",
                "name": "Docking-hole cavity shading",
                "maskSource": "geometry",
                "description": "Pit walls tilt away from the key light and darken on their own; no mask, map or albedo change is used, because the runtime cannot read one.",
                "evidenceRefs": ["view-top"],
                "appliesTo": ["wafer-top-face"],
            }
        ],
        "shaderNotes": [
            "Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial with roughness 1, metalness 0.",
            "Never set vertexColors or flatShading - neither survives the runtime Lambert swap (scripts/breads/types.ts section 2-3).",
        ],
        "notes": "One flat color is enough for the whole object (team-lead directive), so no texture is emitted at all (scripts/breads/types.ts section 9).",
    }


MATERIALS = [material("crust", "Cracker crust", TOP_HEX)]

REPETITION_SYSTEMS = [
    {
        "id": "docking-hole-grid",
        "name": "Docking hole grid",
        "level": "micro",
        "hostComponents": ["wafer-top-face"],
        "elementComponentIds": ["wafer-top-face"],
        "elementKind": "recessed vertex displacement, not an added mesh",
        "count": HOLE_COUNT,
        "countPerHost": {"wafer-top-face": HOLE_COUNT},
        "distribution": {
            "mode": "regular Cartesian grid, not seeded scatter",
            "gridIndices": HOLE_INDICES,
            "note": "Deliberately deterministic and non-random: docking holes on a real cracker are machine-pressed on a fixed pattern, unlike pancake's organic pore scatter.",
        },
        "sizeClasses": [{"id": "hole", "depth": HOLE_DEPTH}],
        "seedRule": "Positions are fixed grid indices, not rng-derived; only the tiny per-vertex jitter afterward comes from the builder rng (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "seed-speckle-scatter",
        "name": "Seed speckle scatter",
        "level": "micro",
        "hostComponents": ["wafer-top-face"],
        "elementComponentIds": ["wafer-top-face"],
        "elementKind": "raised vertex displacement, not an added mesh",
        "count": SEED_COUNT_TARGET,
        "countPerHost": {"wafer-top-face": SEED_COUNT_TARGET},
        "distribution": {
            "mode": "seeded shuffle of face-grid cells not used by the hole grid, Chebyshev-distance-1 rejection",
            "mechanism": "Same mechanism as pancake's pore-scatter (assets/breads/work/pancake/author_spec.py PORE_MECHANISM), applied to raised rather than recessed displacement.",
        },
        "sizeClasses": [
            {"id": "sesame", "depth": SESAME_BUMP, "share": 0.55},
            {"id": "poppy", "depth": POPPY_BUMP, "share": 0.45},
        ],
        "seedRule": "Positions and class draws come exclusively from the builder's injected rng argument, never Math.random (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {
        "id": "thin-square-wafer-silhouette",
        "name": "Thin flat square wafer silhouette",
        "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["wafer"], "evidenceRefs": ["view-front", "view-three-quarter"],
    },
    {
        "id": "hand-cut-edge",
        "name": "Hand-cut edge wobble, not a machine square",
        "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["wafer"], "evidenceRefs": ["view-top"],
    },
    {
        "id": "docking-hole-grid-review",
        "name": "Regular docking-hole grid on the top face",
        "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["wafer-top-face"], "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "seed-speckle-review",
        "name": "Sesame/poppy seed speckle scatter",
        "tier": "important", "passIds": ["surface-pass"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["wafer-top-face"], "evidenceRefs": ["view-top"],
    },
    {
        "id": "baked-faceting-review",
        "name": "Faceted flat shading baked into geometry",
        "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["wafer", "wafer-top-face"], "evidenceRefs": ["view-three-quarter"],
    },
]

PASS_ORDER = ["blockout", "structural-pass", "form-refinement", "material-pass", "surface-pass", "optimization-pass"]
DROPPED_PASSES = {
    "lighting-pass": "lighting is fixed by the consumer harness and is not authorable in the model (spec.lookDevTargets.lightingPass.authority)",
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
    spec["scores"] = {
        "object_isolation": 3, "silhouette_readability": 3, "depth_inference": 3,
        "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 1,
        "interaction_fit": 3,
    }
    spec["coordinateFrame"] = {
        "front": "+Z, the direction the harness three-quarter camera at (-1.6, 2.2, 2.6) looks from",
        "up": "+Y",
        "scaleReference": "half-width = 1.0 relative unit. Absolute scale is meaningless: the consumer runtime refits the longest axis to 1.6 (scripts/breads/types.ts section 7).",
    }
    spec["referenceCamera"] = {
        "solved": False, "fovDegrees": 0.0, "aspect": 1.0,
        "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0},
        "positionHint": [-1.6, 2.2, 2.6],
        "note": "Not solved and deliberately not matched to the reference; the review camera is fixed by scripts/breadlab.ts (pancake.json precedent).",
    }
    spec["silhouette"] = {
        "boundingShape": f"thin flat square slab, {2*HALF_WIDTH:.1f} wide by {THICK:.2f} tall in half-width units",
        "aspectRatios": [
            {"id": "thickness-over-width", "value": THICK / (2 * HALF_WIDTH), "source": "assets/prompts/breads/cracker.json silhouette (1/10 ratio, authoritative over the thinner v1/v2 image reads per notes_ko v3)"},
        ],
        "symmetry": "near-square footprint, broken by the hand-cut edge wobble",
        "dominantCurves": ["flat top and bottom planes; the only curvature is the shallow docking-hole conical pits"],
        "negativeSpaces": ["49 small conical pits pressed into the top face"],
        "landmarks": ["regular 7x7 docking-hole grid, margin 2 cells from each edge", "hand-cut edge wobble on the perimeter loop"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [WAFER, TOP_FACE]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget",
        "targetTriangles": 704,
        "maxDrawCalls": 1,
        "textureSize": 0,
        "fpsTarget": 60,
        "optimizationPolicy": (
            "Hard consumer budget: at most 8000 triangles and 250 KB per bread with at most two meshes "
            "(scripts/breads/types.ts section 6). Panel-group target band is 500-1100 tri / <=120KB "
            "(CRIB budget table). Reached by construction: a 16x16 top grid (512 tri) plus a lightweight "
            "side wall (128 tri) and a coarse fan underside (64 tri) totals 704 tri without decimation.",
        ),
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": [
            "thin flat square wafer, thickness about 1/10 of the width",
            "regular grid of docking holes covering most of the top face",
            "scattered sesame/poppy seed speckles between the holes",
            "hand-cut, not machine-square, edge",
            "faceted flat shading baked into geometry",
        ],
        "niceToHave": ["exact seed positions", "the reference's soft contact shadow, which the shadowless harness cannot reproduce"],
        "fpsTarget": 60,
        "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({
        "roughnessVariationRequired": False, "normalOrBumpRequired": False,
        "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [],
        "referencePbrExtraction": {
            "requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False,
            "script": "not run",
            "acceptedLimitation": "Same documented limitation as pancake: the consumer runtime keeps only map and color and the repo bans PBR maps (docs/VISUAL.md section 8), so every channel these fields describe is inert. All relief lives in geometry.",
        },
    })
    spec["lookDevTargets"]["lightingPass"] = {
        "requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"],
        "authority": "Lighting is fixed by scripts/breadlab.ts (mirrored from scripts/thumbsHarness.ts), not authored here.",
        "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"],
    }
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key 0xffe2b0 at (-2, 6, 2), intensity 1.4.", "usage": "Fixed by the harness.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "Ambient 0xfff0dc at 0.75, no exposure control, no tone mapping.", "usage": "Fixed by the harness.", "contactShadow": "none - there is no shadow map and no ground plane, so no contact shadow or ground shadow is rendered; the reference's soft shadow is a known, accepted lighting delta."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill 0xdce8ff at (2.5, 3, -2), intensity 0.2.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."},
    ]
    spec["proceduralStrategy"] = [
        "Build one indexed Cartesian NxN grid slab: top ring, perimeter side wall, coarse fan underside.",
        "Apply the hand-cut edge wobble to perimeter-loop vertices only, before any displacement.",
        "Displace the docking-hole grid (fixed indices) and seed speckles (seeded scatter) into the top face.",
        "Jitter vertices while the geometry is still indexed, so shared vertices move together.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project top-planar UVs, then merge by material into exactly one mesh.",
    ]
    spec["assumptions"] = [
        "The underside is never visible from any turntable azimuth above the horizon, so it is a coarse fan rather than a full grid.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "Hole/seed positions are not identity-critical beyond the grid pattern and rough seed density; exact placement comes from the builder rng.",
    ]
    spec["risks"] = [
        {
            "id": "detail-below-tessellation", "severity": "high",
            "description": "A displaced detail smaller than the grid's vertex spacing disappears silently (pancake's cost-two-iterations lesson).",
            "mitigation": f"Hole depth {HOLE_DEPTH} was sized against the actual cell width {CELL:.4f} before authoring (>=30deg wall), not against the reference's pixel measurement.",
        },
        {
            "id": "flat-shading-loss", "severity": "high",
            "description": "A flatShading flag is not inherited by the runtime material swap.",
            "mitigation": "Faceting is baked into geometry by splitting vertices (scripts/breads/lib.ts facet) before export.",
        },
        {
            "id": "seam-tear", "severity": "medium",
            "description": "Top grid, side wall, and underside fan are separate structural regions of one geometry; jittering them out of sync would open a crack along the perimeter.",
            "mitigation": "Build one indexed geometry sharing the exact perimeter-ring vertices between top, side, and underside; jitter once on the whole thing.",
        },
        {
            "id": "merge-attribute-mismatch", "severity": "medium",
            "description": "mergeByMaterial throws when geometries in one bucket carry different attribute sets.",
            "mitigation": "Single mesh, single material - no merge-bucket mismatch is possible here.",
        },
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["the wafer is a single fractureGroup; the plausible break is a snap in half, not modelled here"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "docking-hole-grid": ("hole", "wafer-top-face-docking-holes"),
    "seed-speckle-scatter": ("ridge", "wafer-top-face-seed-speckles"),
    "hand-cut-edge-wobble": ("contour", "wafer-edge-wobble"),
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
    pre["objectClass"] = {
        "primaryType": "single square artisan cracker",
        "primaryDomain": "object",
        "formLanguage": ["geometric", "hand-crafted"],
        "structureKind": ["single rigid slab"],
        "motionPotential": ["static prop", "whole-object transform"],
        "materialFamilies": ["ceramic"],
        "notes": "Baked-crust surface reads as matte unglazed ceramic in PBR terms, same class as pancake.json. One flat albedo zone only.",
    }
    pre["complexity"] = {
        "tier": "simple",
        "scores": {
            "silhouetteComplexity": 1, "componentCount": 1, "hierarchyDepth": 1,
            "repetitionDensity": 2, "materialLayerCount": 0, "localDetailDensity": 2,
            "occlusionRisk": 0, "actionReadinessNeed": 0,
        },
        "estimatedCounts": {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 2, "materialLayers": 1, "repetitionSystems": 2},
        "reasoning": [
            "One rigid macro body (wafer), no repeated macro parts, so componentCount scores 1.",
            "Silhouette is a flat square slab with only the hand-cut edge wobble interrupting it, scoring 1.",
            "Repetition density scores 2: two independent scatter systems (49-hole grid + ~34 seed speckles) on one face.",
            "Local detail density scores 2 for the same reason - cracker.json notes_ko states the object reads as a plain flat square without them.",
            "One material family in one albedo zone (whole object is a single flat tone per team-lead directive), so materialLayerCount scores 0.",
            "Occlusion risk scores 0: the only hidden face is the flat, featureless underside.",
            "Action readiness scores 0: static turntable showcase prop.",
            "Aggregate maps to the simple tier, even lighter than pancake's 9/24 baseline.",
        ],
    }
    pre["specDepthDecision"] = {
        "requiredDepth": "simple",
        "minimumComponentLevels": ["macro", "meso"],
        "needsRepetitionSystems": True,
        "needsMaterialLocalOverrides": False,
        "needsMultipleReviewViews": True,
        "needsActionReadyHierarchy": True,
        "rationale": "Simple tier by part count, but still needs a meso top-face node so the two identity-critical repetition systems (holes, seeds) attach to real geometry rather than to prose.",
    }
    pre["detailInventory"] = {
        "scanMethod": "component-zones",
        "targetMinDetails": 3,
        "note": "Enumerated by hand (CRIB step 3: skip detail-inventory for a single repeated-system object) rather than build_detail_inventory.py - a 3x3 grid scan would just emit nine crops of the same hole grid.",
        "details": [
            {
                "id": "docking-hole-grid", "zone": "top face",
                "observation": f"Regular {HOLE_COUNT}-hole grid, small conical pits pressed evenly into the top face, clear margin from the edges.",
                "inference": "Machine-pressed docking pins, standard cracker manufacture.",
                "mapsTo": {"ref": "wafer-top-face-docking-holes", "note": "component wafer-top-face localFeatures + repetitionSystem docking-hole-grid"},
                "confidence": 0.95, "evidenceRef": "cracker-3.png full frame",
            },
            {
                "id": "seed-speckle-scatter", "zone": "top face",
                "observation": "Scattered sesame and poppy seed speckles between the holes, not gridded.",
                "inference": "Seeds pressed into the dough before baking.",
                "mapsTo": {"ref": "wafer-top-face-seed-speckles", "note": "component wafer-top-face localFeatures + repetitionSystem seed-speckle-scatter"},
                "confidence": 0.85, "evidenceRef": "cracker-3.png full frame",
            },
            {
                "id": "hand-cut-edge-wobble", "zone": "perimeter",
                "observation": "Edge line is mildly irregular, not a perfectly straight machine-cut square.",
                "inference": "Hand-cut rather than die-cut dough.",
                "mapsTo": {"ref": "wafer-edge-wobble", "note": "component wafer localFeatures.edge-wobble"},
                "confidence": 0.8, "evidenceRef": "cracker-3.png outline",
            },
        ],
    }
    pre["unknownsToResolveBeforeImplementation"] = [
        "Underside is fully occluded in all three reference views. Resolved by construction: modelled as a coarse flat fan, never visible above the horizon.",
        "Exact hole/seed positions are not identity-critical beyond the grid pattern and rough seed density.",
    ]
    assessment["qualityContract"]["minimumSpecDepth"] = {
        "macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 2, "materialLayers": 1, "repetitionSystems": 2, "reviewViewpoints": 4,
    }
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
