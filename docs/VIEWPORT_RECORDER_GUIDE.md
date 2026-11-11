# StageFlow Viewport Video Recorder Guide (SSOT)

This document is the authoritative Single Source of Truth (SSOT) and comprehensive operating manual for StageFlow's **Deterministic 60fps Viewport Video Recorder** (`npm run record` / `npm run record:batch`).

---

## 1. Overview & Architectural Determinism

The StageFlow Viewport Video Recorder is an automated, headless recording CLI built directly into the repository (`scripts/record/*` and `src/recorder/*`). It allows directors, cinematographers, visualizers, and software agents to export broadcast-quality video and image sequences of any 3D choreography score with mathematical frame determinism.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CLI Invocation (npm run record)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│   Vite Server Manager (scripts/record/serverManager.ts)                │
│   Ensures local or background dev server on port 5173                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│   Playwright Driver (scripts/record/playwrightDriver.ts)               │
│   Launches headless Chromium at target resolution                      │
│   Navigates to ?mode=headless-render with bridge protocol               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│   Headless Recorder Viewport (src/recorder/HeadlessRecorderView.tsx)   │
│   Steps timeline deterministically: t_i = i / fps                      │
│   Evaluates: Frame_t = computeStageFrame(t_i, score)                   │
│   Renders Three.js diorama / Stage Cam viewfinder frame                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Raw PNG Buffer Stream (stdin)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│   FFmpeg Pipeline (scripts/record/ffmpegPipeline.ts)                   │
│   image2pipe ingestion: libx264 MP4, VP9 WebM, GIF, or PNG Sequence   │
│   Optional reference audio slapping / multiplexing (-ss, -shortest)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                   recordings/<scene>_<camera>.<format>
```

### The Determinism Invariant ($t_i = i / \text{fps}$)
Standard screen recording tools (OBS, QuickTime, browser screen capture) are fundamentally non-deterministic: if the CPU or GPU stutters, frames are dropped, frame pacing fluctuates, and audio desyncs.

StageFlow's recorder enforces **pure mathematical determinism**:
- Time does **not** advance in wall-clock time; it advances in discrete ticks:
  $$t_i = t_{\text{start}} + \frac{i}{\text{fps}}, \quad i \in \{0, 1, \dots, N-1\}$$
- At every step $i$, Playwright dispatches `window.__STAGEFLOW_RECORDER__.stepFrame(i)` to the in-browser React app, waits for Three.js to render the exact 3D frame, takes a raw screenshot buffer, and pipes it directly into FFmpeg's `image2pipe` stdin.
- The resulting video has **zero dropped frames, zero frame pacing stutter, and perfect A/V sync**, whether rendered on a high-end workstation or a headless CI server.

---

## 2. Prerequisites & System Setup

The recorder requires **Node.js ($\ge 18$)**, **Playwright Chromium**, and **FFmpeg**.

### 2.1 Playwright Chromium Installation
On a fresh clone or environment, install Playwright's headless Chromium browser:

```bash
npx playwright install chromium
```

### 2.2 FFmpeg Installation & Verification
FFmpeg is required to encode raw image buffers into `.mp4`, `.webm`, or `.gif`.

- **Windows**:
  ```powershell
  winget install Gyan.FFmpeg
  ```
- **macOS**:
  ```bash
  brew install ffmpeg
  ```
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt update && sudo apt install -y ffmpeg
  ```

#### Automatic Path Discovery
`scripts/record/ffmpegPipeline.ts` automatically resolves the FFmpeg binary in the following order:
1. Environment variable `process.env.FFMPEG_PATH`.
2. System `ffmpeg` or `ffmpeg.exe` on your system `PATH`.
3. User Winget Gyan installation directory (`AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*`).
4. Playwright's bundled fallback FFmpeg (`AppData/Local/ms-playwright/ffmpeg-*`).

To verify your installation:
```bash
ffmpeg -version
```

---

## 3. Quickstart & Command Syntax

Run the recorder via npm:

```bash
npm run record [scene] [options]
```

### 3.1 Scene Argument Resolution
The first positional argument specifies which score to render. It accepts:
- **Blueprint Numeric Shortcuts**: `01`, `02`, `03`, `04`, `05`, `06`, `07` (or `bp01`–`bp07`).
- **Scene Study Shortcuts**: `vf`, `vector-field`, `vector_field`.
- **Canonical Slugs**: `demo`, `blueprint-02`, `the-expansion`, `afraid`.
- **Custom Local Files**: Any local path (e.g. `path/to/my_score.yaml` or `my_score.json`).
- **Default**: If omitted, defaults to `01` (`blueprint_01_two_shot_arc`).

