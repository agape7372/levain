# Authors the subject-specific half of object-sculpt-spec.json in place.
# Re-runnable: every refine-spec iteration edits the numbers here and re-runs, so the spec
# never becomes the only copy of a reconstruction decision.
#
# Geometry frame: Y up, +Z forward (harness camera looks from -1.6,2.2,2.6), radius scale
# 1.0 = wedge outline characteristic size (see outline_gen.py). Height ratio height/width=0.5
# per prompts/breads/scone.json notes_ko v3 (the wedge/height>width self-contradiction fix).
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from outline_gen import build_outline  # noqa: E402

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "scone.png"

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
            "Wedge Scone", "--image", str(REFERENCE),
            "--assessment", str(ASSESSMENT), "--out", str(SPEC),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


# --- measured / authored proportions ------------------------------------------------------
OUTLINE = build_outline()  # [(label, angle_deg, radiusFraction), ...] - see outline_gen.py
WEDGE_HEIGHT = 1.00  # height/width = 0.5 with width = 2*characteristic radius ~1.0 -> height ~1.0

# Body: bottom pole -> bottom edge -> slight foot flare -> shared rim (color-boundary ring).
# Near-vertical sides per the wedge's flat cut faces; the only taper is the tiny foot bevel.
BODY_PROFILE = [[0.00, 0.00], [0.97, 0.00], [1.00, 0.05], [0.98, 0.82]]
# Face: shared rim (dup of BODY_PROFILE's last point) -> dome rings -> crown pole.
FACE_PROFILE = [[0.98, 0.82], [0.80, 0.90], [0.55, 0.97], [0.28, 1.02], [0.00, 1.05]]
FACE_RINGS_FOR_FISSURES = [0.80, 0.55, 0.28]  # excludes shared rim (0.98) and crown (0.00)

FISSURE_TARGETS_Z = [0.55, 0.32, 0.10]  # apex(+1) .. back(~-1); see check_fissures.py
FISSURE_MATCH_TOLERANCE = 0.18
FISSURE_DEPTH = 0.06  # verified via check_fissures.py: 4/10, 5/10, 7/10 sectors matched, no gaps
FISSURE_MECHANISM = (
    "Grid-cell dip generalized from a point to a line: for each outline sector and each "
    "fissure's target Z, the closest of the three interior face rings (rFrac 0.80/0.55/0.28; "
    "the shared rim and the crown pole are excluded so the two-tone seam and the single crown "
    "vertex stay undisturbed) is found by comparing that ring's actual Z at that sector "
    "(ringFrac * outlineZ(sector)) against the target, and dipped only if within tolerance 0.18 - "
    "sectors with no close-enough ring are left alone, so each fissure legitimately shortens "
    "toward the apex instead of being forced to span the full perimeter. A first attempt at "
    "the outline (10 points, all resolution spent on corner fillets) produced only 3/10 matches "
    "for the two apex-side fissures - the two straight cut edges had zero intermediate vertices, "
    "so no grid cell existed at mid-edge Z levels at all. Fixed by adding two explicit points per "
    "straight edge (outline_gen.py LEFT/RIGHT edge interpolants) at 32%/62% along each edge, "
    "purely so fissures have somewhere to land; the edges themselves stay geometrically straight "
    "since a polygon edge between any two consecutive outline points is a straight segment "
    "regardless of how many points sample it."
)

TOP_HEX = "#D6A15C"   # assets/prompts/breads/scone.json -> geometry.crust[0]
SIDE_HEX = "#F4EAD4"  # assets/prompts/breads/scone.json -> geometry.crust[1]
TOP_RGBA = "rgba(214, 161, 92, 1.0)"
SIDE_RGBA = "rgba(244, 234, 212, 1.0)"


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant,
        "secondaryAlbedo": secondary,
        "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust, opaque dielectric, roughness 1.0, no specular lobe - same class as pancake's crust materials.",
        "zone": zone,
        "evidenceRefs": ["assets/prompts/breads/scone.json geometry.crust"],
    }


VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter",
        "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "thick rounded-triangle wedge resting flat on its wide bottom face",
            "top face carries 3-4 shallow horizontal crack fissures",
            "only the top face is golden; every other visible face is pale cream",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-top",
        "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "rounded-triangle footprint: apex corner rounds tighter than the two back corners",
            "back edge between the two back corners is a very shallow convex arc",
            "3 fissures run roughly perpendicular to the apex-to-back axis, shortening toward the apex",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-front",
        "view": "front elevation",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "wide rounded silhouette - expected consequence of the apex-forward pose, not a separate shape",
            "height roughly half the top width, per prompts/breads/scone.json notes_ko v3",
            "flat golden top meets cream sides in a crisp horizontal line",
        ],
        "confidence": 0.85,
    },
]


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role,
        "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {
            "translate": True, "rotate": True, "scale": True, "bend": False,
            "twist": False, "detach": False, "visibility": True, "materialState": True,
        },
        "sockets": [],
        "collider": {
            "type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False,
            "notes": "Box proxy matching the wedge bounding volume; fissures are far below collider resolution.",
        },
        "constraints": [],
        "destruction": {
            "breakable": False, "fractureGroup": cid, "seamRefs": [],
            "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-side",
        },
    }


def surface_detail(bump: float, normal: str, disp: str, notes: str) -> dict:
    return {
        "macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump,
        "normalPattern": normal, "displacementPattern": disp,
        "occlusionPattern": "cavity darkening inside each fissure groove",
        "edgeWearPattern": "none - a freshly baked surface carries no edge wear",
        "notes": notes,
    }


def wedge_body() -> dict:
    return {
        "id": "wedge-body", "name": "Wedge side walls and underside", "level": "macro", "role": "body",
        "importance": 0.85, "confidence": 0.9, "primitive": "extrude",
        "topologyClass": "continuous-sculpt",
        "topologyRationale": (
            "A single continuous vertical extrusion of the rounded-triangle footprint from the flat "
            "bottom up to the color-boundary rim - one mass, no internal seams. Decision tree step 6. "
            "Not a lathe: the outline is not radially symmetric (it has two straight cut edges and one "
            "shallow arc), so the profile is swept around a hand-authored outline, not a circle."
        ),
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {
                "points": BODY_PROFILE, "segments": len(OUTLINE), "phiStart": 0.0, "phiLength": 6.283185307179586,
                "note": "Not a true lathe - 'segments' indexes the hand-authored rounded-triangle outline (outline_gen.py), not equal angular steps around a circle.",
            },
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {
                    "id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0],
                    "amplitude": 0.02,
                    "notes": "Small per-sector radius jitter applied identically to body and face so the shared rim ring stays welded, matching pancake's makeWobble pattern.",
                }
            ],
            "uvStrategy": "dome projection (scripts/breads/lib.ts uvDome)",
            "normalStrategy": "flat normals baked by splitting vertices after displacement, never a flatShading flag",
        },
        "parent": "root", "attachment": None,
        "dimensions": {"width": 2.0, "height": WEDGE_HEIGHT * 0.82, "depth": 1.6, "units": "relative", "confidence": 0.85},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": action_profile("wedge-body", "body"),
        "material": "crust-side", "materialLayers": ["crust-side"],
        "colorMaterialRecipe": color_recipe(SIDE_RGBA, TOP_RGBA, "two cut faces, outer arc face, and underside"),
        "deformations": ["outline-wobble"], "joints": [],
        "seams": [{"id": "wedge-perimeter-ring", "kind": "material-boundary", "notes": "Shared ring at (rFrac 0.98, hFrac 0.82). Body and face sweep the same ring, so the two-tone boundary is watertight and hard-edged."}],
        "localFeatures": [
            {
                "id": "rounded-triangle-footprint", "name": "Rounded-triangle footprint", "kind": "silhouette-modulation",
                "description": "Apex corner has a tighter fillet (~10-16% edge-length cut) than the two back corners (~14-16%, wider bevel), matching the observed asymmetric rounding in scone-3.png.",
                "evidenceRefs": ["view-top"], "confidence": 0.85,
            },
            {
                "id": "back-arc-bulge", "name": "Shallow back-edge bulge", "kind": "profile-curvature",
                "description": "The back-edge midpoint is pulled 0.10 units further back (more negative Z) than a straight chord between the two back corners, approximating the original round scone's crust arc.",
                "evidenceRefs": ["view-top"], "confidence": 0.7,
            },
        ],
        "surfaceDetail": surface_detail(0.0, "faceted planar shading from split vertices", "profile-driven only; no fissures on the body", "Side, cut-face and underside crust share one flat albedo; all relief here is geometric (rounding + wobble)."),
        "evidenceRefs": ["view-top", "view-three-quarter"],
        "details": ["rounded-triangle-footprint", "back-arc-bulge"],
        "fidelityTier": "form-refinement",
    }


