# Authors the subject-specific half of object-sculpt-spec.json in place.
# Pattern lifted from assets/breads/work/focaccia--olive-flesh-v2/author_spec.py (2026-08-30
# redo-round precedent), adapted for a lathe dome body + a repeated cut-face archetype instead of
# a grid slab.
#
# This is a REDO round (2026-08-30): the first campagne--strawberry-jam build (git history:
# scripts/breads/campagneStrawberryJam.ts) inherited the base campagne.ts dome builder by hand and
# skipped this state-gated spec+build+review loop entirely -- CRIB/BREADS.md mandate: variant
# bread also runs the full img2threejs procedure, numeric constants MAY be carried over from that
# build's own documented render research, the gate sequence itself may not be skipped. This file
# redoes the gate sequence; several constants below are re-derived fresh from the (regenerated,
# sharper) reference images rather than carried blindly.
#
# Geometry frame: Y up, +Z forward, dome fits in unit radius (matches scripts/breads/campagne.ts /
# domeShell.ts baseRadius(t) = sqrt(1-t^2)), all relative -- runtime refits longest axis to 1.6.
import json
import pathlib
import subprocess
import sys

WORK = pathlib.Path(__file__).resolve().parent
SPEC = WORK / "object-sculpt-spec.json"
ASSESSMENT = WORK / "assessment.json"
SKILL = pathlib.Path.home() / ".claude" / "skills" / "img2threejs"
REFERENCE = WORK.parents[1] / "src" / "campagne--strawberry-jam.png"

PIPELINE_OWNED = ("reviewHistory", "visualEvidence", "sculptPipeline")


def regenerate_skeleton() -> dict:
    carried: dict = {}
    if SPEC.exists():
        old = json.loads(SPEC.read_text(encoding="utf-8"))
        carried = {k: old[k] for k in PIPELINE_OWNED if old.get(k)}
    SPEC.unlink(missing_ok=True)
    subprocess.run(
        [sys.executable, str(SKILL / "forge" / "stage2_spec" / "new_sculpt_spec.py"),
         "Strawberry Jam Campagne", "--image", str(REFERENCE), "--assessment", str(ASSESSMENT), "--out", str(SPEC)],
        cwd=SKILL, check=True, capture_output=True,
    )
    return carried


# --- Re-derived geometry constants (fresh read of the regenerated, sharper reference) ----------
# Base silhouette proportion inherited from campagne.ts/domeShell.ts (DOME_HEIGHT on unit radius,
# baseRadius(t)=sqrt(1-t^2)) -- unchanged, front-elevation measurement confirms the same ratio.
DOME_HEIGHT = 0.76
SEGMENTS = 32  # 8x multiple of the 4 slash angles (45/135/225/315deg fall exactly on sector bounds)

# Banneton ring density -- the single biggest visual delta vs the base campagne.ts (8 grooves).
# The regenerated reference's top-down view shows a MUCH denser ring band covering the whole dome
# (visually ~15-18 concentric bands vs the base's 8) -- re-derived by eye from -3.png, not carried
# from the rejected build (whose comments never revisited this number against v4-era imagery).
GROOVE_COUNT = 16
GROOVE_ZONE = (0.08, 0.97)
GROOVE_HALF_WIDTH_T = 0.009  # narrower than base (0.014) because there are 2x as many rings in the same zone
GROOVE_DEPTH = 0.022         # shallower than base (0.03) for the same reason -- CRIB grid/detail-vs-spacing tradeoff

# Cross slash -- reference reads as 4 SHARP POINTED blades meeting at one apex (near-starburst),
# not the base campagne's softer rounded cross. Ears run further down the dome (visually to about
# 55% of the way to the base) and stand taller.
SLASH_ANGLES_DEG = (45, 135, 225, 315)
SLASH_T_FULL = 0.92
SLASH_T_END = 0.5           # base is 0.6 -- blades read as running further down toward the equator
SLASH_HALF_ANGLE_DEG = 10   # base is 12 -- slightly narrower blades read sharper/more pointed
SLASH_CRUMB_HALF_ANGLE_DEG = 4
SLASH_GAP_HALF_ANGLE_DEG = 1.0
SLASH_DEPTH = 0.10
EAR_HEIGHT = 0.032           # base is 0.02 -- taller ridge reads as a raised pointed blade, not a soft lip

# Wedge cutaway -- one quarter-ish sector missing, centered between two slash arms (45/135deg pair)
# so both remaining arm tips stay intact on either side (CRIB: verify wedge sits BETWEEN arms, not
# overlapping one). 6 of 32 sectors = 67.5deg, leaving an 11.25deg buffer to each neighboring arm's
# 10deg half-angle influence -- re-verified (not blindly carried) against the new top-down
# reference, which shows the wedge occupying most but not all of the 90deg gap between two arms.
WEDGE_FIRST_SECTOR = 5    # 56.25deg
WEDGE_SECTOR_COUNT = 6    # -> 123.75deg end
CUT_RADIAL = 22
CUT_ROWS = 26

# Jam spiral -- cut-face normalized coords u=rho/R, v=y/H. Re-derived from the regenerated front
# elevation (-2.png): the new render's spiral reads TIDIER/more regular than the rejected build's
# description implied (about 3.5-4 fairly even turns, band width a fairly consistent ~5% of the
# cut-face radius) -- thickness-wobble amplitude is dialed down from the rejected build's research
# (sum 0.80 -> 0.55) to match, while keeping enough irregularity that it does not read as a
# perfect drafting-compass spiral (CRIB "완벽한 수학 나선 = 인공물").
SWIRL_TURNS = 3.7
SWIRL_HALF_FRAC = 0.048  # half-width as a fraction of RMAX -- reference band looks a touch narrower than 1 iteration ago
DIMPLE_COUNT = 18
FLECK_COUNT = 20
PORE_COUNT = 160

