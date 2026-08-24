# Shared author_spec.py boilerplate for the "fire" bread trio (campagne, wholewheat, rye).
# Not part of the img2threejs skill - local to this repo's bread work only, factored out of
# pancake/author_spec.py so campagne/wholewheat/rye don't re-paste identical helper functions.
# Each bread's own author_spec.py still owns its componentTree/materials/repetitionSystems -
# only the mechanical parts (skeleton regen, action/surface/material dict shapes, pass trimming,
# detail binding) live here.
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"

# Keys the review pipeline owns, not the author script. new_sculpt_spec.py rebuilds them empty,
# so a re-run after reviews have been appended would silently erase the review record and reopen
# closed passes. They are lifted off the old spec and put back after regeneration.
PIPELINE_OWNED = ("reviewHistory", "visualEvidence", "sculptPipeline")


def sync_pipeline_state(spec_path: pathlib.Path) -> None:
    """Recompute sculptPipeline (currentPass, completedPasses) from reviewHistory via the skill's
    own orchestrate_passes.py, in-place. Call this as the LAST step of author_spec.py's main(),
    after the patched spec is written to disk.

    Why this exists: trim_passes() resets sculptPipeline.currentPass to the first pass whenever it
    is not literally a PASS_ORDER member (session code-review finding, 2026-08-24) - "complete" is
    exactly such a non-member value, so regenerating an already-finished bread's spec (e.g. to fix
    an unrelated field) silently rewound it to "blockout" even though reviewHistory still showed
    every pass reviewed. trim_passes() itself now special-cases "complete", but that only protects
    a value that was already correct going in; if a spec was regenerated before that fix landed,
    its currentPass is already wrong and carries forward wrong on every subsequent regeneration
    (carried state, not recomputed). Running orchestrate_passes.py sync recomputes the field from
    reviewHistory - the actual authoritative record - so it self-heals regardless of what was
    carried in.
    """
    subprocess.run(
        [sys.executable, str(SKILL / "forge" / "stage3_build" / "orchestrate_passes.py"), "sync", str(spec_path), "--in-place"],
        cwd=SKILL, check=True, capture_output=True,
    )


def regenerate_skeleton(spec_path: pathlib.Path, assessment_path: pathlib.Path, reference_path: pathlib.Path, name: str) -> dict:
    """Rebuild the starter spec before patching, preserving anything the review pipeline owns."""
    carried: dict = {}
    if spec_path.exists():
        old = json.loads(spec_path.read_text(encoding="utf-8"))
        carried = {k: old[k] for k in PIPELINE_OWNED if old.get(k)}
    spec_path.unlink(missing_ok=True)
    subprocess.run(
        [
            sys.executable, str(SKILL / "forge" / "stage2_spec" / "new_sculpt_spec.py"),
            name, "--image", str(reference_path),
            "--assessment", str(assessment_path), "--out", str(spec_path),
        ],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


def action_profile(cid: str, role: str, breakable: bool = False) -> dict:
    return {
        "animationRole": role,
        "pivot": {"mode": "custom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {
            "translate": True, "rotate": True, "scale": True, "bend": False,
            "twist": False, "detach": True, "visibility": True, "materialState": True,
        },
        "sockets": [],
        "collider": {
            "type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False,
            "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief is far below collider resolution.",
        },
        "constraints": [],
        "destruction": {
            "breakable": breakable, "fractureGroup": cid, "seamRefs": [],
            "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust",
        },
    }


def surface_detail(macro: float, micro: float, bump: float, normal: str, disp: str, notes: str) -> dict:
    return {
        "macroRoughness": macro, "microRoughness": micro, "bumpAmplitude": bump,
        "normalPattern": normal, "displacementPattern": disp,
        "occlusionPattern": "cavity darkening inside grooves and along material-boundary seams",
        "edgeWearPattern": "none - a freshly baked surface carries no edge wear",
        "notes": notes,
    }


def hex_to_rgba(hexcolor: str, alpha: float = 1.0) -> str:
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))
    return f"rgba({r}, {g}, {b}, {alpha})"


