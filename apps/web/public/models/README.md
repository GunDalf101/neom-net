# Hologram model

Drop a glTF binary here as `hologram.glb` and the cyberware figure on the Character page renders it
as a three.js hologram (fresnel glow, scanlines, slow sway on a lit platform). Without the file the
page falls back to the built-in SVG figure, so the model is optional.

- Any humanoid works; A-pose or T-pose frames best. Textures are ignored (the hologram shader replaces
  every material), so a textureless or low-poly export is fine and loads faster.
- Draco-compressed meshes are supported (decoder served from `/draco/`).
- Keep it reasonably small (a few MB). The file is fetched at runtime and cached by the PWA.
- Slot anchors (eyes, torso, hands…) are snapped to the nearest surface point of the loaded mesh from
  the targets in `src/components/hud/HoloModel.tsx` (`ANCHOR_TARGETS`, normalised: feet at 0, head at 1).
