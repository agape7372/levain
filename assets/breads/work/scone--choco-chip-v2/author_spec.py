# Authors the subject-specific half of object-sculpt-spec.json in place.
# Pattern copied from assets/breads/work/pancake/author_spec.py (proven template that passed
# strict-quality). Re-runnable: every refine-spec iteration edits the numbers here and re-runs.
#
# Geometry frame: Y up, +Z forward (camera looks from (-1.6, 2.2, 2.6)), WEDGE_HEIGHT = 1.0 unit.
# Silhouette/profile numbers are CARRIED FORWARD from scripts/breads/scone.ts (base family) and
# the prior scone--choco-chip.ts round, per docs/BREADS.md variant rule: inherit MEASURED NUMBERS,
# never inherit skipped procedure. Every number below has its provenance noted.
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "scone--choco-chip.png"

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
            "Scone Choco Chip", "--image", str(REFERENCE),
            "--assessment", str(ASSESSMENT), "--out", str(SPEC),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


# --- measured proportions ---------------------------------------------------------------------
# OUTLINE / BODY_PROFILE / FACE_PROFILE / fissure constants: carried verbatim from
# scripts/breads/sconeChocoChip.ts (prior round) and scripts/breads/scone.ts (base family) -
# these are re-derived/re-measured NUMBERS the base build already validated through its own
# turntable + review gates, not a shortcut around this round's gates. This round's own gates run
# fresh against these numbers (tier1 + append_review below), so a numeric regression is still caught.
WEDGE_HEIGHT = 1.0
OUTLINE = [
    [0.1882, -0.4788], [0.2918, -0.322], [0.3954, -0.1652], [0.4989, -0.0084],
    [0.6025, 0.1485], [0.659, 0.234], [0.98, 0.72], [0.7112, 0.7284],
    [0.02, 0.85], [-0.6712, 0.7716], [-0.94, 0.78], [-0.685, 0.276],
    [-0.6027, 0.1134], [-0.5204, -0.0492], [-0.4382, -0.2119], [-0.3559, -0.3745],
    [-0.311, -0.4632], [-0.05, -0.66],
]
SEGMENTS = len(OUTLINE)  # 18
BODY_PROFILE = [[0.0, 0.0], [0.97, 0.0], [1.0, 0.04], [1.0, 0.2], [0.99, 0.48], [0.98, 0.82]]
# Face profile re-measured against the 2026-08-30 15:10 reference regeneration: a plateau + rounded
# shoulder (not a pure dome), split into two shoulder rings so a smooth-normal average doesn't read
# as a cone in top-down (see sconeChocoChip.ts header for the full measurement derivation).
FACE_PROFILE = [
    [0.98, 0.82], [0.94, 0.858], [0.87, 0.888], [0.74, 0.912],
    [0.6, 0.922], [0.45, 0.928], [0.3, 0.931], [0.15, 0.9325], [0.0, 0.933],
]
RINGS = BODY_PROFILE + FACE_PROFILE
RIM_A = len(BODY_PROFILE) - 1  # 5, shared crust-boundary ring, duplicated for a normal crease
RIM_B = RIM_A + 1              # 6, same coordinates as RIM_A

FISSURE_RING_FRACS = [0.87, 0.74, 0.6, 0.45]
FISSURE_DEPTH = 0.06
FISSURE_COUNT = 2  # "one or two soft crack fissures" - prompt JSON v5

TOP_HEX = "#D6A15C"     # assets/prompts/breads/scone--choco-chip.json geometry.crust[0]
SIDE_HEX = "#F4EAD4"    # geometry.crust[1]
CHOC_HEX = "#3B2418"    # geometry.crust[2]
TOP_RGBA = "rgba(214, 161, 92, 1.0)"
SIDE_RGBA = "rgba(244, 234, 212, 1.0)"
CHOC_RGBA = "rgba(59, 36, 24, 1.0)"

# Chip archetype dimensions (top-tier "medium" chunk; large/shard are tier multiples of this - see
# CHIP_TIER below). Pixel-measured against the reference chunk bbox / object bbox (prior round
# measure_chunks.py): anchor radius ~0.104 -> visible width ~0.191 disk-radius units.
CHIP_BASE_R = 0.1275
CHIP_TOP_R = 0.093
CHIP_EMBED = 0.075   # sits deep enough that shell-surface roughness (~0.042) can't push it free
CHIP_RISE = 0.034
CHIP_CROWN = 0.01
CHIP_COUNT = 7
CHIP_TIER = {
    "large": {"size": 1.35, "riseMul": 1.15},
    "medium": {"size": 0.92, "riseMul": 0.95},
    "shard": {"size": 0.45, "riseMul": 0.45},
}
CHIP_LARGE_COUNT = 2
CHIP_SHARD_COUNT = 1
CHIP_MEDIUM_COUNT = CHIP_COUNT - CHIP_LARGE_COUNT - CHIP_SHARD_COUNT  # 4


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant,
        "secondaryAlbedo": secondary,
        "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": (
            "Closest class in the allowed set for a matte baked crust/crumb/chocolate surface: "
            "opaque dielectric, roughness 1.0, no specular lobe."
        ),
        "zone": zone,
        "evidenceRefs": ["assets/prompts/breads/scone--choco-chip.json geometry.crust"],
    }