```bash
# Render Blueprint 01 (Observer View, 1080p 60fps)
npm run record 01

# Render Scene Study "Vector Field"
npm run record vf

# Render a custom local choreography file
npm run record src/scores/studies/afraid.yaml
```

---

## 4. Complete CLI Options Matrix

All options must be preceded by `--` when invoking via `npm run record`:

| Flag | Parameter / Choices | Default | Directorial Role & Description |
| :--- | :--- | :---: | :--- |
| **`--camera`** | `scripted` \| `stage-pov` | `scripted` | **`scripted`**: Macro 3D observer diorama.<br>**`stage-pov`**: Physical camera viewfinder through the director's lens. |
| **`--blur`**, **`--dof-blur`** | — | Score default | Forces thin-lens Depth-of-Field bokeh blur **ON** in Stage Cam POV mode. |
| **`--no-blur`** | — | Score default | Forces thin-lens Depth-of-Field bokeh blur **OFF** in Stage Cam POV mode. |
| **`--preset`** | `iso` \| `top` \| `front` \| `side` | Autored | Snaps Observer Camera to an architectural angle preset (`isometric`, `top-down`, `front`, `side`). |
| **`--theme`** | `dark` \| `warm` \| `light` | `dark` | 3D diorama floor & background palette (`dark` obsidian, `warm` drafting paper, `light` stone). |
| **`--labels`** | `all` \| `camera-only` \| `off`| `all` | Controls 3D billboard identity badges and floor compass markers. |
| **`--guides`** | — | `false` | Displays SMPTE 90% safe action frame, rule-of-thirds grid, and center optical crosshairs. |
| **`--hud`** | — | `false` | Renders 2D top-left shot breakdown HUD and bottom-right camera telemetry capsule. |
| **`--res`** | `1080p` \| `4k` \| `720p` \| `square` \| `vertical` | `1080p` | Preset canvas dimensions (see §4.1). |
| **`--width`** | `<pixels>` | Preset width | Overrides canvas pixel width (e.g. `--width 1920`). |
| **`--height`** | `<pixels>` | Preset height| Overrides canvas pixel height (e.g. `--height 1080`). |
| **`--fps`** | `<number>` | `60` | Locked rendering frame rate (`24`, `30`, `60`). |
| **`--format`** | `mp4` \| `webm` \| `gif` \| `sequence` | `mp4` | Video container or image sequence format (see §4.2). |
| **`--shot`** | `<shot_id>` | Entire scene | Slices render window strictly to a single shot cue (e.g. `--shot shot_01`). |
| **`--start`** | `<seconds>` | `0.0` | Custom starting timestamp in seconds. |
| **`--end`** | `<seconds>` | Scene duration | Custom ending timestamp in seconds. |
| **`--audio`** | `<file_path>` | None | Muxes audio track from reference media file onto output with exact sync. |
| **`-o`**, **`--output`**| `<file_path>` | `recordings/...`| Destination file or directory path. |
| **`--preview`** | — | `false` | Launches Chromium in headed mode so you can watch the frame stepping live. |
| **`--port`** | `<number>` | `5173` | Local Vite dev server port. |
| **`-h`**, **`--help`** | — | — | Prints the built-in CLI help guide and exits. |

### 4.1 Resolution Presets (`--res`)

| Preset Key | Dimensions ($W \times H$) | Aspect Ratio | Directorial Target |
| :--- | :---: | :---: | :--- |
| **`1080p`** *(default)* | $1920 \times 1080$ | `16:9` | Standard Full HD web/desktop video |
| **`4k`** | $3840 \times 2160$ | `16:9` | Ultra-High-Definition master render |
| **`720p`** | $1280 \times 720$ | `16:9` | Lightweight preview / fast batch rendering |
| **`square`** | $1080 \times 1080$ | `1:1` | Instagram / Square social feeds |
| **`vertical`** | $1080 \times 1920$ | `9:16` | TikTok / Instagram Reels / YouTube Shorts |

### 4.2 Output Formats & Encoding Specifications (`--format`)

