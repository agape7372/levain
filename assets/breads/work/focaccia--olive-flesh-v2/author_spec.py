# Authors the subject-specific half of object-sculpt-spec.json in place.
# Pattern lifted from assets/breads/work/focaccia/author_spec.py (box+grid slab precedent),
# extended with an olive-chunk repetition system and an oil-pool material split.
#
# This is a REDO round (2026-08-30): the first focaccia--olive-flesh build inherited the base
# focaccia.ts builder by hand and skipped this state-gated spec+build+review loop entirely.
# CRIB/BREADS.md mandate: variant bread also runs the full img2threejs procedure. Numeric
# constants MAY be inherited from the rejected build's research (documented inline below where
# that happens); the gate sequence itself may not be skipped.
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
REFERENCE = WORK.parents[1] / "src" / "focaccia--olive-flesh.png"

PIPELINE_OWNED = ("reviewHistory", "visualEvidence", "sculptPipeline")


def regenerate_skeleton() -> dict:
    carried: dict = {}
    if SPEC.exists():
        old = json.loads(SPEC.read_text(encoding="utf-8"))
        carried = {k: old[k] for k in PIPELINE_OWNED if old.get(k)}
    SPEC.unlink(missing_ok=True)
    subprocess.run(
        [sys.executable, str(SKILL / "forge" / "stage2_spec" / "new_sculpt_spec.py"),
         "Olive Focaccia Slab", "--image", str(REFERENCE), "--assessment", str(ASSESSMENT), "--out", str(SPEC)],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


HALF_X = 1.0
HALF_Z = 0.65  # rectangular, matches base focaccia.ts proportion (v4 top-down aspect ~3:2)
THICK = 0.28   # "low uniform height" -- same relative proportion as base focaccia
NX = 16
NZ = 12

# Dimples -- v4 requires "each one a little different: slightly oval, softly uneven rims, varied
# depths", NOT the base focaccia's fixed 5x4 grid. Count/depth inherited from the rejected build's
# A/B render research (assets/breads/work/focaccia--olive-flesh (v1)/focacciaOliveFlesh.ts head
# comment): depth 0.08 was the value that cleared the CRIB wall-slope-30deg readability floor under
# smooth shading (0.055 -> 24 deg, not readable; 0.08 -> 33 deg, readable). Count 13 stratified over
# a 5x3 region grid so olive/oil placement (below) has irregular but evenly-spread hosts.
DIMPLE_COUNT = 13
DIMPLE_DEPTH = 0.08
TOP_HEX = "#D9A552"
OIL_HEX = "#B8813C"
OLIVE_HEX = "#3B2F2F"  # spec-canon/provenance hex from the prompt JSON -- kept for documentation, NOT fed to the material below
# [surface-pass revision, team-lead quality round] Olive render-target hex -- NOT a global lighting
# gain (that stays banned; crust already renders at ~0% error). Calibration record (CRIB "3쌍으로
# 기록"): measured albedo used = OLIVE_HEX #3B2F2F (59,47,47); resulting render = our own top-down
# dark-pixel median (53,42,42) -- our lighting barely darkens albedo, so the gap is the spec hex
# itself reading flatter than the reference, not our shading; target = assets/breads/src/
# focaccia--olive-flesh-3.png (top-down, CRIB's fixed measurement plane) dark-pixel median
# (118,57,35) / 25th pct (95,44,24). Matches scripts/breads/focacciaOliveFlesh.ts OLIVE_RENDER_COLOR.
OLIVE_RENDER_HEX = "#70361F"

# Olive chunks -- v4 "about nine solid olive pieces ... in loose casual clusters that leave quiet
# plain areas", each an irregular hand-chopped wedge, not a uniform dome. Oil pools appear in only
# "three or four" of the dimples; the rest stay plain. Counts below total 11 chunks (7 seated in a
# dimple + 3 beside a dimple + 1 laid-over shard) against 13 dimples, leaving 3 empty finger marks
# alongside the pools -- matches the top-down reference's plain-gap reading better than an exact 9.
OLIVE_ON_DIMPLE = 7
OLIVE_BESIDE = 3
OLIVE_SHARD = 1
OLIVE_COUNT = OLIVE_ON_DIMPLE + OLIVE_BESIDE + OLIVE_SHARD
POOL_COUNT = 3
OLIVE_RADIUS = 0.075   # reference top-down measured chunk diameter 0.13-0.17 of slab half-width -> r 0.065-0.085
OLIVE_HEIGHT = 0.078

TOPPING_COUNT = 6   # sparse rosemary/salt accents, geometry-only bumps sharing the crust material
TOPPING_BUMP = 0.015


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant, "secondaryAlbedo": secondary, "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust / near-matte cured olive flesh / glossy oil pool -- same broad dielectric family as pancake/cracker/flatbread/focaccia precedent; runtime Lambert swap discards the gloss distinction (types.ts section 2), so it is not modelled as a separate material channel.",
        "zone": zone, "evidenceRefs": ["assets/prompts/breads/focaccia--olive-flesh.json geometry.crust (v4)"],
    }