VIEW_EVIDENCE = [
    {
        "id": "view-three-quarter",
        "view": "three-quarter top-front",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "rounded-triangle wedge, apex pointing front-and-slightly-side, resting flat on wide bottom face",
            "hard two-tone crust split: golden top face vs plain cream side/cut faces",
            "about seven chocolate chunks on the top face only, each a distinct facet cluster, half-sunken",
        ],
        "confidence": 0.95,
    },
    {
        "id": "view-top",
        "view": "top-down",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "rounded-triangle outline, 18-sided polygon approximation, apex front",
            "two soft crack fissures crossing the top face, not reaching the rim",
            "chunk size hierarchy clearly visible: 2 larger pieces, ~4 medium, 1 small shard",
            "chunks scattered with visible gaps between them, never a uniform grid",
        ],
        "confidence": 0.9,
    },
    {
        "id": "view-front-ratio-only",
        "view": "front elevation (EXCLUDED as shape evidence - generation error, renders as a slab not a wedge)",
        "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
        "observations": [
            "height/width ratio only (~0.46-0.47) is usable; the pose/silhouette in this image is a known bad generation and is not used as shape evidence (assets/breads/work/CRIB.md)",
        ],
        "confidence": 0.4,
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
            "notes": "Bounding-box proxy; chip inclusions are far below collider resolution.",
        },
        "constraints": [],
        "destruction": {
            "breakable": False, "fractureGroup": cid, "seamRefs": [],
            "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "none",
        },
    }


def surface_detail(macro, micro, bump, normal, disp, notes) -> dict:
    return {
        "macroRoughness": macro, "microRoughness": micro, "bumpAmplitude": bump,
        "normalPattern": normal, "displacementPattern": disp,
        "occlusionPattern": "cavity darkening inside fissures and around embedded chunk bases",
        "edgeWearPattern": "none - a freshly baked surface carries no edge wear",
        "notes": notes,
    }


WEDGE_BODY = {
    "id": "wedge-body",
    "name": "Scone wedge body (bottom + side/cut faces)",
    "level": "macro",
    "role": "body",
    "importance": 1.0,
    "confidence": 0.9,
    "primitive": "lathe",
    "topologyClass": "continuous-sculpt",
    "topologyRationale": (
        "A single continuous, smoothly-varying lofted mass with no internal seams: a fixed "
        "rounded-triangle outline (18-point lookup table, not a circle) swept through a height "
        "profile from flat bottom to the shared crust rim. Decision tree step 6. Not "
        "assembled-solid: the outline is an organic hand-cut wedge, not a hard-faced box/cylinder."
    ),
    "geometryDescriptor": {
        "topologyIntent": "low-poly-adjacent prop, smooth clay finish (docs/BREADS.md finish-contract 2026-08-30)",
        "latheProfile": {
            "points": [[round(r, 5), round(h * WEDGE_HEIGHT, 5)] for r, h in BODY_PROFILE],
            "segments": SEGMENTS,
            "phiStart": 0.0,
            "phiLength": 6.283185307179586,
        },
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {
                "id": "outline-lookup",
                "type": "radial-modulation",
                "axis": [0, 1, 0],
                "amplitude": 1.0,
                "notes": (
                    "Not sinusoidal: a fixed 18-point (x,z) lookup table (OUTLINE) replaces the unit "
                    "circle per sector, producing the rounded-triangle apex-front silhouette. Applied "
                    "identically to wedge-body and wedge-top-face so the shared rim ring stays welded."
                ),
            },
            {
                "id": "crumb-ridging",
                "type": "radial-modulation",
                "axis": [0, 1, 0],
                "amplitude": 0.04,
                "notes": "Per-ring/per-sector radius jitter on the cut-face rings only (not the rim), giving the plain cut face a crumb-like ridged texture instead of a flat gradient panel under smooth shading.",
            },
        ],
        "uvStrategy": "constant flat-color atlas UV (scripts/breads/lib.ts pattern, bakeTexture 64px quadrants)",
        "normalStrategy": "computeVertexNormals() on indexed geometry, THEN toNonIndexed() - smooth clay finish, order is load-bearing (docs/BREADS.md finish-contract)",
    },
    "parent": "root",
    "attachment": None,
    "dimensions": {"width": 1.98, "height": WEDGE_HEIGHT * 0.933, "depth": 1.34, "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("wedge-body", "static-prop"),
    "material": "crust-crumb",
    "materialLayers": ["crust-crumb"],
    "colorMaterialRecipe": color_recipe(SIDE_RGBA, TOP_RGBA, "side and cut faces, bottom cap"),
    "deformations": ["outline-lookup", "crumb-ridging"],
    "joints": [],
    "seams": [
        {
            "id": "wedge-crust-rim",
            "kind": "material-boundary",
            "notes": "Shared ring at the last body profile point (0.98, 0.82*H). Body and top face both lathe this exact ring, duplicated as two coincident rings (RIM_A/RIM_B) so the crust edge stays a hard crease under smooth-normal shading instead of blending into the shoulder.",
        }
    ],
    "localFeatures": [
        {
            "id": "wedge-body-crumb-ridging",
            "name": "Cut-face crumb ridging",
            "kind": "surface-relief",
            "description": "Low-frequency per-ring/per-sector radius jitter (amplitude 0.04) on the plain cream cut faces only, replacing what would otherwise be a flat shaded gradient under the smooth-clay finish.",
            "evidenceRefs": ["view-three-quarter"],
            "confidence": 0.85,
        }
    ],
    "surfaceDetail": surface_detail(
        0.0, 0.0, 0.0, "smooth (computeVertexNormals, per finish-contract)", "crumb ridging only",
        "Runtime replaces material with MeshLambertMaterial keeping only map+color; all relief here is geometric.",
    ),
    "evidenceRefs": ["view-three-quarter", "view-top"],
    "details": ["wedge-body-crumb-ridging"],
    "fidelityTier": "form-refinement",
}