TOP_HEX = "#A9713F"
CRUMB_HEX = "#F4EAD4"
JAM_HEX = "#B23A4E"


def color_recipe(dominant: str, secondary: str, zone: str) -> dict:
    return {
        "dominantAlbedo": dominant, "secondaryAlbedo": secondary, "materialClass": "ceramic",
        "materialClassConfidence": 0.75,
        "materialClassRationale": "Matte baked crust / matte crumb / non-glossy baked jam band -- same broad dielectric family as campagne/wholewheat precedent (the prompt JSON's negative list explicitly bans 'glossy jam sheen'); runtime Lambert swap discards any gloss distinction anyway (types.ts section 2).",
        "zone": zone, "evidenceRefs": ["assets/prompts/breads/campagne--strawberry-jam.json geometry"],
    }


def action_profile(cid: str, role: str) -> dict:
    return {
        "animationRole": role, "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": False, "twist": False, "detach": False, "visibility": True, "materialState": True},
        "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Flat cylinder proxy matching the loaf's bounding volume; surface relief and the wedge cutaway are far below collider resolution."},
        "constraints": [], "destruction": {"breakable": False, "fractureGroup": cid, "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "crust"},
    }


def surface_detail(bump: float, notes: str) -> dict:
    return {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": bump,
            "normalPattern": "smooth vertex normals (computeVertexNormals -> toNonIndexed, 2026-08-30 finish contract -- facet() is deprecated for this round)",
            "displacementPattern": "lathe-profile groove modulation + angular slash falloff + radial-band vertex channel (jam)",
            "occlusionPattern": "cavity darkening inside grooves, the slash trench, and the jam channel",
            "edgeWearPattern": "none - a freshly baked surface carries no edge wear", "notes": notes}


ROOT = {
    "id": "root", "name": "Strawberry Jam Campagne Boule", "level": "macro", "role": "assembly", "importance": 1.0, "confidence": 0.95,
    "primitive": "lathe", "topologyClass": "continuous-sculpt",
    "topologyRationale": "Transform-only assembly node carrying the dome body and cut faces; it emits no geometry of its own (campagne.ts precedent).",
    "geometryDescriptor": {"topologyIntent": "transform node only",
        "gridProfile": {"note": "No geometry of its own; children own the lathe profile and cut-face grids."},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [],
        "uvStrategy": "inherited from children", "normalStrategy": "inherited from children"},
    "parent": None, "attachment": None,
    "dimensions": {"width": 2.0, "height": DOME_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.95},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("root", "root"), "material": "crust", "materialLayers": ["crust"],
    "colorMaterialRecipe": color_recipe(f"rgba({int(TOP_HEX[1:3],16)}, {int(TOP_HEX[3:5],16)}, {int(TOP_HEX[5:7],16)}, 1.0)", f"rgba({int(CRUMB_HEX[1:3],16)}, {int(CRUMB_HEX[3:5],16)}, {int(CRUMB_HEX[5:7],16)}, 1.0)", "assembly node, inherits from children"),
    "deformations": [], "joints": [], "seams": [], "localFeatures": [],
    "surfaceDetail": surface_detail(0.0, "Assembly node; no surface of its own."),
    "evidenceRefs": ["view-front", "view-three-quarter", "view-top"], "details": [], "fidelityTier": "blockout",
}