VIEW_EVIDENCE = [
    {"id": "view-three-quarter", "view": "three-quarter top-front", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["thin rectangular slab, gently rounded corners", "irregular hand-pressed dimples, each individually oval with an uneven rim", "hand-chopped olive chunks seated in or beside dimples, half-sunken", "a couple of glossy amber oil pools visible in a minority of dimples", "sparse rosemary sliver + salt fleck accents"], "confidence": 0.95},
    {"id": "view-front", "view": "front elevation", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["low flat profile, thickness roughly 15% of width", "faint vertical tear striations on the plain side wall", "olive chunks break the top edge line irregularly, not evenly spaced"], "confidence": 0.9},
    {"id": "view-top", "view": "top-down", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "observations": ["olive chunks and oil pools gathered in loose casual clusters with quiet plain gaps between them, not spread evenly", "each dimple visibly different in shape/size/depth", "reference measurement plane for chunk diameter and dimple layout (CRIB: fix the measurement plane, top-down over 3/4)"], "confidence": 0.95},
]


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role, "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": False, "twist": False, "detach": False, "visibility": True, "materialState": True},
        "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Flat box proxy matching the slab bounding volume."},
        "constraints": [], "destruction": {"breakable": False, "fractureGroup": cid, "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust-top"},
    }


def surface_detail(bump: float, notes: str) -> dict:
    return {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump, "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)",
            "displacementPattern": "grid-cell vertex displacement (dimples recessed, toppings raised) + separate revolved-shell chunk meshes for olives", "occlusionPattern": "cavity darkening inside each dimple pit, deeper where a chunk is embedded",
            "edgeWearPattern": "faint vertical tear striations on the side wall (nice-to-have, not scored)", "notes": notes}