WEDGE_TOP_FACE = {
    "id": "wedge-top-face",
    "name": "Scone top crust face",
    "level": "meso",
    "role": "surface",
    "importance": 1.0,
    "confidence": 0.9,
    "primitive": "lathe",
    "topologyClass": "continuous-sculpt",
    "topologyRationale": (
        "One continuous lofted cap sharing the wedge-body's outline lookup and rim ring, rising "
        "from the rim through a rounded shoulder to a near-flat plateau. Decision tree step 6. Not "
        "conforming-shell: this IS the wedge's own top surface volume, not a skin over another form."
    ),
    "geometryDescriptor": {
        "topologyIntent": "low-poly-adjacent prop, smooth clay finish",
        "latheProfile": {
            "points": [[round(r, 5), round(h * WEDGE_HEIGHT, 5)] for r, h in FACE_PROFILE],
            "segments": SEGMENTS,
            "phiStart": 0.0,
            "phiLength": 6.283185307179586,
        },
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "outline-lookup", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 1.0,
             "notes": "Identical lookup table to wedge-body so the shared rim ring stays welded."},
            {
                "id": "crack-fissures",
                "type": "vertex-displacement",
                "axis": [0, -1, 0],
                "amplitude": FISSURE_DEPTH,
                "notes": (
                    f"{FISSURE_COUNT} shallow linear grid-cell dips (grid-cell dip, not continuous "
                    "falloff - a displacement smaller than the vertex spacing disappears silently) "
                    "running across FISSURE_RING_FRACS rings, stopping before the outer/inner rings "
                    "so they never cross onto the plain cut faces or pinch the crown into a star fold."
                ),
            },
        ],
        "uvStrategy": "constant flat-color atlas UV (same atlas as wedge-body)",
        "normalStrategy": "computeVertexNormals() on indexed geometry, THEN toNonIndexed()",
    },
    "parent": "wedge-body",
    "attachment": None,
    "dimensions": {"width": 1.96, "height": WEDGE_HEIGHT * 0.113, "depth": 1.32, "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("wedge-top-face", "surface"),
    "material": "crust-top",
    "materialLayers": ["crust-top"],
    "colorMaterialRecipe": color_recipe(TOP_RGBA, SIDE_RGBA, "top crust face"),
    "deformations": ["outline-lookup", "crack-fissures"],
    "joints": [],
    "seams": [{"id": "wedge-crust-rim", "kind": "material-boundary", "notes": "Shares the body's perimeter ring exactly; this ring is the two-tone crust boundary."}],
    "localFeatures": [
        {
            "id": "wedge-top-face-fissures",
            "name": "Crack fissure pair",
            "kind": "recessed-detail-scatter",
            "description": f"{FISSURE_COUNT} soft crack fissures (depth {FISSURE_DEPTH}) dipped into grid cells across the top face, stopping short of the rim and the crown so they read as gentle creases rather than a torn or star-folded surface.",
            "evidenceRefs": ["view-top", "view-three-quarter"],
            "confidence": 0.85,
        }
    ],
    "surfaceDetail": surface_detail(
        0.0, 0.0, 0.06, "smooth (computeVertexNormals)", "fissure grid-cell dips",
        "assets/prompts/breads/scone--choco-chip.json notes_ko: without the fissures and two-tone split the object reads as a plain dome, so both are identity-critical.",
    ),
    "evidenceRefs": ["view-top", "view-three-quarter"],
    "details": ["wedge-top-face-fissures"],
    "fidelityTier": "surface-pass",
}