def color_recipe(dominant_hex: str, secondary_hex: str, zone: str, materialClass: str = "ceramic") -> dict:
    return {
        "dominantAlbedo": hex_to_rgba(dominant_hex),
        "secondaryAlbedo": hex_to_rgba(secondary_hex),
        "materialClass": materialClass,
        "materialClassConfidence": 0.75,
        "materialClassRationale": (
            "Closest class in the allowed set for a matte baked crust: opaque dielectric, roughness 1.0, "
            "no specular lobe. Not 'plastic', which would imply the glossy response the reference explicitly excludes."
        ),
        "zone": zone,
        "evidenceRefs": ["assets/prompts/breads geometry.crust"],
    }


def material(mid: str, name: str, hexcolor: str, zone: str, source_note: str, overrides: list,
             texture_size: int = 0, texture_note: str = "") -> dict:
    has_texture = texture_size > 0
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
            "samplingNotes": source_note,
        },
        "colorVariation": {
            "palette": [hexcolor],
            "pattern": "baked canvas texture (tone bands + speckle/dust/mottle)" if has_texture else "flat",
            "amplitude": 0.3 if has_texture else 0.0,
            "heightCorrelation": 0.0,
        },
        "textureResolution": texture_size if has_texture else 64,
        "textureProjection": {
            "mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1,
            "texelDensityIntent": texture_note if has_texture else (
                "No texture is emitted. UVs exist only to satisfy the merge step's attribute-consistency "
                "requirement (scripts/breads/types.ts section 4)."
            ),
        },
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "revolved dome profile", "carrier": "geometry"},
            {"id": "meso", "frequency": 10.0, "amplitude": 0.03, "role": "concentric ring grooves", "carrier": "geometry"},
            {"id": "micro", "frequency": 40.0, "amplitude": 0.02, "role": "tone banding, dusting/speckle/mottle, faceting", "carrier": "texture+geometry" if has_texture else "geometry"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - the runtime Lambert swap discards roughness entirely"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "flat normals from split vertices", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": zone, "amplitude": 0.03, "scale": 1.0, "silhouetteAffects": True},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel: the runtime Lambert material has none. Cavity darkening comes from groove-wall orientation."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": overrides,
        "shaderNotes": [
            "Emit via scripts/breads/lib.ts stdMaterial(): MeshStandardMaterial with roughness 1, metalness 0.",
            "Never set vertexColors: the runtime rebuilds every material as MeshLambertMaterial({map, color}), so vertex colors are silently discarded (scripts/breads/types.ts section 2).",
            "Never set flatShading: that flag is not inherited by the runtime swap either. Faceting must be baked as split vertices.",
        ],
        "notes": f"{zone}. {texture_note if has_texture else 'A solid color is enough for this zone, so no texture is emitted (scripts/breads/types.ts section 9).'}",
    }


# Three of the eight starter passes have no authorable work on any of these objects, for the same
# reasons pancake dropped them - see pancake/author_spec.py for the long form. structural-pass stays
# because validate_sculpt_spec --strict-quality hard-requires it regardless of hierarchy flatness.
PASS_ORDER = ["blockout", "structural-pass", "form-refinement", "material-pass", "surface-pass", "optimization-pass"]
DROPPED_PASSES = {
    "lighting-pass": "lighting is fixed by the consumer harness and is not authorable in the model (spec.lookDevTargets.lightingPass.authority)",
    "interaction-pass": "static showcase prop with no sockets, hinges or colliders beyond a bounding proxy; preSpecAssessment scores actionReadinessNeed 0",
}


def trim_passes(spec: dict) -> None:
    pipeline = spec["sculptPipeline"]
    pipeline["passOrder"] = list(PASS_ORDER)
    pipeline["droppedPasses"] = DROPPED_PASSES
    # "complete" is a valid terminal currentPass (all 6 passes reviewed, see
    # forge/stage3_build/orchestrate_passes.py current_pass()) - not a member of PASS_ORDER itself,
    # so the reset-to-first-pass branch below must not clobber it. Without this carve-out,
    # regenerating a spec's skeleton after the pipeline already finished (e.g. re-running
    # author_spec.py to fix an unrelated field) silently rewinds sculptPipeline.currentPass to
    # blockout even though the carried reviewHistory still shows every pass reviewed - the next
    # tool to read the spec would think work remains that is actually already done and shipped.
    if pipeline.get("currentPass") not in PASS_ORDER and pipeline.get("currentPass") != "complete":
        pipeline["currentPass"] = PASS_ORDER[0]
    spec["buildPasses"] = [p for p in spec["buildPasses"] if p["id"] in PASS_ORDER]
    loop = spec["selfCorrectLoop"]
    loop["reviewAfterPasses"] = list(PASS_ORDER)
    loop["screenshotPolicy"]["requiredForPasses"] = list(PASS_ORDER)
    for target in spec["featureReviewTargets"]:
        target["passIds"] = [p for p in target["passIds"] if p in PASS_ORDER] or [PASS_ORDER[0]]