SLAB = {
    "id": "slab", "name": "Focaccia rectangular slab", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9,
    "primitive": "box", "topologyClass": "assembled-solid",
    "topologyRationale": "Single rigid rectangular slab, box primitive is structurally correct for a flat extruded volume (focaccia/cracker precedent). 'continuous-sculpt' is disallowed with primitive 'box' (validate_sculpt_spec.py DISALLOWED_TOPOLOGY_PRIMITIVE_PAIRS).",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, smooth-shaded after generation",
        "gridProfile": {"note": "Cartesian NX x NZ grid slab, not a lathe.", "segmentsX": NX, "segmentsZ": NZ, "halfX": HALF_X, "halfZ": HALF_Z, "thickness": THICK},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [{"id": "corner-round", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": 0.03, "notes": "Corner rounding + edge noise on the perimeter loop only (focaccia precedent)."}],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar)", "normalStrategy": "smooth normals computed before splitting to non-indexed (2026-08-30 finish contract)",
    },
    "parent": None, "attachment": None,
    "dimensions": {"width": round(2 * HALF_X, 4), "height": THICK, "depth": round(2 * HALF_Z, 4), "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("slab", "root"), "material": "crust-top", "materialLayers": ["crust-top"],
    "colorMaterialRecipe": color_recipe("rgba(217, 165, 82, 1.0)", "rgba(217, 165, 82, 1.0)", "whole slab except dimple interiors"),
    "deformations": ["corner-round"], "joints": [], "seams": [],
    "localFeatures": [{"id": "slab-corner-round", "name": "Rounded corner edge", "kind": "contour", "description": "Perimeter loop gets corner rounding + noise.", "evidenceRefs": ["view-top"], "confidence": 0.8}],
    "surfaceDetail": surface_detail(0.0, "Base slab; identity-critical relief lives on the top-face child component."),
    "evidenceRefs": ["view-three-quarter", "view-front"], "details": ["slab-corner-round"], "fidelityTier": "blockout",
}

TOP_FACE = {
    "id": "slab-top-face", "name": "Focaccia top face (dimples + oil pools + toppings)", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9,
    "primitive": "box", "topologyClass": "assembled-solid",
    "topologyRationale": "Same rigid grid volume as the parent; carries the top face's identity-critical local features separately from the parent's edge feature (focaccia precedent).",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, smooth-shaded after generation",
        "gridProfile": {"note": "Same NX x NZ grid as the parent's top ring; dimples/toppings are grid-cell displacements, zero added triangles on the slab itself.", "segmentsX": NX, "segmentsZ": NZ},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "dimple-field", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": DIMPLE_DEPTH, "notes": f"{DIMPLE_COUNT} finger-dimple pits, stratified-random over a 5x3 region grid (not a fixed lattice), each independently oval/uneven via per-neighbor partial-drop bias, depth spread +/-30%. Touching quads carry the oil-pool material only for the {POOL_COUNT} dimples marked pool=true; the rest stay on crust-top."},
            {"id": "topping-scatter", "type": "vertex-displacement", "axis": [0, 1, 0], "amplitude": TOPPING_BUMP, "notes": f"{TOPPING_COUNT} sparse raised bumps (rosemary/salt combined) on the crust material only -- kept low density per v4's 'sparse' requirement, unlike v1's 22-bump full-face scatter."},
        ],
        "uvStrategy": "top-planar projection (scripts/breads/lib.ts uvTopPlanar), basecolor canvas texture carries crust+oil so the 2-material budget is not spent here (types.ts section 1/9)", "normalStrategy": "smooth normals computed before splitting to non-indexed",
    },
    "parent": "slab", "attachment": None,
    "dimensions": {"width": round(2 * HALF_X * 0.95, 4), "height": round(DIMPLE_DEPTH, 4), "depth": round(2 * HALF_Z * 0.95, 4), "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("slab-top-face", "surface"), "material": "crust-top", "materialLayers": ["crust-top", "oil-pool"],
    "colorMaterialRecipe": color_recipe("rgba(217, 165, 82, 1.0)", "rgba(184, 129, 60, 1.0)", "top face base + dimple oil-pool zones"),
    "deformations": ["dimple-field", "topping-scatter"], "joints": [],
    "seams": [{"id": "slab-top-face-perimeter-ring", "kind": "material-boundary", "notes": "Shares the parent's perimeter ring exactly; a duplicated wall-top ring keeps the smooth-normal rim from chamfering (CRIB finish-contract rim pitfall)."}],
    "localFeatures": [
        {"id": "slab-top-face-dimples", "name": "Irregular finger-dimple field", "kind": "hole", "description": f"{DIMPLE_COUNT} stratified-irregular pits, each a little different in shape/rim/depth -- the single most identity-defining trait, and what distinguishes this variant from the base focaccia's fixed grid.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.95, "repetitionSystemRef": "dimple-field"},
        {"id": "slab-top-face-toppings", "name": "Sparse rosemary/salt scatter", "kind": "ridge", "description": "Sparse raised bumps for rosemary/salt, geometry-only (no separate color budget).", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.7, "repetitionSystemRef": "topping-scatter"},
    ],
    "surfaceDetail": surface_detail(DIMPLE_DEPTH, "assets/prompts/breads/focaccia--olive-flesh.json v4 notes_ko: hand-dimpled irregularity is what the user rejected v1/v2/v3 for lacking."),
    "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["slab-top-face-dimples", "slab-top-face-toppings"], "fidelityTier": "surface-pass",
}

OLIVE_CHUNK = {
    "id": "olive-chunk", "name": "Chopped olive flesh chunk (repeated archetype)", "level": "micro", "role": "attachment", "importance": 0.95, "confidence": 0.85,
    "primitive": "lathe", "topologyClass": "continuous-sculpt",
    "topologyRationale": "An irregular hand-chopped organic wedge is a continuous sculpted form, not a hard-edged box/cylinder/cone -- built as a manually-ringed revolved shell (lib.ts buildRevolvedShell, LatheGeometry itself is banned per CRIB phi-seam rule) with per-instance profile/segment/tilt variation so no two chunks are identical.",
    "geometryDescriptor": {
        "topologyIntent": "low-poly organic chunk, smooth-shaded, 3-ring profile (root/mid/mid/apex) for a rounded-shoulder silhouette instead of a single-cone tip",
        "gridProfile": {"note": "Not a grid; 7-9 radial segments x 5 profile rings, per-instance.", "segments": "7-9 (varied per instance for silhouette variety)"},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "chunk-authoring-irregularity", "type": "authoring-parameter", "axis": [1, 1, 1], "amplitude": 0.16, "notes": "Irregularity lives in AUTHORING parameters (per-segment radius wobble shared across rings, lean direction/amount, asymmetric profile ratios, apex xz wobble), not post-hoc vertex jitter -- CRIB 2026-08-30 lesson: jitter on a feature this small (radius 0.065-0.085) either shreds the silhouette (amp 0.006) or collapses it into a flat blob (amp 0.02) even before the smooth-normal finish, which is stricter still."},
            {"id": "chunk-notch", "type": "vertex-displacement", "axis": [0, -1, 0], "amplitude": 0.2, "notes": "45% chance per chunk of a crown notch: one or two adjacent segments on the two uppermost rings pulled inward/down (not the profile's pole dragged down, which would invert normals per CRIB non-monotonic-profile rule) -- reads as a pit-hole/fracture mark, avoiding the 'perfectly smooth dome' look the user rejected in v2/v3."},
        ],
        "uvStrategy": "top-planar projection (color is flat per-material, UV only satisfies mergeByMaterial's attribute-consistency requirement)", "normalStrategy": "smooth normals computed before splitting to non-indexed",
    },
    "parent": "slab-top-face", "attachment": {"parentSocket": "top-face-grid-cell", "contactType": "embed", "embedDepth": 0.014, "notes": "Half-sunken into a dimple or beside one; dough is not separately modelled to hug the edge (2-mesh budget), the embed depth alone sells it."},
    "dimensions": {"width": round(OLIVE_RADIUS * 2, 4), "height": OLIVE_HEIGHT, "depth": round(OLIVE_RADIUS * 2, 4), "units": "relative", "confidence": 0.75},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("olive-chunk", "attachment"), "material": "olive-flesh", "materialLayers": ["olive-flesh"],
    "colorMaterialRecipe": color_recipe("rgba(112, 54, 31, 1.0)", "rgba(112, 54, 31, 1.0)", "olive chunk instances (OLIVE_RENDER_HEX, calibrated -- see OLIVE_RENDER_HEX comment above)"),
    "deformations": ["chunk-authoring-irregularity", "chunk-notch"], "joints": [], "seams": [],
    "localFeatures": [
        {"id": "olive-chunk-irregular-silhouette", "name": "Irregular hand-chopped silhouette", "kind": "contour", "description": "Each chunk gets its own radius/height/profile-ratio/lean/tilt draw -- v2/v3 user-rejection reason was uniform kiss-shaped domes.", "evidenceRefs": ["view-top"], "confidence": 0.85, "repetitionSystemRef": "olive-scatter"},
        {"id": "olive-chunk-notch", "name": "Pit-hole / fracture notch", "kind": "hole", "description": "~45% of chunks get a shallow crown notch from pressing two upper-ring segments inward, reading as the dark fracture/pit mark visible on several reference chunks.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.7, "repetitionSystemRef": "olive-scatter"},
    ],
    "surfaceDetail": surface_detail(0.0, "Olive gets its own solid material (types.ts section 1: mesh<=2), no texture."),
    "evidenceRefs": ["view-top", "view-three-quarter"], "details": ["olive-chunk-irregular-silhouette", "olive-chunk-notch"], "fidelityTier": "surface-pass",
}


def material(mid: str, name: str, hexcolor: str, zone: str) -> dict:
    override = []
    if mid == "oil-pool":
        override = [{"id": "dimple-triangle-bucket", "name": "Oil-pool basecolor-texture zone", "maskSource": "geometry",
            "description": "Oil zone is painted into the same basecolor canvas as crust-top (bakeTexture), not a separate mesh -- the 2-material budget (crust+oil combined, olive separate) is spent on the olive/crust split instead, per CRIB.", "evidenceRefs": ["view-top"], "appliesTo": ["slab-top-face"]}]
    return {
        "id": mid, "name": name, "type": "standard", "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/focaccia--olive-flesh.json v4 geometry.crust (types.ts section 8 -- JSON import banned, hex is embedded in prose)."},
        "colorVariation": {"palette": [hexcolor], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureResolution": 256 if mid == "crust-top" else 64,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": "crust-top carries a 256px basecolor canvas (crust+oil-pool bands); olive-flesh is solid color, UV only satisfies mergeByMaterial's attribute-consistency requirement."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "flat rectangular slab silhouette / chunk mass", "carrier": "geometry"},
            {"id": "meso", "frequency": 4.0, "amplitude": 0.03, "role": "corner rounding / chunk lean+tilt", "carrier": "geometry"},
            {"id": "micro", "frequency": 20.0, "amplitude": 0.08, "role": "dimple field + oil pool + chunk notch", "carrier": "geometry+texture" if mid != "olive-flesh" else "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"},
        "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "smooth vertex normals", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": zone, "amplitude": DIMPLE_DEPTH if mid != "olive-flesh" else OLIVE_HEIGHT, "scale": 1.0, "silhouetteAffects": mid == "olive-flesh"},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": override,
        "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading."],
        "notes": f"{zone}. {'Basecolor canvas texture (2 flat bands), no vertex color' if mid == 'crust-top' else 'Solid color, no texture'} (scripts/breads/types.ts section 9).",
    }