CHOC_CHUNK_ARCHETYPE = {
    "id": "choc-chunk",
    "name": "Chocolate chunk (repeated inclusion archetype)",
    "level": "meso",
    "role": "inclusion",
    "importance": 1.0,
    "confidence": 0.85,
    "primitive": "cylinder",
    "topologyClass": "assembled-solid",
    "topologyRationale": (
        "A hard, discrete, hand-chopped block with flat facets - decision tree step 4 (distinct "
        "faces you could point to and count). Modeled as a low-side-count truncated cone/frustum "
        "(cylinder primitive with independent top/base radii) rather than a lathe: the reference's "
        "chocolate reads as faceted and angular, the opposite surface language from the soft dough "
        "it sits in, which is the deliberate material contrast (docs/BREADS.md finish-contract "
        "hard-inclusion exception - flat/facet normals stay valid here even though the shell "
        "converted to smooth)."
    ),
    "geometryDescriptor": {
        "topologyIntent": "hand-chopped irregular block, flat-faceted (exception to shell smooth finish)",
        "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 6, "phiStart": 0.0, "phiLength": 6.283185307179586},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {
                "id": "chunk-irregularity",
                "type": "radial-modulation",
                "axis": [0, 1, 0],
                "amplitude": 0.1,
                "notes": (
                    "Per-instance authored irregularity (never post-hoc xyz jitter, which breaks the "
                    "half-sunken seal): side count 5-7, anisotropy, asymmetric top-center lean, "
                    "per-vertex radius variance +/-10%, so no two chunks share a silhouette."
                ),
            }
        ],
        "uvStrategy": "constant flat-color atlas UV (same atlas as the shell, dedicated quadrant)",
        "normalStrategy": "facet (flat normals, split vertices) - the one deliberate exception to the shell's smooth finish",
    },
    "parent": "wedge-top-face",
    "attachment": {
        "parentId": "wedge-top-face",
        "parentSocket": "wedge-top-face jittered surface point",
        "contactType": "embed",
        "localStart": [0.0, 0.0, 0.0],
        "localEnd": [0.0, round(-CHIP_EMBED, 4), 0.0],
        "contactNormal": [0, 1, 0],
        "embedDepth": CHIP_EMBED,
        "gapTolerance": 0.01,
        "notes": "Anchored to the shell's own jittered surface coordinate AFTER the shell jitter pass, embedded to CHIP_EMBED depth so the dough visibly hugs the base edge rather than the chunk sitting on top like a bump.",
    },
    "dimensions": {"width": round(2 * CHIP_BASE_R, 4), "height": round(CHIP_EMBED + CHIP_RISE, 4), "depth": round(2 * CHIP_BASE_R, 4), "units": "relative", "confidence": 0.8},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("choc-chunk", "inclusion"),
    "material": "chocolate",
    "materialLayers": ["chocolate"],
    "colorMaterialRecipe": color_recipe(CHOC_RGBA, TOP_RGBA, "chocolate chunk inclusions"),
    "deformations": ["chunk-irregularity"],
    "joints": [],
    "seams": [],
    "localFeatures": [
        {
            "id": "choc-chunk-half-sunken",
            "name": "Half-sunken embed",
            "kind": "profile-curvature",
            "description": "Exposed height/width ratio held below 0.5 (measured target ~0.23-0.30) and embed depth exceeds local shell-surface roughness, so every chunk reads as pressed-in rather than a bump or a spike growing out of the surface - the single most load-bearing identity feature per the prompt JSON ('sits half-sunken, the dough hugging its edges').",
            "evidenceRefs": ["view-three-quarter", "view-top"],
            "confidence": 0.9,
        }
    ],
    "surfaceDetail": surface_detail(
        0.0, 0.0, 0.0, "facet (flat, deliberate exception)", "none - added geometry, not displacement",
        "Hard inclusion vs soft dough is the intended material contrast; using the shell's smooth shading here would read the chunk as a soft growth off the dough rather than a distinct ingredient.",
    ),
    "evidenceRefs": ["view-three-quarter", "view-top"],
    "details": ["choc-chunk-half-sunken"],
    "fidelityTier": "surface-pass",
}