| Format Key | Video Codec | Audio Codec | Compression Parameters | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **`mp4`** *(default)* | `libx264` (`yuv420p`) | `aac` (`192k`) | `-preset medium -crf 18 -movflags +faststart` | Universal web playback, Premiere, DaVinci Resolve |
| **`webm`** | `libvpx-vp9` | `libopus` (`128k`)| `-crf 24 -b:v 0` | Modern HTML5 web embeds |
| **`gif`** | Palettized GIF | None | 2-pass `palettegen` + `paletteuse` filter graph | High-quality animated README previews (no banding) |
| **`sequence`** | Raw PNG frames | None | Lossless `frame_00000.png` ... `frame_NNNNN.png` | VFX compositing, After Effects image sequence import |

---

## 5. Viewports, Optics & Framing Grammar

StageFlow's recorder gives you complete control over whether you are observing the stage as an architect or shooting the scene as a director.

### 5.1 Scripted Observer Diorama (`--camera scripted`)
The default diorama mode. Renders the 3D proscenium stage with floor grid, cardinal orientation markers (`+Z Downstage`, `-Z Upstage`), actor mannequins, and the physical Stage Camera chassis with its moving frustum cone and focus tether.

- **Angle Presets (`--preset`)**:
  Override the scripted observer camera with standard architectural isometric angles:
  ```bash
  # Isometric 45° architectural diorama
  npm run record 01 -- --preset iso

  # Pure Top-Down floor plan view (looking straight down along -Y)
  npm run record 01 -- --preset top

  # Front proscenium view
  npm run record 01 -- --preset front

  # Side profile view
  npm run record 01 -- --preset side
  ```

### 5.2 Stage Camera POV (`--camera stage-pov`)
Switches the viewport directly to the camera's optical nodal point looking through the film lens.
- Automatically frames the scene with the film aspect ratio (`16:9`, `2.39:1`).
- Automatically unmounts 3D floor compass markers and floating mannequin identity badges for clean, cinematic actor silhouettes.
- Dynamically respects prime focal length swaps (`24mm`, `35mm`, `50mm`, `85mm`) and continuous zoom sweeps.

#### Thin-Lens Depth of Field (`--blur` / `--dof-blur`)
When recording in Stage Cam POV, StageFlow can render real-time optical thin-lens Depth-of-Field using a single-pass WebGL2 Vogel disk bokeh shader:
```bash
# Force DoF bokeh blur ON
npm run record 06 -- --camera stage-pov --blur -o rack_focus.mp4

# Force DoF bokeh blur OFF
npm run record 06 -- --camera stage-pov --no-blur -o pinhole_sharp.mp4
```

#### Viewfinder Safe Guides (`--guides`)
Overlays SMPTE 90% Safe-Action dashed frame, Rule-of-Thirds grid, and Center Optical Crosshairs:
```bash
npm run record 01 -- --camera stage-pov --guides -o stage_pov_guides.mp4
```

---

## 6. Visual Presentation & Theming

### 6.1 Diorama Stage Themes (`--theme`)
Adapts WebGL background clear color, scene depth fog, and metric floor grid materials with zero extra shader overhead:
- **`--theme dark`** *(default)*: High-contrast obsidian studio void (`#171514`) with cyan and slate precision grid lines.
- **`--theme warm`**: Architectural ivory drafting paper (`#faf7f0`) with subtle warm grey grid lines.
- **`--theme light`**: Clean architectural stone white (`#ffffff`) with warm stone grid lines.

```bash
npm run record 04 -- --theme warm --preset iso -o warm_isometric.mp4
```

### 6.2 Label Modes (`--labels`)
- **`--labels all`** *(default)*: Renders stylized 3D floating identity badges on character mannequins, props, and camera.
- **`--labels camera-only`**: Hides actor and prop labels, keeping only the Stage Camera badge.
- **`--labels off`**: Hides all 3D HTML labels and floor cardinal orientation tags for 100% clean, pristine diorama geometry.

```bash
npm run record 02 -- --labels off -o clean_geometry.mp4
```

---

## 7. Directorial Recipes & Production Blueprints

### Recipe 1: 4K 24fps Anamorphic Stage Cam POV Master
Export a cinematic, high-fidelity director's cut in `2.39:1` scope with optical DoF blur at standard 24fps motion cadence:

```bash
npm run record 06 -- \
  --camera stage-pov \
  --blur \
  --fps 24 \
  --res 4k \
  -o recordings/BP06_4K_Cinematic_Master.mp4
```