DOME = {
    "id": "dome", "name": "Campagne dome body (dense rings + starburst slash + wedge cutaway)", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9,
    "primitive": "lathe", "topologyClass": "continuous-sculpt",
    "topologyRationale": "One continuous, smoothly varying rotationally symmetric mass (dome shell) minus one angular sector -- built as a manually-ringed revolved shell (lib.ts buildRevolvedShell, LatheGeometry itself is banned per CRIB phi-seam rule), same family as base campagne.ts/domeShell.ts. Decision tree step 6: a sphere/hemisphere primitive cannot carry the flat base cap, ring-groove profile modulation, or the removed wedge sector.",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, smooth-shaded after generation",
        "gridProfile": {"note": "Lathe profile computed procedurally from grooveCount/grooveZone/grooveDepth (scripts/breads/domeShell.ts buildDomeProfile) -- this spec records the authoring parameters, not the sampled point array.",
            "segments": SEGMENTS, "grooveCount": GROOVE_COUNT, "grooveZone": list(GROOVE_ZONE), "grooveHalfWidthT": GROOVE_HALF_WIDTH_T, "grooveDepth": GROOVE_DEPTH},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "banneton-rings", "type": "radial-modulation", "axis": [0, 1, 0], "amplitude": GROOVE_DEPTH, "notes": f"{GROOVE_COUNT} concentric V-notch rings baked into the lathe profile, axially symmetric (no sector grid needed)."},
            {"id": "starburst-slash", "type": "angular-falloff-displacement", "axis": [0, -1, 0], "amplitude": SLASH_DEPTH, "notes": "4-fold cosine angular falloff trench with a raised ear ridge on either side, running from the apex down to tFrac=SLASH_T_END -- taller/narrower than the base campagne's cross for a pointed-blade/starburst read."},
            {"id": "wedge-cutaway", "type": "sector-removal", "axis": [0, 1, 0], "amplitude": 1.0, "notes": f"{WEDGE_SECTOR_COUNT} of {SEGMENTS} sectors ({WEDGE_SECTOR_COUNT/SEGMENTS*360:.1f} degrees) deleted between the 45deg and 135deg slash arms, exposing the interior via two new cut-face components."},
        ],
        "uvStrategy": "shared basecolor atlas canvas, top-down polar projection for the crust region (scripts/breads/lib.ts uvDome-style projection, computed before the wedge sectors are deleted so the projection center/radius are not skewed)",
        "normalStrategy": "smooth normals computed before splitting to non-indexed (2026-08-30 finish contract, order load-bearing)",
    },
    "parent": "root", "attachment": None,
    "dimensions": {"width": 2.0, "height": DOME_HEIGHT, "depth": 2.0, "units": "relative", "confidence": 0.9},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("dome", "body"), "material": "crust", "materialLayers": ["crust"],
    "colorMaterialRecipe": color_recipe(f"rgba({int(TOP_HEX[1:3],16)}, {int(TOP_HEX[3:5],16)}, {int(TOP_HEX[5:7],16)}, 1.0)", f"rgba({int(CRUMB_HEX[1:3],16)}, {int(CRUMB_HEX[3:5],16)}, {int(CRUMB_HEX[5:7],16)}, 1.0)", "whole dome crust surface"),
    "deformations": ["banneton-rings", "starburst-slash", "wedge-cutaway"], "joints": [], "seams": [
        {"id": "dome-cut-face-boundary", "kind": "material-boundary", "notes": "Wedge boundary columns are shared vertices with the two cut-face components -- no gap, no re-displacement after cutting."},
    ],
    "localFeatures": [
        {"id": "dome-banneton-rings", "name": "Dense concentric banneton ring field", "kind": "ridge", "description": f"{GROOVE_COUNT} closely-packed concentric V-notch rings across nearly the whole dome -- the single most identity-defining crust trait for this variant vs the base campagne's 8 grooves.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "banneton-rings"},
        {"id": "dome-starburst-slash", "name": "Pointed 4-blade starburst slash", "kind": "ridge", "description": "4 sharp, tall, pointed ears meeting at one apex -- reads as a starburst/pinwheel rather than the base campagne's soft rounded cross.", "evidenceRefs": ["view-top", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": "slash-ears"},
        {"id": "dome-wedge-cutaway", "name": "Quarter-wedge cutaway", "kind": "hole", "description": "One sector removed down to the base, sitting squarely between two slash arms, exposing the jam-swirl cross-section on two new flat faces.", "evidenceRefs": ["view-top", "view-three-quarter", "view-front"], "confidence": 0.95, "repetitionSystemRef": "cut-face-pair"},
    ],
    "surfaceDetail": surface_detail(GROOVE_DEPTH, "assets/prompts/breads/campagne--strawberry-jam.json geometry.crust: 'spiral banneton ring markings pressed concentrically across the whole top surface (the defining feature)' + 'a cross-shaped slash cut into the center of the dome, opened into a raised burst ear along each cut line'."),
    "evidenceRefs": ["view-top", "view-three-quarter", "view-front"], "details": ["dome-banneton-rings", "dome-starburst-slash", "dome-wedge-cutaway"], "fidelityTier": "surface-pass",
}

CUT_FACE = {
    "id": "cut-face", "name": "Wedge cut face (jam-swirl cross-section, repeated archetype)", "level": "meso", "role": "surface", "importance": 1.0, "confidence": 0.9,
    "primitive": "lathe", "topologyClass": "continuous-sculpt",
    "topologyRationale": "A flat radial fan slice sharing the parent dome's revolved profile at one fixed phi value (not a solid of revolution itself) -- same primitive family as the pancake.ts precedent (disk-top-face uses primitive 'lathe' for a flat disk face). Carries real 3D relief (jam channel + pore dimples + crumb bump), not a flat billboard, so 'plane-card' would misrepresent it.",
    "geometryDescriptor": {
        "topologyIntent": "low-poly prop, smooth-shaded after generation, custom radial x vertical grid (not the parent's ring/sector grid)",
        "gridProfile": {"note": f"{CUT_RADIAL} radial x {CUT_ROWS} vertical uniform grid, positioned analytically from the dome's own profile function (not copied ring geometry) so the interior grid resolution is independent of the dome's grooved-and-clumped ring spacing.", "radial": CUT_RADIAL, "rows": CUT_ROWS},
        "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1},
        "deformationStack": [
            {"id": "jam-swirl-channel", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.026, "notes": f"Recessed channel (not a painted-on flat band) following a {SWIRL_TURNS:.1f}-turn spiral with wobbling radius/thickness -- CRIB lesson from the rejected build: a flat colored band alone reads as a 'sticker'; a physically channeled groove whose color and relief read the SAME distance field does not."},
            {"id": "crumb-pore-dimples", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.014, "notes": f"{DIMPLE_COUNT} small elliptical pit dimples sharing their positions with the texture's dark pore specks, so the shading dip lands on the painted pore, not beside it."},
            {"id": "crumb-low-freq-bump", "type": "vertex-displacement", "axis": [0, 0, 0], "amplitude": 0.007, "notes": "Very low-frequency (wavelength >> jam-band width) sine bump so the crumb face is not a dead flat plane, without disturbing the jam channel's own relief."},
        ],
        "uvStrategy": "parametric (rho-fraction, height-fraction) atlas coordinates, computed BEFORE relief displacement so the vertex-displacement channels never drift the painted texture off its own relief", "normalStrategy": "smooth normals computed before splitting to non-indexed",
    },
    "parent": "dome", "attachment": None,
    "dimensions": {"width": 2.0, "height": DOME_HEIGHT, "depth": 0.01, "units": "relative", "confidence": 0.85},
    "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "actionProfile": action_profile("cut-face", "surface"), "material": "jam", "materialLayers": ["crust", "crumb", "jam"],
    "colorMaterialRecipe": color_recipe(f"rgba({int(CRUMB_HEX[1:3],16)}, {int(CRUMB_HEX[3:5],16)}, {int(CRUMB_HEX[5:7],16)}, 1.0)", f"rgba({int(JAM_HEX[1:3],16)}, {int(JAM_HEX[3:5],16)}, {int(JAM_HEX[5:7],16)}, 1.0)", "cut-face crumb background + jam spiral band + outer crust rim"),
    "deformations": ["jam-swirl-channel", "crumb-pore-dimples", "crumb-low-freq-bump"], "joints": [], "seams": [
        {"id": "cut-face-outer-rim", "kind": "material-boundary", "notes": "Outer boundary column is shared exactly with the dome's own wedge-boundary ring vertices (post-jitter world coordinates), so there is zero seam gap."},
    ],
    "localFeatures": [
        {"id": "cut-face-jam-swirl", "name": "Strawberry jam spiral (color+relief shared field)", "kind": "hole", "description": f"~{SWIRL_TURNS:.1f}-turn spiral channel through the pale crumb -- color and recess depth are both driven by the SAME signed-distance-to-band function so the painted band can never drift off the carved channel.", "evidenceRefs": ["view-front", "view-three-quarter"], "confidence": 0.9, "repetitionSystemRef": None},
        {"id": "cut-face-pores", "name": "Crumb pore dimples", "kind": "hole", "description": f"{DIMPLE_COUNT} small dark pore dimples scattered through the crumb, some overlapping the jam band edge to make the boundary read as baked-in rather than a clean painted edge.", "evidenceRefs": ["view-three-quarter"], "confidence": 0.75, "repetitionSystemRef": "crumb-pore-dimples"},
        {"id": "cut-face-flecks", "name": "Jam edge flecks", "kind": "ridge", "description": f"{FLECK_COUNT} small jam-colored flecks scattered just outside the main band, reading as jam bleed into the surrounding crumb.", "evidenceRefs": ["view-front"], "confidence": 0.6, "repetitionSystemRef": "jam-edge-flecks"},
    ],
    "surfaceDetail": surface_detail(0.026, "assets/prompts/breads/campagne--strawberry-jam.json geometry.crust: 'on the exposed cross-section, a deep red strawberry jam swirl #B23A4E spirals through the pale open crumb'."),
    "evidenceRefs": ["view-front", "view-three-quarter"], "details": ["cut-face-jam-swirl", "cut-face-pores", "cut-face-flecks"], "fidelityTier": "surface-pass",
}


def material(mid: str, name: str, hexcolor: str, zone: str, band_note: str) -> dict:
    override = []
    if mid == "jam":
        override = [{"id": "jam-edge-fleck-mask", "name": "Jam edge bleed/fleck mask", "maskSource": "geometry",
            "description": "A thin band just outside the jam-swirl signed-distance boundary gets scattered jam-colored flecks (jam-edge-flecks repetition system), reading as fruit bleeding slightly into the surrounding crumb rather than a hard painted edge.", "evidenceRefs": ["view-front"], "appliesTo": ["cut-face"]}]
    return {
        "id": mid, "name": name, "type": "standard", "shaderModel": "MeshStandardMaterial carrier; runtime swaps to MeshLambertMaterial keeping only map and color",
        "baseColor": hexcolor, "color": hexcolor,
        "albedo": {"dominant": hexcolor, "secondary": [], "samplingNotes": "Hand-transcribed from assets/prompts/breads/campagne--strawberry-jam.json geometry (types.ts section 8 -- JSON import banned, hex is embedded in prose)."},
        "colorVariation": {"palette": [hexcolor], "pattern": "quantized bands", "amplitude": 0.3, "heightCorrelation": 0.4},
        "textureResolution": 512,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 1, "texelDensityIntent": f"All three logical materials (crust/crumb/jam) are baked into ONE shared 512px basecolor atlas canvas and rendered as a single mesh/material at build time (types.ts sections 1+9) -- {band_note}"},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.5, "role": "dome silhouette / wedge cutaway", "carrier": "geometry"},
            {"id": "meso", "frequency": 8.0, "amplitude": 0.05, "role": "banneton rings / starburst slash ears", "carrier": "geometry+texture"},
            {"id": "micro", "frequency": 20.0, "amplitude": 0.026, "role": "jam channel / pore dimples / flecks", "carrier": "geometry+texture"},
        ],
        "roughness": {"base": 1.0, "variation": 0.0, "map": "none", "localResponse": "inert - runtime Lambert swap discards roughness"},
        "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "smooth vertex normals", "strength": 1.0, "scale": 1.0, "space": "object"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": zone, "amplitude": 0.026, "scale": 1.0, "silhouetteAffects": mid == "crust"},
        "ambientOcclusion": {"cavityStrength": 0.0, "contactShadowBias": 0.0, "notes": "No AO channel on the runtime Lambert material."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#000000"},
        "localOverrides": override,
        "shaderNotes": ["Emit via scripts/breads/lib.ts stdMaterial(). Never vertexColors or flatShading."],
        "notes": f"{zone}. Basecolor canvas texture, no vertex color (scripts/breads/types.ts section 9).",
    }