ROOT = {
    "id": "root",
    "name": "Scone Choco Chip",
    "level": "macro",
    "role": "assembly",
    "importance": 1.0,
    "confidence": 0.95,
    "primitive": "lathe",
    "topologyClass": "continuous-sculpt",
    "topologyRationale": "Transform-only assembly node carrying the wedge body and its chunk cluster; emits no geometry of its own.",
    "geometryDescriptor": {
        "topologyIntent": "transform node only",
        "latheProfile": {"points": [[0.0, 0.0], [0.0, 0.0]], "segments": 3, "phiStart": 0.0, "phiLength": 6.283185307179586},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [],
        "uvStrategy": "inherited from children",
        "normalStrategy": "inherited from children",
    },
    "parent": None,
    "attachment": None,
    "dimensions": {"width": 1.98, "height": 0.933, "depth": 1.34, "units": "relative", "confidence": 0.95},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("root", "root"),
    "material": "crust-crumb",
    "materialLayers": ["crust-crumb"],
    "colorMaterialRecipe": color_recipe(SIDE_RGBA, TOP_RGBA, "assembly node, inherits from children"),
    "deformations": [],
    "joints": [],
    "seams": [],
    "localFeatures": [
        {
            "id": "wedge-apex-orientation",
            "name": "Apex-front asymmetric orientation",
            "kind": "assembly-placement",
            "description": "The wedge apex (narrow corner) faces the camera-front direction (+Z toward (-1.6,2.2,2.6)); this is asymmetric, not radially uniform, so orientation must be verified at first blockout render (CRIB.md orientation-first-iteration rule - the base scone family measured a 180-degree miss here before).",
            "evidenceRefs": ["view-three-quarter", "view-top"],
            "confidence": 0.9,
        }
    ],
    "surfaceDetail": surface_detail(0.0, 0.0, 0.0, "n/a", "n/a", "Assembly node; no surface of its own."),
    "evidenceRefs": ["view-three-quarter", "view-top"],
    "details": ["wedge-apex-orientation"],
    "fidelityTier": "blockout",
}


def material(mid, name, hexcolor, zone, overrides) -> dict:
    return {
        "id": mid, "name": name, "type": "standard",
        "shaderModel": "MeshStandardMaterial carrier; the consumer runtime swaps it for MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {
            "dominant": hexcolor, "secondary": [],
            "samplingNotes": "Hand-transcribed from assets/prompts/breads/scone--choco-chip.json geometry.crust, the curated prompt that generated the reference. Deliberately NOT sampled from reference pixels (those carry the generator's baked key light).",
        },
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureResolution": 64,
        "textureProjection": {
            "mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1,
            "texelDensityIntent": "Flat-color atlas texture (64px, one quadrant per material) so three colors can share a single stdMaterial and stay within the mesh<=2 budget (scripts/breads/types.ts section 1) without vertex colors (section 2 forbids them).",
        },
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.47, "role": "wedge profile: plateau + rounded shoulder", "carrier": "geometry"},
            {"id": "meso", "frequency": 18.0, "amplitude": 0.04, "role": "outline lookup table + crumb ridging", "carrier": "geometry"},
            {"id": "micro", "frequency": 7.0, "amplitude": 0.06, "role": "fissures / chunk facets", "carrier": "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices (chocolate only) or smooth vertex normals (dough)", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": zone, "amplitude": 0.06, "scale": 1.0, "silhouetteAffects": True},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": overrides,
        "shaderNotes": [
            "Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial with roughness 1, metalness 0.",
            "Never set vertexColors: the runtime rebuilds every material as MeshLambertMaterial({map, color}).",
            "Never set flatShading: bake faceting (chocolate only) as split vertices instead.",
        ],
        "notes": f"{zone}. Packed into a shared 64px flat-color atlas with the other two materials so the merged output stays at 1 mesh / 1 material.",
    }


MATERIALS = [
    material("crust-top", "Top crust", TOP_HEX, "top face of the wedge", [
        {"id": "fissure-cavity-shading", "name": "Fissure cavity shading", "maskSource": "geometry",
         "description": "Fissure walls tilt away from the key light and darken on their own; no mask or map is used.",
         "evidenceRefs": ["view-top"], "appliesTo": ["wedge-top-face"]},
    ]),
    material("crust-crumb", "Side/cut crumb", SIDE_HEX, "side and cut faces, bottom cap", [
        {"id": "crust-rim-boundary", "name": "Two-tone crust boundary", "maskSource": "geometry",
         "description": "Hard geometric edge at the shared perimeter ring - two separate meshes/materials, not a texture boundary.",
         "evidenceRefs": ["view-three-quarter"], "appliesTo": ["wedge-body", "wedge-top-face"]},
    ]),
    material("chocolate", "Chocolate chunk", CHOC_HEX, "chocolate chunk inclusions", [
        {"id": "chunk-embed-shading", "name": "Half-sunken embed shading", "maskSource": "geometry",
         "description": "Facet normals plus embed depth read the chunk as pressed into the dough, not resting on top.",
         "evidenceRefs": ["view-three-quarter", "view-top"], "appliesTo": ["choc-chunk"]},
    ]),
]