MATERIALS = [
    material("crust-top", "Focaccia base crust (+ baked oil-pool bands)", TOP_HEX, "whole slab top/sides/bottom except olive chunks"),
    material("oil-pool", "Focaccia dimple oil pool (baked into crust-top texture, not a separate mesh material)", OIL_HEX, "dimple interiors, minority of dimples only"),
    material("olive-flesh", "Chopped olive flesh", OLIVE_RENDER_HEX, "olive chunk instances (calibrated render target, see OLIVE_RENDER_HEX comment)"),
]

REPETITION_SYSTEMS = [
    {"id": "dimple-field", "name": "Irregular finger-dimple field", "level": "micro", "hostComponents": ["slab-top-face"], "elementComponentIds": ["slab-top-face"],
     "elementKind": "recessed vertex displacement, not an added mesh", "count": DIMPLE_COUNT, "countPerHost": {"slab-top-face": DIMPLE_COUNT},
     "distribution": {"mode": "stratified-random over a 5x3 region grid with a chebyshev minimum-separation reject -- irregular but evenly spread, not a fixed lattice (base focaccia.ts precedent) and not unconstrained random (which clumps)."},
     "sizeClasses": [{"id": "dimple", "depth": DIMPLE_DEPTH, "depthSpreadPct": 30}], "seedRule": "Builder rng, deterministic positions.", "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "olive-scatter", "name": "Olive chunk + oil pool scatter", "level": "micro", "hostComponents": ["slab-top-face"], "elementComponentIds": ["olive-chunk"],
     "elementKind": "separate revolved-shell mesh instances, embedded via position/rotation, plus a subset of host dimples marked pool=true", "count": OLIVE_COUNT, "countPerHost": {"slab-top-face": OLIVE_COUNT},
     "distribution": {"mode": f"{OLIVE_ON_DIMPLE} seated in a dimple + {OLIVE_BESIDE} beside a dimple (ring-adjacency pick around seated hosts, for loose clustering) + {OLIVE_SHARD} laid-over shard variant; remaining dimples split between {POOL_COUNT} oil pools and plain empty finger marks."},
     "sizeClasses": [{"id": "seated-chunk", "radius": OLIVE_RADIUS}, {"id": "shard", "radiusMultiplier": 1.1, "heightMultiplier": 0.45}],
     "seedRule": "Builder rng only, per-instance profile draw (rollShape).", "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "topping-scatter", "name": "Sparse rosemary/salt scatter", "level": "micro", "hostComponents": ["slab-top-face"], "elementComponentIds": ["slab-top-face"],
     "elementKind": "raised vertex displacement, not an added mesh, no separate material", "count": TOPPING_COUNT, "countPerHost": {"slab-top-face": TOPPING_COUNT},
     "distribution": {"mode": "seeded shuffle of face-grid cells not used by dimples or their neighbors, chebyshev-distance rejection"},
     "sizeClasses": [{"id": "topping", "depth": TOPPING_BUMP}], "seedRule": "Builder rng only.", "evidenceRefs": ["view-top", "view-three-quarter"]},
]