MATERIALS = [
    material("crust", "Campagne crust (banded rings + starburst ears)", TOP_HEX, "whole dome crust surface, baked into the shared atlas", "crust occupies its own atlas region"),
    material("crumb", "Cut-face crumb background", CRUMB_HEX, "cut-face background around the jam spiral, baked into the shared atlas", "crumb occupies the atlas's face region"),
    material("jam", "Strawberry jam spiral", JAM_HEX, "cut-face jam swirl band + halo + edge flecks, baked into the shared atlas", "jam is painted within the crumb's atlas region, following the same distance field as the geometry channel"),
]

REPETITION_SYSTEMS = [
    {"id": "banneton-rings", "name": "Concentric banneton ring field", "level": "meso", "hostComponents": ["dome"], "elementComponentIds": ["dome"],
     "elementKind": "recessed profile modulation, not an added mesh", "count": GROOVE_COUNT, "countPerHost": {"dome": GROOVE_COUNT},
     "distribution": {"mode": "evenly spaced in tFrac across the groove zone, baked directly into the lathe profile", "zone": list(GROOVE_ZONE), "halfWidthT": GROOVE_HALF_WIDTH_T, "depth": GROOVE_DEPTH},
     "sizeClasses": [{"id": "ring", "halfWidthT": GROOVE_HALF_WIDTH_T, "depth": GROOVE_DEPTH}],
     "seedRule": "Fixed authored values (profile positions), not random -- ring count/spacing re-derived from the top-down view.", "evidenceRefs": ["view-top"]},
    {"id": "slash-ears", "name": "Starburst slash arms", "level": "meso", "hostComponents": ["dome"], "elementComponentIds": ["dome"],
     "elementKind": "recessed + raised vertex displacement, not an added mesh", "count": 4, "countPerHost": {"dome": 4},
     "distribution": {"mode": "4-fold rotational symmetry at 45/135/225/315deg, cosine angular falloff", "halfAngleDeg": SLASH_HALF_ANGLE_DEG, "tEnd": SLASH_T_END},
     "sizeClasses": [{"id": "arm", "halfAngleDeg": SLASH_HALF_ANGLE_DEG, "depth": SLASH_DEPTH, "earHeight": EAR_HEIGHT}],
     "seedRule": "Fixed authored angles, not random -- the starburst pattern is deliberate.", "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "cut-face-pair", "name": "Wedge cut-face pair", "level": "meso", "hostComponents": ["dome"], "elementComponentIds": ["cut-face"],
     "elementKind": "two mirrored instances of the same cut-face archetype, sharing one jam-swirl distance field", "count": 2, "countPerHost": {"dome": 2},
     "distribution": {"mode": "one at each of the two wedge boundary columns, winding reversed on the second so both face outward"},
     "sizeClasses": [{"id": "face", "radial": CUT_RADIAL, "rows": CUT_ROWS}],
     "seedRule": "Fixed columns (WEDGE_FIRST_SECTOR and WEDGE_FIRST_SECTOR+WEDGE_SECTOR_COUNT), not random.", "evidenceRefs": ["view-three-quarter", "view-top"]},
    {"id": "crumb-pore-dimples", "name": "Crumb pore dimple field", "level": "micro", "hostComponents": ["cut-face"], "elementComponentIds": ["cut-face"],
     "elementKind": "recessed vertex displacement sharing positions with painted texture pores, not an added mesh", "count": DIMPLE_COUNT, "countPerHost": {"cut-face": DIMPLE_COUNT},
     "distribution": {"mode": "rejection-sampled within the face disk (excluding the outer crust rim and base), sharing the same rng draw as the larger PORE_COUNT texture-only speckle set"},
     "sizeClasses": [{"id": "pore", "depth": 0.014}], "seedRule": "Builder rng, deterministic positions.", "evidenceRefs": ["view-three-quarter"]},
    {"id": "jam-edge-flecks", "name": "Jam edge fleck scatter", "level": "micro", "hostComponents": ["cut-face"], "elementComponentIds": ["cut-face"],
     "elementKind": "texture-only paint, no added geometry", "count": FLECK_COUNT, "countPerHost": {"cut-face": FLECK_COUNT},
     "distribution": {"mode": "rejection-sampled in a thin band just outside the jam channel's signed-distance boundary"},
     "sizeClasses": [{"id": "fleck", "radiusFrac": 0.01}], "seedRule": "Builder rng, deterministic positions.", "evidenceRefs": ["view-front"]},
]