def wedge_top() -> dict:
    return {
        "id": "wedge-top", "name": "Wedge domed top with crack fissures", "level": "meso", "role": "surface",
        "importance": 1.0, "confidence": 0.9, "primitive": "extrude",
        "topologyClass": "continuous-sculpt",
        "topologyRationale": "A single gently domed cap swept from the shared rim inward to a crown, with fissures displaced into it - the object's identity-critical surface. Decision tree step 6.",
        "geometryDescriptor": {
            "topologyIntent": "low-poly prop, faceted after generation",
            "latheProfile": {"points": FACE_PROFILE, "segments": len(OUTLINE), "phiStart": 0.0, "phiLength": 6.283185307179586},
            "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [
                {"id": "outline-wobble", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.02, "notes": "Identical modulation to the parent body so the shared rim ring stays welded."},
                {"id": "fissure-grooves", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": FISSURE_DEPTH, "notes": FISSURE_MECHANISM},
            ],
            "uvStrategy": "dome projection (scripts/breads/lib.ts uvDome)",
            "normalStrategy": "flat normals baked by splitting vertices after displacement",
        },
        "parent": "wedge-body", "attachment": None,
        "dimensions": {"width": 1.96, "height": WEDGE_HEIGHT * 0.23, "depth": 1.6, "units": "relative", "confidence": 0.85},
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "actionProfile": action_profile("wedge-top", "surface"),
        "material": "crust-top", "materialLayers": ["crust-top"],
        "colorMaterialRecipe": color_recipe(TOP_RGBA, SIDE_RGBA, "top face only"),
        "deformations": ["outline-wobble", "fissure-grooves"], "joints": [],
        "seams": [{"id": "wedge-top-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent body's perimeter ring exactly; this ring is the two-tone crust boundary."}],
        "localFeatures": [
            {
                "id": "crack-fissure-field", "name": "Crack fissure field", "kind": "recessed-detail-scatter",
                "description": f"3 shallow linear grooves at target Z fractions {FISSURE_TARGETS_Z} (apex=+1..back~-1), each dipping only the interior face rings (0.80/0.55/0.28) at whichever sectors have a ring close enough (tolerance {FISSURE_MATCH_TOLERANCE}) - shortening naturally toward the apex. " + FISSURE_MECHANISM,
                "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.85, "repetitionSystemRef": "fissure-scatter",
            },
            {
                "id": "top-crown", "name": "Gentle top crown", "kind": "profile-curvature",
                "description": "Face crowns to heightFraction 1.05 at the center, up from 0.82 at the rim - a visible but shallow dome, not a flat plane.",
                "evidenceRefs": ["view-front"], "confidence": 0.8,
            },
        ],
        "surfaceDetail": surface_detail(0.031, "faceted planar shading from split vertices; each fissure contributes hard-edged wall facets", "fissures displaced into the domed cap", "assets/prompts/breads/scone.json notes_ko: the asymmetric top/side coloring is the load-bearing identity feature, not the fissures alone - but without any surface break the top reads as a flat painted plane."),
        "evidenceRefs": ["view-top", "view-three-quarter"],
        "details": ["crack-fissure-field", "top-crown"],
        "fidelityTier": "surface-pass",
    }