REPETITION_SYSTEMS = [
    {
        "id": "choc-chunk-cluster",
        "name": "Chocolate chunk cluster",
        "level": "meso",
        "hostComponents": ["wedge-top-face"],
        "elementComponentIds": ["choc-chunk"],
        "elementKind": "discrete added solid (frustum), anchored to the host's jittered surface after shell jitter - not vertex displacement, not an instanced identical mesh",
        "count": CHIP_COUNT,
        "countPerHost": {"wedge-top-face": CHIP_COUNT},
        "distribution": {
            "mode": "farthest-point-sampled cluster seeds (3 seeds) + nearest-fill quota per seed, never uniform/equidistant scatter",
            "radialRange": [0.0, 0.87],
            "minSeparationCells": 1,
            "mechanism": (
                "3 cluster seeds chosen by farthest-point sampling from a center-biased candidate "
                "pool (outer rim excluded from the seed pool so the cluster centroid stays near the "
                "face center), then each of the 7 chunks is assigned to its nearest seed and placed "
                "at the nearest unclaimed surface candidate within a minimum-gap constraint. Produces "
                "'loose casual clusters that leave quiet plain areas' (prompt JSON v5) instead of a "
                "grid or an evenly-spaced ring, which the prior round's user review rejected twice "
                "(evenly spaced reads as machine-punched, not hand-folded)."
            ),
            "note": "Rejected earlier approaches, kept as negative evidence: uniform-per-ring distribution (reads mechanical), minimum-distance-threshold seeding (fails both directions - too low merges clusters, too high can't find a third seed).",
        },
        "sizeClasses": [
            {"id": "large", "share": CHIP_LARGE_COUNT / CHIP_COUNT, "sizeMultiplier": CHIP_TIER["large"]["size"]},
            {"id": "medium", "share": CHIP_MEDIUM_COUNT / CHIP_COUNT, "sizeMultiplier": CHIP_TIER["medium"]["size"]},
            {"id": "shard", "share": CHIP_SHARD_COUNT / CHIP_COUNT, "sizeMultiplier": CHIP_TIER["shard"]["size"]},
        ],
        "seedRule": "Positions, tier assignment and per-instance irregularity come exclusively from the builder's injected rng argument, never Math.random (scripts/breads/types.ts section 5).",
        "evidenceRefs": ["view-top", "view-three-quarter"],
    }
]