FEATURE_REVIEW_TARGETS = [
    {"id": "dome-silhouette", "name": "Flattened dome silhouette with wedge cutaway", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["root", "dome"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "wedge-cutaway-orientation", "name": "Wedge faces the 3/4 review camera correctly", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["dome", "cut-face"], "evidenceRefs": ["view-three-quarter", "view-top"]},
    {"id": "dense-banneton-rings", "name": "Dense (not sparse) concentric banneton ring field", "tier": "critical", "passIds": ["surface-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["dome"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "starburst-slash", "name": "Pointed 4-blade starburst slash (not a soft cross)", "tier": "critical", "passIds": ["form-refinement"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["dome"], "evidenceRefs": ["view-top", "view-three-quarter"]},
    {"id": "jam-swirl-not-sticker", "name": "Jam swirl reads as baked-in structure, not a painted decal", "tier": "critical", "passIds": ["surface-pass", "material-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["cut-face"], "evidenceRefs": ["view-front", "view-three-quarter"]},
    {"id": "crust-gradient-and-dusting", "name": "Crust tonal banding (dark/mid/light)", "tier": "important", "passIds": ["material-pass"], "minimumScore": 0.6, "mustPass": False, "componentRefs": ["dome"], "evidenceRefs": ["view-front", "view-top"]},
    {"id": "crumb-pore-texture", "name": "Crumb reads as bread texture, not flat putty", "tier": "important", "passIds": ["surface-pass", "material-pass"], "minimumScore": 0.6, "mustPass": False, "componentRefs": ["cut-face"], "evidenceRefs": ["view-three-quarter"]},
    {"id": "smooth-clay-finish", "name": "Smooth (non-faceted) clay shading", "tier": "important", "passIds": ["surface-pass", "optimization-pass"], "minimumScore": 0.65, "mustPass": False, "componentRefs": ["dome", "cut-face"], "evidenceRefs": ["view-three-quarter"]},
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
    spec["coordinateFrame"] = {"front": "+Z, harness three-quarter camera at (-1.6, 2.2, 2.6)", "up": "+Y", "scaleReference": "unit radius dome; runtime refits longest axis to 1.6."}
    spec["referenceCamera"] = {"solved": False, "fovDegrees": 0.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.6, 2.2, 2.6], "note": "Fixed by scripts/breadlab.ts."}
    spec["silhouette"] = {
        "boundingShape": "round flattened dome (unit radius, height 0.76) with one ~67.5deg wedge removed down to the base",
        "aspectRatios": [{"id": "height-over-diameter", "value": DOME_HEIGHT / 2, "source": "assets/prompts/breads/campagne--strawberry-jam.json + campagne.ts front-elevation measurement"}],
        "symmetry": "base form radially symmetric, broken by 4-fold slash + one missing wedge sector -- net symmetry none, single dominant viewing side",
        "dominantCurves": ["smooth dome profile r=sqrt(1-t^2) with dense ring modulation"],
        "negativeSpaces": ["one quarter-ish wedge sector removed to the base"], "landmarks": ["dense banneton ring field", "4-blade starburst slash", "jam-swirl cut faces"],
    }
    spec["viewEvidence"] = [
        {"id": "view-three-quarter", "view": "three-quarter top-front", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
         "observations": ["dense concentric banneton rings across the whole dome", "4 sharp pointed slash ears meeting at the apex", "one wedge missing between two ears, exposing a jam-swirl cut face facing the camera"], "confidence": 0.95},
        {"id": "view-front", "view": "front elevation", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
         "observations": ["dome height/width ratio ~0.38", "the cut wedge sits centered, spiral clearly visible", "spiral has ~3.5-4 fairly regular turns"], "confidence": 0.95},
        {"id": "view-top", "view": "top-down", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
         "observations": ["wedge sits squarely between two of the 4 slash arms", "ring density and wedge angle both fully visible -- fixed measurement plane per CRIB"], "confidence": 0.97},
    ]
    spec["componentTree"] = [ROOT, DOME, CUT_FACE]
    spec["materials"] = MATERIALS
    spec["repetitionSystems"] = REPETITION_SYSTEMS
    spec["featureReviewTargets"] = FEATURE_REVIEW_TARGETS
    spec["performanceBudget"] = {"qualityPriority": "runtime-budget", "targetTriangles": 4200, "maxDrawCalls": 1, "textureSize": 512, "fpsTarget": 60,
        "optimizationPolicy": ("Variant/detail-bread tri band 3000-5000 / <=250KB (CRIB 2026-08-30 amendment for variants outside the closed public-10 budget). Indexed geometry retained where UV boundaries do not force vertex splitting (CRIB finish-contract note: campagne variant precedent halved GLB size at 2x the tri count).",)}
    spec["qualityTargets"] = {"targetFidelity": 0.8,
        "mustMatch": ["dense concentric banneton ring field", "pointed 4-blade starburst slash", "one wedge cutaway exposing a jam-swirl cross-section", "jam swirl reads as baked-in structure, not a sticker", "smooth (non-faceted) clay shading"],
        "niceToHave": ["crumb pore texture", "light flour dusting along the ridges", "jam edge flecks/bleed"],
        "fpsTarget": 60, "reviewViewpoints": ["three-quarter", "azimuth-90", "azimuth-180", "azimuth-270"]}
    spec["lookDevTargets"]["qualityPriority"] = "runtime-budget"
    spec["lookDevTargets"]["materialPass"].update({"roughnessVariationRequired": False, "normalOrBumpRequired": False, "minimumTextureResolution": 0, "preferredTextureResolution": 512, "independentMapChannels": [],
        "referencePbrExtraction": {"requiredWhenSourceImagePresent": False, "targetThreshold": 0.0, "stopOnLowConfidence": False, "script": "not run",
            "acceptedLimitation": "Runtime keeps only map+color, PBR maps banned (types.ts section 2). All relief lives in geometry; crust/crumb/jam are baked into one shared basecolor atlas."}})
    spec["lookDevTargets"]["lightingPass"] = {"requiredTerms": ["key light", "fill light", "ambient", "background", "no shadow map", "no tone mapping"], "authority": "Fixed by scripts/breadlab.ts / scripts/thumbsHarness.ts (recalibrated 2026-08-30, docs/VISUAL.md section 1-3 -- do not add gain/parity correction unless a fresh measured 3-tuple justifies it).", "mustAvoid": ["authoring lights into the model", "relying on a contact shadow the harness does not render", "re-adding a blanket channel-gain correction across the whole surface (kills contrast on features that need it, per CRIB)"]}
    spec["lightingFromPhoto"] = [
        {"id": "harness-key", "role": "key light", "observation": "Neutral white directional key at (-2, 6, 2), no exposure control, no tone mapping.", "usage": "Fixed by the harness.", "exposure": "no exposure control, no tone mapping."},
        {"id": "harness-ambient", "role": "ambient fill", "observation": "Neutral white-balanced ambient plus a black-sky hemisphere light for vertical-surface fill (recalibrated 2026-08-30).", "usage": "Fixed by the harness.", "contactShadow": "none - no shadow map or ground plane, so no contact shadow or ground shadow is rendered."},
        {"id": "harness-fill", "role": "rim/fill light", "observation": "Cool directional fill, low intensity.", "usage": "Fixed by the harness.", "toneMapping": "NoToneMapping."},
    ]
    spec["proceduralStrategy"] = [
        "Build one indexed lathe dome shell via buildGroovedDomeShell (domeShell.ts), with GROOVE_COUNT=16 rings baked into the profile (denser than base campagne's 8).",
        "Displace the 4-fold starburst slash (deeper trench, taller ear, narrower half-angle, shorter t-end than base) in the same (ring,sector) pass used by campagne.ts.",
        "Build the two cut-face grids analytically from the SAME pre-cut profile function before deleting the wedge sectors, so their outer boundary column is bit-identical to the dome's own wedge-boundary ring vertices (zero seam gap).",
        "Evaluate one shared jam-swirl signed-distance function for BOTH the geometry channel depth and the atlas texture color on the cut faces, so the painted band and the carved channel can never drift apart (CRIB 'sticker' lesson).",
        "Jitter only the dome shell vertices while indexed (small amplitude, bounded to <=1/20 of the smallest groove/slash span); apply zero post-hoc jitter to the cut-face grid, whose irregularity comes from the swirl/dimple/bump authoring functions instead (CRIB: jitter shreds small detail).",
        "Bake faceting OFF: computeVertexNormals() while indexed, THEN toNonIndexed() only if UV-boundary vertex splitting is actually required (2026-08-30 finish contract) -- prefer keeping the whole merged geometry indexed if the atlas UV layout allows it.",
        "Paint one shared 512px basecolor atlas (crust region + cut-face region) -- crust tonal bands correlated with the ring-groove phase, cut-face crumb/jam/pore/fleck all sampled from the same coordinate space as the geometry displacement.",
        "Project UVs analytically (top-down polar for crust, parametric rho/height for the cut faces, computed pre-displacement), merge everything by material into as few meshes as the shared atlas allows (types.ts section 1, target 1 mesh).",
    ]
    spec["assumptions"] = ["Bottom cap never visible above the horizon.", "Runtime normalizes longest axis to 1.6.", "Exact pore/fleck coordinates not identity-critical beyond count, irregularity, and their correlation with the jam-swirl distance field.", "Top-down view is the measurement-plane reference for ring density and wedge angle (CRIB lesson: 3/4 view foreshortens)."]
    spec["risks"] = [
        {"id": "sticker-relapse", "severity": "high", "description": "The single biggest historical failure mode for this exact bread: a flat colored jam band with no matching geometry channel reads as a decal/sticker (rejected build's own documented finding).", "mitigation": "Color and relief evaluate the same signed-distance-to-band function; never let the texture painter and the vertex displacement diverge."},
        {"id": "perfect-spiral-artifact", "severity": "medium", "description": "A mathematically perfect Archimedean spiral reads as an artificial drafting-compass curve.", "mitigation": "Non-integer-multiple sine wobble on both radius and thickness, seeded from rng, amplitude tuned down from the rejected build's research to match the new reference's tidier (but not perfect) spiral."},
        {"id": "wedge-orientation", "severity": "high", "description": "CRIB: asymmetric bread's #1 measured pitfall is a first-pass orientation error (scone: 180deg off, IoU 0.659 -> 0.821 after correction).", "mitigation": "Verify the wedge/cut-face visibility against the 3/4 camera azimuth explicitly at the blockout pass, before investing in surface/material passes."},
        {"id": "rim-chamfer", "severity": "medium", "description": "CRIB 2026-08-30 measured finding: sharing top-face/side-wall vertices under smooth normals chamfers the whole rim into a cushion look.", "mitigation": "Cut-face boundary column reuses the dome's own (jittered) ring vertices exactly, rather than an independently smoothed shared vertex."},
        {"id": "dense-grid-coupling", "severity": "medium", "description": "CRIB 2026-08-30 measured finding: grid-index-based distance/threshold checks quietly shrink in world units whenever grid resolution goes up (4 separate defects found in the focaccia--olive-flesh-v2 round alone).", "mitigation": "Every pore/dimple/fleck minimum-separation or radius check in the cut-face code is authored in world units, not grid-cell counts -- grep-audited after any grid resolution change."},
        {"id": "flat-shading-loss", "severity": "n/a (finish contract changed)", "description": "The pipeline's prior facet()-based finish is deprecated for this round; smooth normals are now the target look, not a defect to guard against.", "mitigation": "N/A -- documented so a future spec-refine does not silently revert to facet() by habit."},
        {"id": "merge-attribute-mismatch", "severity": "medium", "description": "mergeByMaterial throws on attribute-set mismatch.", "mitigation": "Every geometry gets position, normal, uv."},
    ]
    spec["animationAnchors"] = ["root pivot supports whole-object rotation for the showcase turntable"]
    spec["destructionAnchors"] = ["single fractureGroup; plausible break is along the wedge boundary, not modelled here"]
    trim_passes(spec)
    return spec


DETAIL_BINDINGS = {
    "banneton-rings": ("ridge", "dome-banneton-rings"),
    "starburst-slash": ("ridge", "dome-starburst-slash"),
    "wedge-cutaway": ("hole", "dome-wedge-cutaway"),
    "jam-swirl": ("hole", "cut-face-jam-swirl"),
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
    pre["objectClass"] = {"primaryType": "round campagne boule with a wedge cut exposing a strawberry-jam swirl", "primaryDomain": "object", "formLanguage": ["geometric (dome)", "hand-crafted (rings, slash)", "organic (jam swirl)"], "structureKind": ["single rotationally-symmetric body minus one sector", "two flat interior cut faces"], "motionPotential": ["static prop", "whole-object transform"], "materialFamilies": ["ceramic"], "notes": "Matte baked crust + matte crumb + non-glossy baked jam band, all in the same broad dielectric family as campagne/wholewheat precedent. Three logical albedo zones (crust/crumb/jam), reduced to a single shared basecolor atlas + target of 1 runtime mesh."}
    pre["complexity"] = {"tier": "simple",
        "scores": {"silhouetteComplexity": 2, "componentCount": 3, "hierarchyDepth": 2, "repetitionDensity": 3, "materialLayerCount": 3, "localDetailDensity": 3, "occlusionRisk": 0, "actionReadinessNeed": 0},
        "estimatedCounts": {"macroComponents": 2, "mesoComponents": 1, "microFeatureGroups": 6, "materialLayers": 3, "repetitionSystems": 5},
        "reasoning": ["One rotationally-symmetric macro body (dome) minus a sector, plus one repeated meso cut-face archetype.", "Silhouette is a flattened dome broken by 4 slash ears and one missing wedge.", "Repetition density 3: dense ring field + slash ears + cut-face pair, all identity-critical, plus pore/fleck micro scatters on the cut face.", "Three logical albedo zones (crust/crumb/jam) collapsed toward 1 runtime mesh via a shared atlas.", "Occlusion risk 0: the dome is convex and the wedge only removes material, it does not hide anything new.", "Action readiness 0: static showcase prop."]}
    pre["specDepthDecision"] = {"requiredDepth": "simple", "minimumComponentLevels": ["macro", "meso"], "needsRepetitionSystems": True, "needsMaterialLocalOverrides": False, "needsMultipleReviewViews": True, "needsActionReadyHierarchy": True, "rationale": "Simple tier but needs a meso cut-face node (repeated x2) plus 5 repetition systems so ring density, slash count, cut-face pairing, and the two cut-face micro scatters all attach to real geometry."}
    pre["detailInventory"] = {"scanMethod": "component-zones", "targetMinDetails": 4, "note": "Enumerated by hand (CRIB: skip build_detail_inventory.py's grid-scan for a single repeated-system object; still hand-fill the target count).",
        "details": [
            {"id": "banneton-rings", "zone": "dome crust", "observation": f"~{GROOVE_COUNT} closely-packed concentric ring bands covering nearly the whole dome.", "inference": "Banneton (proofing basket) coil markings, denser than the base campagne variant.", "mapsTo": {"ref": "dome-banneton-rings", "note": "component dome localFeatures + repetitionSystem banneton-rings"}, "confidence": 0.9, "evidenceRef": "campagne--strawberry-jam-3.png full frame"},
            {"id": "starburst-slash", "zone": "dome crown", "observation": "4 sharp pointed ears meeting at one apex, reading as a starburst.", "inference": "A deep cross-hatch score cut before baking, oven-sprung into raised, pointed ears.", "mapsTo": {"ref": "dome-starburst-slash", "note": "component dome localFeatures + repetitionSystem slash-ears"}, "confidence": 0.9, "evidenceRef": "campagne--strawberry-jam-3.png full frame"},
            {"id": "wedge-cutaway", "zone": "dome, one sector", "observation": "One sector missing between two slash arms, exposing an interior jam swirl.", "inference": "A wedge sliced away for photography/display, or to show off the filling.", "mapsTo": {"ref": "dome-wedge-cutaway", "note": "component dome localFeatures + repetitionSystem cut-face-pair"}, "confidence": 0.95, "evidenceRef": "campagne--strawberry-jam.png full frame"},
            {"id": "jam-swirl", "zone": "cut faces", "observation": "A ~3.5-4 turn red-pink spiral running through the pale crumb, present on both exposed cut faces.", "inference": "A rolled dough layer with jam spread before rolling, baked, then sliced perpendicular to the roll axis.", "mapsTo": {"ref": "cut-face-jam-swirl", "note": "component cut-face localFeatures"}, "confidence": 0.9, "evidenceRef": "campagne--strawberry-jam-2.png full frame"},
        ]}
    pre["unknownsToResolveBeforeImplementation"] = [
        "Bottom cap fully occluded; modelled as a plain flat crust cap, never visible above the horizon.",
        "Exact pore/fleck positions not identity-critical beyond count, irregularity, and correlation with the jam-swirl distance field.",
        "Crust/crumb/jam color cannot be preserved as three separate runtime meshes within the 2-mesh budget (types.ts section 1); resolved by baking all three into one shared basecolor atlas rendered as (ideally) a single mesh.",
        "The reference's exact jam-thickness irregularity (foreshortened differently between the 3/4 and front-elevation crops) is treated as approximate; the front-elevation view is used as the primary spiral-shape reference since it shows the full spiral face-on.",
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