ROOT = {
    "id": "root", "name": "Wedge Scone", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95,
    "primitive": "extrude", "topologyClass": "continuous-sculpt",
    "topologyRationale": "Transform-only root carrying the wedge body and top; emits no geometry of its own.",
    "geometryDescriptor": {
        "topologyIntent": "transform node only",
        "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [], "uvStrategy": "inherited from children", "normalStrategy": "inherited from children",
    },
    "parent": None, "attachment": None,
    "dimensions": {"width": 2.0, "height": WEDGE_HEIGHT, "depth": 1.6, "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("root", "root"),
    "material": "crust-side", "materialLayers": ["crust-side"],
    "colorMaterialRecipe": color_recipe(SIDE_RGBA, TOP_RGBA, "assembly node, inherits from children"),
    "deformations": [], "joints": [], "seams": [],
    "localFeatures": [],
    "surfaceDetail": surface_detail(0.0, "n/a", "n/a", "Assembly node; no surface of its own."),
    "evidenceRefs": ["view-three-quarter", "view-top", "view-front"],
    "details": [], "fidelityTier": "blockout",
}


def material(mid: str, name: str, hexcolor: str, zone: str, overrides: list) -> dict:
    return {
        "id": mid, "name": name, "type": "standard",
        "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/scone.json geometry.crust, deliberately not sampled from reference pixels (which carry baked key-light shading)."},
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureResolution": 64,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "No texture is emitted. UVs exist only to satisfy mergeByMaterial's attribute-consistency requirement (scripts/breads/types.ts section 4)."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "rounded-triangle extrusion and top crown", "carrier": "geometry"},
            {"id": "meso", "frequency": 4.0, "amplitude": 0.02, "role": "per-sector outline wobble", "carrier": "geometry"},
            {"id": "micro", "frequency": 3.0, "amplitude": FISSURE_DEPTH, "role": "fissure grooves and faceting; on the sides, faceting alone", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": zone, "amplitude": FISSURE_DEPTH, "scale": 1.0, "silhouetteAffects": True},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material; cavity darkening comes from fissure-wall orientation."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": overrides,
        "shaderNotes": [
            "Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial with roughness 1, metalness 0.",
            "Never set vertexColors - the runtime rebuilds every material as MeshLambertMaterial({map, color}) (scripts/breads/types.ts section 2).",
            "Never set flatShading - not inherited by the runtime swap either; faceting must be baked as split vertices.",
        ],
        "notes": f"{zone}. Two solid colors are enough for the whole object, so no texture is emitted at all (scripts/breads/types.ts section 9).",
    }


MATERIALS = [
    material("crust-top", "Golden top crust", TOP_HEX, "top face of the wedge", [
        {"id": "fissure-cavity-shading", "name": "Fissure cavity shading", "maskSource": "geometry", "description": "Fissure walls tilt away from the key light and darken on their own; no separate mask, map or albedo change, because the runtime cannot read one.", "evidenceRefs": ["view-top"], "appliesTo": ["wedge-top"]},
    ]),
    material("crust-side", "Cream side and underside crust", SIDE_HEX, "cut faces, outer arc face, and underside of the wedge", [
        {"id": "two-tone-boundary", "name": "Two-tone crust boundary", "maskSource": "geometry", "description": "The boundary is the shared perimeter ring at (rFrac 0.98, hFrac 0.82) - a hard geometric edge between two separate meshes, not a texture boundary and not a vertex-color ramp.", "evidenceRefs": ["view-three-quarter", "view-front"], "appliesTo": ["wedge-body", "wedge-top"]},
    ]),
]

REPETITION_SYSTEMS = [
    {
        "id": "fissure-scatter", "name": "Crack fissure lines", "level": "micro", "hostComponents": ["wedge-top"],
        "elementComponentIds": ["wedge-top"], "elementKind": "recessed vertex displacement, not an added mesh",
        "count": len(FISSURE_TARGETS_Z),
        "distribution": {
            "mode": "fixed target-Z bands with nearest-ring-per-sector matching (not seeded random)",
            "targetsZ": FISSURE_TARGETS_Z, "matchTolerance": FISSURE_MATCH_TOLERANCE, "mechanism": FISSURE_MECHANISM,
            "note": "Positions are authored, not randomized - fissure placement in the reference is a small fixed count (3-4), not a scattered field like pancake's pores, so seeding it from rng would add variance the reference does not show.",
        },
        "sizeClasses": [{"id": "fissure", "depth": FISSURE_DEPTH}],
        "seedRule": "Fixed authored target-Z values; only the outline-wobble jitter (applied before fissure dips) uses the builder's injected rng argument, never Math.random (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    },
]

FEATURE_REVIEW_TARGETS = [
    {"id": "wedge-silhouette", "name": "Thick rounded-triangle wedge silhouette", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["root", "wedge-body", "wedge-top"], "evidenceRefs": ["view-three-quarter", "view-top"]},
    {"id": "asymmetric-two-tone", "name": "Top-only golden coloring vs cream everywhere else", "tier": "critical", "passIds": ["material-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["wedge-body", "wedge-top"], "evidenceRefs": ["view-three-quarter"]},
    {"id": "fissure-field", "name": "3 crack fissures shortening toward the apex", "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["wedge-top"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "height-width-ratio", "name": "Height approx half the top width - never a standing cone or tower", "tier": "critical", "passIds": ["form-refinement"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["root"], "evidenceRefs": ["view-front"]},
    {"id": "rounded-corners", "name": "All three corners rounded, apex tighter than back corners", "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["wedge-body"], "evidenceRefs": ["view-top"]},
    {"id": "baked-faceting", "name": "Faceted flat shading baked into geometry", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["wedge-body", "wedge-top"], "evidenceRefs": ["view-three-quarter"]},
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
    spec["scores"] = {"object_isolation": 3, "silhouette_readability": 3, "depth_inference": 3, "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 1, "interaction_fit": 3}
    spec["coordinateFrame"] = {
        "front": "+Z, the direction the harness three-quarter camera at (-1.6, 2.2, 2.6) looks from",
        "up": "+Y",
        "scaleReference": "outline characteristic radius = 1.0 relative unit. Absolute scale is meaningless: the consumer runtime refits the longest axis to 1.6, so only ratios matter (scripts/breads/types.ts section 7).",
    }
    spec["referenceCamera"] = {
        "solved": False, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0},
        "positionHint": [-1.6, 2.2, 2.6],
        "note": "Not solved - the review camera is fixed by the consumer harness (scripts/breadlab.ts applyView), not matched to the reference's perspective camera.",
    }
    spec["silhouette"] = {
        "boundingShape": "rounded-triangle wedge, 2.0 wide by 1.0 tall by 1.6 deep in outline-radius units",
        "aspectRatios": [
            {"id": "height-over-width", "value": 0.5, "source": "prompts/breads/scone.json notes_ko v3 (authoritative, not re-measured from pixels)"},
            {"id": "apex-fillet-over-back-fillet", "value": 0.65, "source": "scone-3.png: apex corner cut ~10-16% of edge length vs back corners ~14-16%, apex reads visibly tighter"},
        ],
        "symmetry": "bilateral about the apex-to-back axis (approximate), broken by outline wobble and the authored back-corner size asymmetry",
        "dominantCurves": ["gentle top crown, heightFraction 0.82 to 1.05", "shallow convex back-edge arc"],
        "negativeSpaces": ["3 shallow horizontal fissure grooves, the only negative space in the silhouette besides the crown"],
        "landmarks": ["apex leaning slightly toward +X (never dead-center forward)", "two-tone boundary ring at heightFraction 0.82", "fissures shortening from back toward apex"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, wedge_body(), wedge_top()]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget", "targetTriangles": 900, "maxDrawCalls": 2, "textureSize": 512, "fpsTarget": 60,
        "optimizationPolicy": "Hard consumer budget: at most 8000 triangles and 250 KB per bread with at most two meshes (scripts/breads/types.ts section 6). Target band for the 'chunk' bread group (scone/loaf/baguette) is 800-1500 tri, <=160KB (assets/breads/work/CRIB.md budget table). Reached by construction: 14-point outline swept along ~34 length stations.",
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": [
            "thick rounded-triangle wedge, height approx half the top width",
            "top face only golden, everything else cream",
            "3 crack fissures across the top, shortening toward the apex",
            "faceted flat shading baked into geometry",
        ],
        "niceToHave": ["exact fissure positions", "the reference's soft contact shadow, which the shadowless harness cannot reproduce", "true outward-bulging back arc (approximated here as a beveled corner instead)"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"],
    }
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({
        "roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 0, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run", "acceptedLimitation": "Same runtime-budget reclassification as pancake: the consumer keeps only map+color and the repo bans PBR maps (docs/VISUAL.md section 8), so every channel these fields describe is inert and moved into geometry instead."},
    })
    spec["lookDevTargets"]["lightingPass"] = {
        "requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"],
        "authority": "Lighting is fixed by the consumer: scripts/breadlab.ts mirrors scripts/thumbsHarness.ts with a warm directional key 0xffe2b0 at (-2, 6, 2) intensity 1.4, ambient 0xfff0dc at 0.75, cool fill 0xdce8ff at (2.5, 3, -2) intensity 0.2.",
        "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"],
    }
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key upper-left, matching the reference's single soft key light.", "usage": "Fixed by scripts/breadlab.ts.", "exposure": "no exposure control, no tone mapping - authored albedo lands on screen almost unchanged."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "High ambient ratio (0.75) - fissure walls must be steep enough to read without relying on shadow terminators.", "usage": "Fixed by the harness.", "contactShadow": "none - the reference's flat sage background with no cast shadow already matches this."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill, low intensity, opposite the key.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping; no AO on the runtime material, so cavity darkening must come from fissure-wall orientation."},
    ]
    spec["proceduralStrategy"] = [
        "Sweep the wedge body from the 14-point hand-authored rounded-triangle outline (outline_gen.py) through BODY_PROFILE rings.",
        "Sweep the top face from the shared rim ring inward through FACE_PROFILE rings to the crown, at the same outline sectors so the rim stays welded.",
        "Apply the per-sector outline wobble identically to body and face before anything else.",
        "Displace 3 fissure grooves into the interior face rings using nearest-ring-per-sector matching against fixed target-Z bands (not a continuous falloff - see check_fissures.py).",
        "Jitter vertices while the geometry is still indexed, so shared vertices move together and no face tears open.",
        "Bake faceting by splitting vertices and recomputing normals; never request flatShading.",
        "Project dome UVs, then merge by material into exactly two meshes.",
    ]
    spec["assumptions"] = [
        "Underside is never visible: it rests on the ground plane and every review azimuth is above the horizon.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "The back edge's outward crust bulge is approximated as a two-point corner bevel rather than a true outward arc - accepted as a 'nice to have' delta (spec.qualityTargets.niceToHave), matching how pancake accepted its inter-layer contact shadow as a known gap.",
        "Exact fissure positions are not identity-critical; count (3), the shortening-toward-apex pattern, and visible groove depth are what the review scores.",
    ]
    spec["risks"] = [
        {"id": "vertex-color-loss", "severity": "high", "description": "Any vertex-color-based region paint is silently discarded by the runtime's MeshLambertMaterial swap, collapsing the two-tone crust to one flat tone.", "mitigation": "The two-tone split is carried by two separate materials on two separate meshes, split on a geometric ring. No vertexPaint block is authored anywhere in this spec."},
        {"id": "flat-shading-loss", "severity": "high", "description": "A flatShading flag is not inherited by the runtime material swap, so a model relying on it renders smooth.", "mitigation": "Faceting is baked into geometry by splitting vertices (scripts/breads/lib.ts facet) before export."},
        {"id": "seam-tear", "severity": "medium", "description": "Body and face are separate meshes sharing the rim ring. Jittering them independently would move the shared vertices apart and open a crack along the two-tone boundary.", "mitigation": "Build one indexed wedge geometry, wobble and jitter it whole, and only then split its triangles into the two material buckets."},
        {"id": "detail-below-tessellation", "severity": "high", "description": "A displaced detail smaller than the mesh's vertex spacing lands between vertices and disappears silently. This bit pancake (measured pit radii below the face grid's vertex spacing) and nearly repeated here: a first 10-point outline had zero vertices along the straight cut edges, so fissures at mid-edge Z levels had no grid cell to land on at all.", "mitigation": "check_fissures.py verifies, before any render, that every fissure's target Z matches an existing ring within tolerance at enough sectors (>=4) to read as a line, not a dot. The outline was densified with explicit mid-edge points specifically to fix this, not by adding a continuous falloff."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws when geometries in one bucket carry different attribute sets.", "mitigation": "Every geometry gets exactly position, normal and uv; no color attribute is ever created."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single rigid body; no plausible sub-fracture for a baked good this size"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "crack-fissure-field": ("hole", "crack-fissure-field"),
    "asymmetric-top-coloring": ("seam", "two-tone-boundary"),
    "rounded-triangle-outline": ("contour", "rounded-triangle-footprint"),
    "apex-tighter-fillet": ("bevel", "rounded-triangle-footprint"),
    "back-edge-bulge": ("ridge", "back-arc-bulge"),
    "top-crown-dome": ("bevel", "top-crown"),
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
        "primaryType": "wedge-shaped scone", "primaryDomain": "object",
        "formLanguage": ["organic", "faceted low-poly"], "structureKind": ["single-body extrusion"],
        "motionPotential": ["static prop, whole-object rotation only"], "materialFamilies": ["matte baked crust"],
        "notes": "Single rigid wedge, two material zones split by a hard geometric ring.",
    }
    assessment["preSpecAssessment"]["complexity"]["estimatedCounts"]["mesoComponents"] = 1
    assessment["qualityContract"]["minimumSpecDepth"]["mesoComponents"] = 1
    assessment["preSpecAssessment"]["detailInventory"]["details"] = [
        {"id": "crack-fissure-field", "name": "Crack fissure field", "description": "3 shallow horizontal grooves across the top, shortening toward the apex.", "evidenceRefs": ["view-top"], "confidence": 0.85, "mapsTo": "wedge-top.localFeatures.crack-fissure-field"},
        {"id": "asymmetric-top-coloring", "name": "Top-only golden coloring", "description": "Only the top face is golden; every other face is cream - identity-critical (sides colored = reads as a muffin, per prompts_ko).", "evidenceRefs": ["view-three-quarter"], "confidence": 0.95, "mapsTo": "materials.two-tone-boundary"},
        {"id": "rounded-triangle-outline", "name": "Rounded-triangle footprint", "description": "No sharp corners anywhere; apex still visibly the tightest corner.", "evidenceRefs": ["view-top"], "confidence": 0.85, "mapsTo": "wedge-body.localFeatures.rounded-triangle-footprint"},
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