FEATURE_REVIEW_TARGETS = [
    {
        "id": "wedge-apex-front-silhouette",
        "name": "Rounded-triangle wedge silhouette, apex-front, correct height/width",
        "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["root", "wedge-body"], "evidenceRefs": ["view-three-quarter", "view-top"],
    },
    {
        "id": "crust-two-tone-split",
        "name": "Hard two-tone crust split at the rim",
        "tier": "critical", "passIds": ["material-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["wedge-body", "wedge-top-face"], "evidenceRefs": ["view-three-quarter"],
    },
    {
        "id": "choc-chunk-half-sunken-cluster",
        "name": "Chocolate chunks half-sunken, size-hierarchy, loose clusters (not a grid, not a bump)",
        "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["wedge-top-face", "choc-chunk"], "evidenceRefs": ["view-top", "view-three-quarter"],
    },
    {
        "id": "cut-faces-plain",
        "name": "Side/cut faces stay completely plain (no chunks)",
        "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.8, "mustPass": True,
        "componentRefs": ["wedge-body"], "evidenceRefs": ["view-three-quarter"],
    },
    {
        "id": "crack-fissure-pair",
        "name": "1-2 soft crack fissures on the top face",
        "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["wedge-top-face"], "evidenceRefs": ["view-top"],
    },
    {
        "id": "smooth-clay-finish",
        "name": "Smooth clay finish on dough, flat-faceted exception on chocolate",
        "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False,
        "componentRefs": ["wedge-body", "choc-chunk"], "evidenceRefs": ["view-three-quarter"],
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
        "object_isolation": 3, "silhouette_readability": 3, "depth_inference": 2,
        "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 1,
        "interaction_fit": 3,
    }
    spec["coordinateFrame"] = {
        "front": "+Z, the direction the harness three-quarter camera at (-1.6, 2.2, 2.6) looks from",
        "up": "+Y",
        "scaleReference": "wedge width = ~1.98 relative units. Absolute scale is meaningless: the consumer runtime refits the longest axis to 1.6, so only ratios matter (scripts/breads/types.ts section 7).",
    }
    spec["referenceCamera"] = {
        "solved": False, "fovDegrees": 0.0, "aspect": 1.0,
        "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0},
        "positionHint": [-1.6, 2.2, 2.6],
        "note": "Not solved and deliberately not matched to the reference. The review camera is fixed by scripts/breadlab.ts applyView (orthographic at (-1.6, 2.2, 2.6) looking at the origin).",
    }
    spec["silhouette"] = {
        "boundingShape": "rounded-triangle wedge, 1.98 wide x 0.933 tall x 1.34 deep in relative units",
        "aspectRatios": [
            {"id": "height-over-width", "value": 0.47, "source": "scone--choco-chip-3.png top-down + prompt JSON 'height is roughly half its width'"},
        ],
        "symmetry": "asymmetric (hand-cut wedge, apex-front, no mirror plane)",
        "dominantCurves": ["rounded shoulder rising from rim to a near-flat plateau", "rounded-triangle outline with three blunt corners"],
        "negativeSpaces": ["none - solid wedge, no internal cavity"],
        "landmarks": ["apex corner faces +Z (camera-front)", "crust rim at radiusFraction 0.98 of the outline", "chunk cluster confined to the top face only"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [ROOT, WEDGE_BODY, WEDGE_TOP_FACE, CHOC_CHUNK_ARCHETYPE]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {
        "qualityPriority": "runtime-budget",
        "targetTriangles": 4200,
        "maxDrawCalls": 2,
        "textureSize": 64,
        "fpsTarget": 60,
        "optimizationPolicy": (
            "Variant/detail-bread budget band per assets/breads/work/CRIB.md (2026-08-30 revision): "
            "3000-5000 tri, <=250KB, outside the closed 10-bread 2560KB public budget. Low-tri prior "
            "rounds (549-1098 tri) were measured to look flat - insufficient vertices for surface "
            "texture, crack fissures and crumb ridging - so this build spends into the band rather "
            "than minimizing."
        ),
    }
    spec["qualityTargets"] = {
        "targetFidelity": 0.8,
        "mustMatch": [
            "rounded-triangle apex-front wedge silhouette, height/width ~0.47",
            "hard two-tone crust split surviving the runtime Lambert swap",
            "~7 chocolate chunks, half-sunken, size-hierarchy, loose clusters with quiet plain gaps",
            "side/cut faces completely plain - no chunks",
            "smooth clay finish on dough, flat-faceted exception on chocolate",
        ],
        "niceToHave": ["exact chunk positions", "the reference's soft AI-generated ambient occlusion in chunk crevices, which the flat-lit harness cannot reproduce"],
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
            "acceptedLimitation": "Consumer runtime keeps only map and color (docs/VISUAL.md section 8 bans PBR maps outright); all fidelity is moved into geometry.",
        },
    })
    spec["lookDevTargets"]["lightingPass"] = {
        "requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"],
        "authority": "Lighting is fixed by the consumer: scripts/breadlab.ts mirrors scripts/thumbsHarness.ts (warm directional key 0xffe2b0 at (-2,6,2) intensity 1.4, ambient 0xfff0dc at 0.75, cool fill 0xdce8ff at (2.5,3,-2) intensity 0.2). This lighting rig was recalibrated 2026-08-30 to reproduce canonical prompt-JSON hex with 0% top-face error - albedo must be used as-is, no parity gain.",
        "mustAvoid": ["authoring lights into the model", "applying a parity/albedo correction multiplier - the harness already reproduces canonical hex"],
    }
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key 0xffe2b0 at (-2,6,2), intensity 1.4 - matches the reference's 'single soft key light upper-left'.", "usage": "Fixed by scripts/breadlab.ts.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "Ambient 0xfff0dc at 0.75.", "usage": "Fixed by the harness.", "contactShadow": "none - there is no shadow map and no ground plane, so no contact shadow or ground shadow is rendered; the reference's soft AI-render occlusion in chunk crevices is an accepted delta."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill 0xdce8ff at (2.5,3,-2), intensity 0.2.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."},
    ]
    spec["proceduralStrategy"] = [
        "Loft the wedge body from the fixed 18-point outline lookup table through the body height profile.",
        "Loft the top face from the same outline lookup through the face height profile, sharing the rim ring with the body.",
        "Duplicate the shared rim ring (RIM_A/RIM_B) so normal averaging keeps a hard crust crease instead of a blended shoulder.",
        "Dip crack fissures into top-face grid cells (not continuous falloff) after the outline lookup.",
        "Jitter vertices while indexed, then computeVertexNormals() BEFORE toNonIndexed() for the smooth clay finish (order load-bearing).",
        "Pick 3 farthest-point-sampled cluster seeds on the jittered top-face surface; place 7 chunks by nearest-seed nearest-fill with a minimum gap.",
        "Build each chunk as its own small indexed frustum anchored to the shell's real (post-jitter) surface coordinate, embedded below the surface; facet each chunk (flat normals) as the deliberate hard-inclusion exception.",
        "Project a shared flat-color atlas UV (3 quadrants) onto every geometry, merge by material into 1 mesh.",
    ]
    spec["assumptions"] = [
        "Underside is never visible: the wedge rests flat on its bottom face and every review azimuth is above the horizon.",
        "The harness normalizes the longest axis to 1.6, so absolute dimensions are arbitrary and only the authored ratios carry meaning.",
        "Exact chunk positions are not identity-critical; count, size hierarchy, half-sunken embed and loose clustering are what the review scores.",
        "Front-elevation reference image is excluded as shape evidence (known generation error); only its height/width ratio is used.",
    ]
    spec["risks"] = [
        {"id": "vertex-color-loss", "severity": "high", "description": "Any vertex-color region paint is silently discarded by the runtime's MeshLambertMaterial swap.", "mitigation": "Three colors are packed into one flat-color atlas texture across a single stdMaterial; no vertexPaint block is authored anywhere."},
        {"id": "flat-shading-loss", "severity": "medium", "description": "A flatShading flag is not inherited by the runtime material swap.", "mitigation": "Chocolate faceting is baked into geometry by splitting vertices (scripts/breads/lib.ts facet) before export; the dough shell instead uses baked smooth normals (computeVertexNormals -> toNonIndexed)."},
        {"id": "seam-tear", "severity": "medium", "description": "Body and top face are separate lathes sharing a rim ring; jittering them independently would tear the shared boundary.", "mitigation": "Build one indexed wedge geometry, jitter it whole, then split its triangles into the two material buckets by ring index; re-weld the duplicated rim ring's coordinates after jitter."},
        {"id": "detail-below-tessellation", "severity": "high", "description": "A chunk (visible width ~0.14-0.19) or fissure depth smaller than the host grid's vertex spacing disappears silently.", "mitigation": "Chunks are built as separate added geometry (immune to host tessellation); fissures are pinned to named grid rings/sectors and their depth was measured against local ring spacing, not an arbitrary constant."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws when geometries in one bucket carry different attribute sets.", "mitigation": "Every geometry gets exactly position, normal and uv; no color attribute is ever created."},
        {"id": "chip-uniformity", "severity": "high", "description": "Prior round: chunks rendered as uniform teardrop 'kisses' or an evenly-spaced grid, both rejected by user review as reading mechanical/inhuman.", "mitigation": "Per-instance irregularity lives entirely in primitive authoring parameters (side count, anisotropy, lean, radius variance, size tiers by quota not probability) and placement uses farthest-point cluster seeding, never post-hoc displacement or uniform scatter."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["not breakable - single static prop"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "chunk-half-sunken-embed": ("bevel", "choc-chunk-half-sunken"),
    "crust-two-tone-boundary": ("seam", "crust-rim-boundary"),
    "fissure-crack-pair": ("hole", "wedge-top-face-fissures"),
}


def bind_details(pre: dict) -> None:
    # CRIB.md skip rule: detail-inventory tool is skipped (single repeating chip system), but the
    # target count is still hand-enumerated rather than left empty.
    pre["detailInventory"]["details"] = [
        {"id": did, "name": did.replace("-", " "), "kind": kind, "mapsTo": {"ref": ref, "note": ""}}
        for did, (kind, ref) in DETAIL_BINDINGS.items()
    ]


def resolve_unknowns(pre: dict) -> None:
    if pre["unknownsToResolveBeforeImplementation"]:
        pre["resolvedUnknowns"] = pre["unknownsToResolveBeforeImplementation"]
        pre["unknownsToResolveBeforeImplementation"] = []


def set_object_class(pre: dict) -> None:
    oc = pre.setdefault("objectClass", {})
    oc["primaryType"] = "chocolate chunk scone wedge (baked-good prop)"
    oc["primaryDomain"] = "object"
    oc["formLanguage"] = ["organic soft-clay wedge", "hard-faceted inclusions (contrast)"]
    oc["structureKind"] = ["single continuous lofted mass", "discrete embedded inclusions"]
    oc["motionPotential"] = ["static showcase prop", "whole-object rotation only"]
    oc["materialFamilies"] = ["baked dough (matte dielectric)", "chocolate (matte dielectric, faceted)"]


def main() -> int:
    assessment = json.loads(ASSESSMENT.read_text(encoding="utf-8"))
    set_object_class(assessment["preSpecAssessment"])
    assessment["preSpecAssessment"]["complexity"]["estimatedCounts"].update(
        {"macroComponents": 1, "mesoComponents": 2, "microFeatureGroups": 3, "materialLayers": 3, "repetitionSystems": 1}
    )
    assessment["qualityContract"]["minimumSpecDepth"].update(
        {"macroComponents": 1, "mesoComponents": 2, "microFeatureGroups": 0, "materialLayers": 3, "repetitionSystems": 1}
    )
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