def bind_details(pre: dict, bindings: dict) -> None:
    for detail in pre["detailInventory"]["details"]:
        kind, ref = bindings[detail["id"]]
        detail["kind"] = kind
        if isinstance(detail.get("mapsTo"), str):
            detail["mapsToNote"] = detail["mapsTo"]
        detail["mapsTo"] = {"ref": ref, "note": detail.get("mapsToNote", "")}


def resolve_unknowns(pre: dict) -> None:
    """The validator reads a non-empty unknownsToResolveBeforeImplementation as 'still open'.
    Every one of these was closed by an authoring decision, so they move to resolvedUnknowns
    (kept verbatim, nothing discarded) and the open list empties."""
    if pre["unknownsToResolveBeforeImplementation"]:
        pre["resolvedUnknowns"] = pre["unknownsToResolveBeforeImplementation"]
        pre["unknownsToResolveBeforeImplementation"] = []


def lighting_block() -> dict:
    return {
        "requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"],
        "authority": (
            "Lighting is fixed by the consumer, not authored here: scripts/breadlab.ts mirrors "
            "scripts/thumbsHarness.ts with a warm directional key 0xffe2b0 at (-2, 6, 2) intensity 1.4, "
            "an ambient 0xfff0dc at 0.75 and a cool fill 0xdce8ff at (2.5, 3, -2) intensity 0.2."
        ),
        "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render"],
    }


def lighting_from_photo() -> list:
    return [
        {
            "id": "harness-key", "role": "key light",
            "observation": "Warm directional key 0xffe2b0 at (-2, 6, 2), intensity 1.4, upper-left and slightly front - the same relationship as the reference's 'single soft key light upper-left'.",
            "usage": "Fixed by scripts/breadlab.ts, mirrored from scripts/thumbsHarness.ts. Not authored by the model.",
            "exposure": "no exposure control and no tone mapping - the renderer runs at default linear output, so authored albedo lands on screen almost unchanged.",
        },
        {
            "id": "harness-ambient", "role": "ambient fill",
            "observation": "Ambient 0xfff0dc at 0.75 - a high ambient ratio, so faceting/relief must read without relying on shadow terminators.",
            "usage": "Fixed by the harness.",
            "contactShadow": "none - there is no shadow map and no ground plane, so no contact shadow or ground shadow is rendered.",
        },
        {
            "id": "harness-fill", "role": "rim/fill light",
            "observation": "Cool directional fill 0xdce8ff at (2.5, 3, -2), intensity 0.2, opposite the key - lifts the rear surface just enough for the silhouette to separate at azimuth 180.",
            "usage": "Fixed by the harness. Its low intensity is why the rear surface must carry geometric relief rather than relying on a lighting gradient.",
            "toneMapping": "NoToneMapping (three.js default); ambient occlusion is not available on the runtime Lambert material, so cavity darkening must come from wall orientation.",
        },
    ]


def material_pass_look_dev() -> dict:
    return {
        "roughnessVariationRequired": False,
        "normalOrBumpRequired": False,
        "minimumTextureResolution": 0,
        "preferredTextureResolution": 0,
        "independentMapChannels": [],
        "referencePbrExtraction": {
            "requiredWhenSourceImagePresent": False,
            "targetThreshold": 0.0,
            "stopOnLowConfidence": False,
            "script": "not run",
            "acceptedLimitation": (
                "See qualityContract.featureGroups.reference-lookdev.documentedLimitation: the consumer "
                "runtime keeps only map and color, and the repo bans PBR maps outright (docs/VISUAL.md "
                "section 8), so every channel these fields describe is inert. All of it is moved into geometry "
                "(and, where a continuous color trend is identity-critical, into a single baked basecolor canvas)."
            ),
        },
    }