FEATURE_REVIEW_TARGETS = [
    {"id": "thin-rect-slab-silhouette", "name": "Thin rectangular slab silhouette", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["slab"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "dimple-field-irregularity", "name": "Irregular (not gridded) dimple field", "tier": "critical", "passIds": ["surface-pass", "form-refinement"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["slab-top-face"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "olive-chunk-irregularity", "name": "Irregular hand-chopped olive chunks (not uniform domes)", "tier": "critical", "passIds": ["form-refinement", "material-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["olive-chunk"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "olive-cluster-gaps", "name": "Loose casual clusters with quiet plain gaps (not even scatter)", "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.6, "mustPass": False, "componentRefs": ["slab-top-face", "olive-chunk"], "evidenceRefs": ["view-top"]},
    {"id": "oil-pool-material-split", "name": "Oil pool visible in only a minority of dimples", "tier": "important", "passIds": ["material-pass"], "minimumScore": 0.6, "mustPass": False, "componentRefs": ["slab-top-face"], "evidenceRefs": ["view-top"]},
    {"id": "smooth-clay-finish", "name": "Smooth (non-faceted) clay shading", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["slab", "slab-top-face", "olive-chunk"], "evidenceRefs": ["view-three-quarter"]},
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
        "boundingShape": f"thin rectangular slab, {2*HALF_X:.2f} x {2*HALF_Z:.2f} x {THICK:.2f}, with {OLIVE_COUNT} small attached chunk silhouettes breaking the top edge line",
        "aspectRatios": [{"id": "thickness-over-width", "value": THICK / (2 * HALF_X), "source": "assets/prompts/breads/focaccia--olive-flesh.json silhouette (thin slab, low uniform height)"}],
        "symmetry": "rectangular, broken by corner rounding and irregular chunk/dimple placement", "dominantCurves": ["flat top/bottom planes with irregular dimple pits and small rounded chunk bumps"],
        "negativeSpaces": [f"{DIMPLE_COUNT} irregular dimple pits"], "landmarks": ["irregular dimple field", "loosely clustered olive chunks with plain gaps", "a couple of glossy oil pools"],
    }
    spec["viewEvidence"] = VIEW_EVIDENCE
    spec["componentTree"] = [SLAB, TOP_FACE, OLIVE_CHUNK]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {"qualityPriority": "runtime-budget", "targetTriangles": 4000, "maxDrawCalls": 2, "textureSize": 256, "fpsTarget": 60,
        "optimizationPolicy": ("Variant/detail-bread tri band 3000-5000 / <=250KB (CRIB 2026-08-30 amendment for variants outside the closed public-10 budget), reached via a slab grid plus 11 separate revolved-shell olive-chunk meshes at 42-54 tri each.",)}
    spec["qualityTargets"] = {"targetFidelity": 0.8,
        "mustMatch": ["thin flat rectangular slab", "irregular (non-gridded) dimple field", "irregular hand-chopped olive chunks, half-sunken", "smooth (non-faceted) clay shading"],
        "niceToHave": ["loose casual chunk clustering with quiet plain gaps", "oil pool present in only a minority of dimples", "faint side-wall tear striations", "sparse rosemary/salt bumps"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"]}
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({"roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 256, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run",
            "acceptedLimitation": "Runtime keeps only map+color, PBR maps banned (types.ts section 2). All relief lives in geometry; oil-pool is a flat basecolor-texture zone, olive is a flat solid-color mesh."}})
    spec["lookDevTargets"]["lightingPass"] = {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Fixed by scripts/breadlab.ts / scripts/thumbsHarness.ts (just recalibrated -- do not add gain/parity correction, hex renders at 0% error).", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render", "re-adding channel-gain calibration on top of the freshly-calibrated rig"]}
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Warm directional key at (-2, 6, 2), no exposure control, no tone mapping.", "usage": "Fixed by the harness.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "Neutral white-balanced ambient (recalibrated 2026-08-30).", "usage": "Fixed by the harness.", "contactShadow": "none - no shadow map or ground plane, so no contact shadow or ground shadow is rendered."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill, low intensity.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."},
    ]
    spec["proceduralStrategy"] = [
        "Build one indexed NX x NZ grid slab: top ring, duplicated wall-top ring (rim-chamfer fix), perimeter side wall, coarse fan underside (focaccia precedent).",
        "Pick dimple cells via stratified-random sampling over a 5x3 region grid with a chebyshev minimum-separation reject (not a fixed lattice, not unconstrained random).",
        "Displace each dimple center down by a per-instance depth (+/-30% spread) and partially drop its 4 neighbors by an independent random fraction, so the rim collapses asymmetrically instead of stamping a perfect circle.",
        "Jitter the slab shell vertices (amp bounded to <=1/20 of the smallest exposure/recess span) while indexed, so shared vertices move together; skip jitter entirely on the small olive-chunk geometry (CRIB: jitter on a feature this small shreds or flattens it -- irregularity comes from authoring parameters instead).",
        "Bake faceting OFF: computeVertexNormals() while indexed, THEN toNonIndexed() (2026-08-30 finish contract, order is load-bearing) -- re-sync the duplicated wall-top ring afterward so the rim seam doesn't crack.",
        "Paint a single basecolor canvas (crust-top + oil-pool bands) sampled at each dimple's true post-jitter world position via the same bbox uvTopPlanar used for UVs, so the oil-pool paint never drifts off its dimple.",
        "Build each olive-chunk as an independent manually-ringed revolved shell (buildRevolvedShell, not THREE.LatheGeometry) with a 3-ring profile, per-instance radius/height/lean/tilt/notch draw, smooth-shaded, embedded at dimple or beside-dimple positions with a small sink depth.",
        "Project top-planar UVs, merge by material into exactly two meshes (crust-top+oil-pool baked texture / olive-flesh solid color) (types.ts section 1).",
    ]
    spec["assumptions"] = ["Underside never visible above the horizon.", "Runtime normalizes longest axis to 1.6.", "Exact dimple/chunk coordinates not identity-critical beyond count, irregularity, and loose-cluster-with-gaps distribution.", "Top-down view is the measurement-plane reference for chunk diameter and layout density (CRIB lesson: 3/4 view foreshortens)."]
    spec["risks"] = [
        {"id": "regular-grid-relapse", "severity": "high", "description": "Base focaccia.ts's fixed 5x4 dimple lattice is the single biggest visual difference this variant must escape; falling back to a grid (even an irregular-looking one seeded from grid cells) risks reading as 'still a grid'.", "mitigation": "Stratified-region sampling (not lattice coordinates) plus per-dimple independent depth/rim-drop asymmetry; reviewed explicitly against the dimple-field-irregularity feature target."},
        {"id": "uniform-chunk-relapse", "severity": "high", "description": "v2/v3 of this exact bread were user-rejected for uniform kiss-shaped olive domes / perfectly circular machine-punched dimples.", "mitigation": "Per-instance profile draw (rollShape) with shared-across-rings segment wobble (not independent per ring, which waists the chunk into a wrong shape) and a non-monotonic-safe notch (segment inward-pull, never a dragged-down pole)."},
        {"id": "jitter-collapses-small-feature", "severity": "high", "description": "CRIB 2026-08-30 measured finding: absolute-unit jitter sized for the slab (amp 0.0015-0.006) either shreds a small chunk's silhouette or flattens it into a blob once smooth normals are in play.", "mitigation": "Jitter applied to the slab shell only; olive chunks get zero post-hoc jitter, irregularity lives entirely in authoring parameters."},
        {"id": "rim-chamfer", "severity": "medium", "description": "CRIB 2026-08-30 measured finding: sharing top-face/side-wall vertices under smooth normals chamfers the whole rim into a cushion look.", "mitigation": "Duplicated wall-top ring, re-synced to the jittered top-face coordinates after jitter runs."},
        {"id": "flat-shading-loss", "severity": "n/a (finish contract changed)", "description": "The pipeline's prior facet()-based finish is deprecated for this round; smooth normals are now the target look, not a defect to guard against.", "mitigation": "N/A -- documented so a future spec-refine does not silently revert to facet() by habit."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws on attribute-set mismatch.", "mitigation": "Every geometry gets position, normal, uv."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup; plausible break is a snap in half, not modelled here"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "dimple-field": ("hole", "slab-top-face-dimples"),
    "olive-scatter": ("ridge", "olive-chunk-irregular-silhouette"),
    "topping-scatter": ("ridge", "slab-top-face-toppings"),
    "corner-round": ("contour", "slab-corner-round"),
}


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
    pre["objectClass"] = {"primaryType": "thin rectangular olive focaccia slab", "primaryDomain": "object", "formLanguage": ["geometric", "hand-crafted", "organic (chunks)"], "structureKind": ["single rigid slab", "attached small organic chunks"], "motionPotential": ["static prop", "whole-object transform"], "materialFamilies": ["ceramic"], "notes": "Matte baked crust + near-matte cured olive flesh + glossy oil pool, all in the same broad dielectric family as pancake/cracker/flatbread/focaccia. Three logical albedo zones (crust/oil/olive), reduced to two runtime meshes via a shared basecolor texture for crust+oil."}
    pre["complexity"] = {"tier": "simple",
        "scores": {"silhouetteComplexity": 2, "componentCount": 2, "hierarchyDepth": 2, "repetitionDensity": 3, "materialLayerCount": 2, "localDetailDensity": 3, "occlusionRisk": 0, "actionReadinessNeed": 0},
        "estimatedCounts": {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 3, "materialLayers": 3, "repetitionSystems": 3},
        "reasoning": ["One rigid macro body (slab) plus one repeated micro archetype (olive-chunk) attached to it.", "Silhouette is a flat rectangular slab, its top edge broken irregularly by small chunk bumps.", "Repetition density 3: dimple field + olive/oil scatter + sparse topping scatter, the first two both identity-critical.", "Three logical albedo zones (crust/oil/olive) collapsed to 2 runtime meshes.", "Occlusion risk 0: only the flat, featureless underside is hidden.", "Action readiness 0: static showcase prop."]}
    pre["specDepthDecision"] = {"requiredDepth": "simple", "minimumComponentLevels": ["macro", "meso", "micro"], "needsRepetitionSystems": True, "needsMaterialLocalOverrides": True, "needsMultipleReviewViews": True, "needsActionReadyHierarchy": True, "rationale": "Simple tier but needs a meso top-face node plus a micro chunk archetype so all three repetition systems attach to real geometry."}
    pre["detailInventory"] = {"scanMethod": "component-zones", "targetMinDetails": 4, "note": "Enumerated by hand (CRIB: skip build_detail_inventory.py's grid-scan for a single repeated-system object; still hand-fill the target count).",
        "details": [
            {"id": "dimple-field", "zone": "top face", "observation": f"~{DIMPLE_COUNT} individually different shallow pits: oval, uneven rim, varied depth.", "inference": "Finger-pressed dimples, each pressed slightly differently by hand.", "mapsTo": {"ref": "slab-top-face-dimples", "note": "component slab-top-face localFeatures + repetitionSystem dimple-field"}, "confidence": 0.95, "evidenceRef": "focaccia--olive-flesh-3.png full frame"},
            {"id": "olive-scatter", "zone": "top face", "observation": f"~{OLIVE_COUNT} irregular hand-chopped olive chunks, half-sunken into or beside dimples, gathered in loose clusters with plain gaps between them.", "inference": "Hand-chopped olive pieces pressed into the dough after dimpling.", "mapsTo": {"ref": "olive-chunk-irregular-silhouette", "note": "component olive-chunk + repetitionSystem olive-scatter"}, "confidence": 0.9, "evidenceRef": "focaccia--olive-flesh-3.png full frame"},
            {"id": "topping-scatter", "zone": "top face", "observation": "A few sparse rosemary slivers and salt flecks.", "inference": "Toppings pressed into the dough before baking, kept sparse per v4.", "mapsTo": {"ref": "slab-top-face-toppings", "note": "component slab-top-face localFeatures + repetitionSystem topping-scatter"}, "confidence": 0.7, "evidenceRef": "focaccia--olive-flesh-3.png full frame"},
            {"id": "corner-round", "zone": "perimeter", "observation": "Rounded corners, not sharp right angles.", "inference": "Dough relaxing in the pan before baking.", "mapsTo": {"ref": "slab-corner-round", "note": "component slab localFeatures.corner-round"}, "confidence": 0.75, "evidenceRef": "focaccia--olive-flesh-3.png outline"},
        ]}
    pre["unknownsToResolveBeforeImplementation"] = [
        "Underside fully occluded; modelled as a coarse flat fan, never visible above the horizon.",
        "Exact dimple/chunk positions not identity-critical beyond count, irregularity, and loose-cluster-with-gaps density.",
        "Olive/oil/crust color cannot be preserved as three separate runtime meshes within the 2-material budget (types.ts section 1); resolved by baking crust+oil into one shared basecolor canvas texture and giving olive its own solid-color mesh.",
        "Gloss distinction between matte crust, near-matte olive, and glossy oil pool is invisible at runtime (Lambert-only); color contrast is the only surviving cue.",
    ]
    assessment["qualityContract"]["minimumSpecDepth"] = {"macroComponents": 1, "mesoComponents": 1, "microFeatureGroups": 3, "materialLayers": 3, "repetitionSystems": 3, "reviewViewpoints": 4}
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
