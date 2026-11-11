---
name: stageflow-viewport-recorder
description: >-
  Record deterministic 60fps viewport playback videos (Scripted Observer View, Stage Camera POV,
  or clean diorama) from bundled or custom YAML scene scores using Playwright and FFmpeg, with optional
  reference audio track syncing. Use when the user asks to record, export, capture, or render a video
  of a StageFlow scene, camera move, diorama viewport, or stage camera viewfinder.
---

# StageFlow Viewport Video Recorder Skill

This skill guides the agent in running and configuring StageFlow's deterministic 60fps headless viewport recording tool (`npm run record`).

---

## 1. Core Workflow & Mechanics

StageFlow records viewports using **deterministic frame-stepping** ($t_i = i / \text{fps}$):
- Driven by **Playwright** (headless Chromium with hardware WebGL) and **FFmpeg**.
- Renders through an isolated, chrome-free WebGL container at `http://localhost:5173/?mode=headless-render`.
- Steps each frame via `window.__STAGEFLOW_RECORDER__.stepFrame(i)` before piping raw PNG screenshots to FFmpeg stdin (`image2pipe`).
- **Guarantees zero dropped frames, zero stutter, and zero timing drift**, regardless of machine speed.
- Output defaults to **completely silent** for fast, offline, and self-contained execution.

> 📖 **Comprehensive User Guide**: For complete resolution matrices, encoder specifications, batch automation, and 5 production recipes, see [`docs/VIEWPORT_RECORDER_GUIDE.md`](../../../docs/VIEWPORT_RECORDER_GUIDE.md).

---

## 2. CLI Command Syntax

```bash
npm run record [scene] [options]
```

### Arguments
- **`scene`**:
  - Bundled shortcut: `01`–`07`, `vf`, or any canonical slug / alias registered in [`src/scores/catalog.yaml`](../../../src/scores/catalog.yaml) (see [`docs/SCORE_CATALOG.md`](../../../docs/SCORE_CATALOG.md)).
  - Custom file path: `path/to/my_scene.yaml` or `.json`
  - Default: `01` (`demo`)

### Options Reference

| Flag | Values | Description | Default |
| :--- | :--- | :--- | :--- |
| `--camera` | `scripted` \| `stage-pov` | Viewport camera mode: Scripted Observer diorama or Stage Camera POV | `scripted` |
| `--blur`, `--dof-blur` | Flag | Force single-pass WebGL2 thin-lens depth of field bokeh blur ON (Stage Cam POV) | Auto (inherits from `score.optics.dofBlur`) |
| `--no-blur` | Flag | Force thin-lens depth of field bokeh blur OFF | Auto |
| `--theme` | `dark` \| `warm` \| `light` | Diorama theme palette (background, metric grid, floor stone) | `dark` |
| `--labels` | `all` \| `camera-only` \| `off` | Floating 3D Drei HTML character & camera badges | `all` |
| `--guides` | Flag | Show optical safe-action frame, rule-of-thirds grid, and reticle | Off |
| `--hud` | Flag | Show 2D shot breakdown and degree/meter telemetry badges | Off |
| `--audio` | `<path>` | Path to local reference video/audio to slap audio track onto output (visuals excluded) | None (silent) |
| `--shot` | `<shot_id>` | Auto-slice start and end timestamps for a single shot cue (e.g. `shot_01`) | Full scene |
| `--start` / `--end` | `<seconds>` | Custom start and end timestamps | Full scene |
| `--preset` | `isometric` (`iso`) \| `top-down` (`top`) \| `front` \| `side` | Fixed architectural diorama camera angles | None |
| `--fps` | `24` \| `30` \| `60` | Locked framerate | `60` |
| `--res` | `1080p` \| `4k` \| `720p` \| `square` \| `vertical` | Resolution preset | `1080p` (1920x1080) |
| `--width` / `--height` | `<pixels>` | Custom output dimensions | From `--res` |
| `--format` | `mp4` \| `webm` \| `gif` \| `sequence` | Output format | `mp4` (H.264 / AAC) |
| `-o, --output` | `<path>` | Destination file path | `recordings/<scene>_<camera>.<ext>` |
| `--preview` | Flag | Show visible Chromium browser window during recording | Headless |

---

## 3. High-Value Directorial Recipes

### Recipe A: Scripted Observer Diorama (Standard Baseline)
Exports the full 3D diorama along the authored observer camera path:
```bash
npm run record 01
```

### Recipe B: Director's Stage Camera POV with Viewfinder Guides
Records directly through the physical camera's optical lens ($24\text{mm}$, $35\text{mm}$, $50\text{mm}$, $85\text{mm}$) with the composition reticle:
```bash
npm run record 01 -- --camera stage-pov --guides -o recordings/stage_pov.mp4
```

### Recipe C: Optical Rack Focus with Thin-Lens Bokeh Blur
Records Stage Camera POV through Blueprint 06 with active single-pass WebGL2 bokeh blur, thin-lens depth of field, and optical safe-action composition guides:
```bash
npm run record 06 -- --camera stage-pov --blur --guides -o recordings/bp06_rack_focus_blur.mp4
```

### Recipe D: Warm Architectural Drafting Paper Theme
Renders an architectural overview of Blueprint 05 (Two Rooms Traversal) in the warm paper diorama theme from an isometric perspective:
```bash
npm run record 05 -- --preset iso --theme warm -o recordings/bp05_two_rooms_warm.mp4
```

### Recipe E: Clean Minimalist Diorama (Zero DOM Badges)
Renders pure 3D geometry only (metric floor grid, mannequins with directional visors/chevrons, stage camera chassis, and frustum lines):
```bash
npm run record 02 -- --labels off -o recordings/clean.mp4
```

### Recipe F: Custom Score with Slapped Audio from Reference Video
Records a user-authored `.yaml` score and extracts/muxes the audio track from local reference footage:
```bash
npm run record path/to/my_scene.yaml -- --audio path/to/reference_video.mp4 -o my_recording.mp4
```
> [!NOTE]
> The reference video image is completely excluded—only its synchronized audio track is muxed into the output MP4.

### Recipe G: Single Shot Cue in 4K
Slices a specific shot cue and renders in ultra-high resolution:
```bash
npm run record 04 -- --shot shot_02 --res 4k -o recordings/shot02_4k.mp4
```

### Recipe H: Isometric Schematic Angle at 24fps
Renders an architectural isometric perspective overview at cinematic film framerate:
```bash
npm run record 03 -- --preset isometric --fps 24 -o recordings/isometric_24fps.mp4
```

---

## 4. Verification & Stream Inspection

After recording completes, verify stream specs using `ffprobe`:
```bash
ffprobe -v error -show_entries stream=index,codec_name,codec_type,r_frame_rate,duration,channels -of json <output_path>
```
Confirm:
1. `codec_name`: `"h264"`
2. `r_frame_rate`: `"60/1"` (or specified `--fps`)
3. `duration`: matches expected time range
4. If `--audio` was used: stream 1 has `codec_name: "aac"` with 2 channels.