### Recipe 2: 9:16 Vertical Reel for Mobile / Social Media
Export a vertical video tailored for Instagram Reels, YouTube Shorts, or TikTok with center-framed actor blocking:

```bash
npm run record 01 -- \
  --camera stage-pov \
  --res vertical \
  --fps 30 \
  -o recordings/BP01_Vertical_Reel.mp4
```

### Recipe 3: High-Fidelity Animated GIF of Isometric Choreography
Render a high-density, loopable animated GIF using two-pass color quantization with zero banding:

```bash
npm run record 01 -- \
  --preset iso \
  --labels off \
  --format gif \
  --fps 30 \
  --res 720p \
  -o recordings/BP01_Choreography.gif
```

### Recipe 4: Isolated Single-Shot Slice with Reference Audio
Slice a single 4-second dialogue shot from Blueprint 02, extract and slap the audio track from a reference video, and export cleanly:

```bash
npm run record 02 -- \
  --shot shot_01 \
  --camera stage-pov \
  --audio path/to/reference_dialogue.mp4 \
  -o recordings/BP02_Shot01_Slapped.mp4
```

### Recipe 5: Top-Down 2D Architectural Floor-Plan Pass
Render a pure top-down plan view showing character trajectory floor trails and camera movement arcs across the stage grid:

```bash
npm run record 05 -- \
  --preset top \
  --theme warm \
  --labels all \
  --res 1080p \
  -o recordings/BP05_Floor_Plan.mp4
```

---

## 8. Automated Batch Recording (`record:batch`)

StageFlow includes a dedicated batch automation script that iterates across all 7 bundled blueprints (BP 01 through BP 07) and renders **both** the Stage Camera POV and the Scripted Observer Camera viewports at 720p 30fps (14 reference videos total):

```bash
# Run automated batch recording
npm run record:batch
```

### Intelligent Resume Caching
The batch runner checks `recordings/` before launching each job. If a valid render exceeding `100 KB` already exists on disk, it automatically logs `⏩ [BPxx] already rendered. Skipping.` and advances to the next scene, allowing interrupted batch runs to resume instantly without redundant re-encoding.

Generated asset naming convention:
- `BP01_STAGE_Two_Shot_Arc_Blocking.mp4`
- `BP01_OBSERVER_Two_Shot_Arc_Blocking.mp4`
- `...`
- `BP07_STAGE_Camera_Rigs_and_Dolly_Tracks.mp4`
- `BP07_OBSERVER_Camera_Rigs_and_Dolly_Tracks.mp4`

---

## 9. Troubleshooting & Common Pitfalls

### Issue: `FFmpeg stdin closed prematurely` / `ffmpeg: command not found`
- **Cause**: FFmpeg is not installed or the executable path is not available on your system `PATH`.
- **Solution**:
  1. Verify with `ffmpeg -version`.
  2. If using Windows, ensure Gyan FFmpeg is installed (`winget install Gyan.FFmpeg`) and restart your terminal.
  3. Alternatively, export `FFMPEG_PATH="C:\path\to\ffmpeg.exe"` before running the command.

### Issue: `Executable doesn't exist at .../chrome-win/chrome.exe`
- **Cause**: Playwright's headless Chromium browser has not been downloaded yet.
- **Solution**:
  ```bash
  npx playwright install chromium
  ```

### Issue: Audio track length cuts off video or freezes on final frame
- **Cause**: Audio file duration is shorter or longer than the score time window.
- **Solution**:
  StageFlow uses FFmpeg's `-shortest` flag by default. If your reference audio is shorter than the scene, FFmpeg will cleanly terminate video stream encoding at the end of the audio track. To avoid truncation, ensure the reference audio file spans the full duration of the scene or author explicit `--start` and `--end` timestamps.

### Issue: WebGL Canvas Renders Blank / Black Screen in Headless Linux
- **Cause**: Linux server or CI environment lacks hardware OpenGL drivers.
- **Solution**:
  `scripts/record/playwrightDriver.ts` automatically passes `--use-gl=angle`, `--use-angle=swiftshader`, and `--enable-webgl` to Chromium, providing software WebGL acceleration on headless machines. Ensure `xvfb` or standard mesa software packages (`libgl1-mesa-glx`) are installed on Linux CI runners.

### Issue: Live Inspection during Recording
- If you want to visually watch the camera moves and actor blocking in real time as frames are being stepped, pass `--preview`:
  ```bash
  npm run record 01 -- --preview
  ```

