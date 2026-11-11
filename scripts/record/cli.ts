/**
 * Command-Line Interface for StageFlow deterministic 60fps recording.
 * Run via `npm run record [scene] [options]`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_CATALOG_ITEMS, findCatalogItem } from '../../src/core/scoreCatalog';
import { parseStageScore } from '../../src/core/scoreParser';
import type {
  AppThemeCategory,
  CameraViewMode,
  LabelDisplayMode,
} from '../../src/core/types';
import { CAMERA_PRESETS } from './cameraPresets';
import { runRecordSession } from './playwrightDriver';
import type { CliOptions, ResolutionPresetKey } from './recorderTypes';
import { RESOLUTION_PRESETS } from './recorderTypes';
import { ensureViteServer } from './serverManager';

function printHelp(): void {
  console.log(`
StageFlow Deterministic 60fps Viewport Recorder CLI

Usage:
  npm run record [scene] [options]

Arguments:
  scene                   Bundled shortcut (01-06, vf, vector-field)
                          or bundled ID (blueprint_01_two_shot_arc, etc.)
                          or a path to a custom .yaml / .json file.
                          Default: "blueprint_01_two_shot_arc".

Options:
  --camera <mode>         "scripted" (default) or "stage-pov"
  --blur, --dof-blur      Force thin-lens DoF bokeh blur ON (Stage Cam POV)
  --no-blur               Force thin-lens DoF bokeh blur OFF
  --theme <category>      Diorama theme: "dark" (default), "warm", or "light"
  --labels <mode>         "all" (default), "camera-only", or "off"
  --guides                Show optical viewfinder composition guides
  --hud                   Include 2D shot breakdown and telemetry badges
  --preset <name>         Camera angle preset: isometric (iso), top-down (top), front, side
  --shot <shot_id>        Record only a specific shot (e.g. shot_01)
  --start <sec>           Custom start timestamp in seconds
  --end <sec>             Custom end timestamp in seconds
  --audio <file>          Path to reference video/audio to slap audio track onto output
  --fps <number>          Locked framerate (default: 60)
  --res <preset>          Resolution preset: 1080p, 4k, 720p, square, vertical
  --width <w>             Custom pixel width (e.g. 1920)
  --height <h>            Custom pixel height (e.g. 1080)
  --format <fmt>          mp4 (default), webm, gif, sequence
  -o, --output <path>     Destination file path
  --preview               Show Chromium browser window during recording
  --port <number>         Vite dev server port (default: 5173)
  -h, --help              Show this help message

Examples:
  npm run record 01
  npm run record 06 -- --camera stage-pov --blur -o rack_focus.mp4
  npm run record 01 -- --camera stage-pov -o stage_pov.mp4
  npm run record 02 -- --labels off --shot shot_01 -o clean_shot.mp4
  npm run record 04 -- --preset isometric --res 4k --theme warm -o overview_warm.mp4
`);
}

function resolveScoreYaml(input: string): { yaml: string; id: string } {
  // Check if file exists on disk
  if (fs.existsSync(input)) {
    const yaml = fs.readFileSync(input, 'utf-8');
    const filename = path.basename(input, path.extname(input));
    return { yaml, id: filename };
  }

  // Check direct canonical ID or alias match
  const directMatch = findCatalogItem(input);
  if (directMatch) {
    return { yaml: directMatch.rawYaml, id: directMatch.id };
  }

  // Check aliases for study scenes: vf, vector_field, vector-field
  const normalized = input.trim().toLowerCase().replace(/_/g, '-');
  if (
    normalized === 'vf' ||
    normalized === 'vector-field' ||
    normalized === 'vectorfield'
  ) {
    const vfItem = findCatalogItem('vector-field');
    if (vfItem) {
      return { yaml: vfItem.rawYaml, id: vfItem.id };
    }
  }

  // Check numeric shortcuts: 01, 02, 03, 04, 05, 06, 07 (mapped to Blueprint numbers)
  const numMatch = input.match(/^(?:bp)?0?([1-9]\d*)$/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const targetBpId = num === 1 ? 'demo' : `blueprint-0${num}`;
    const bpItem = findCatalogItem(targetBpId);
    if (bpItem) {
      return { yaml: bpItem.rawYaml, id: bpItem.id };
    }
  }

  // Check catalog IDs or substring matches (e.g. vector-field, demo-blueprint, optics-dof)
  const catalogItem = INITIAL_CATALOG_ITEMS.find(
    (item) =>
      item.id.toLowerCase() === normalized ||
      item.id.toLowerCase().includes(normalized) ||
      item.id.toLowerCase().replace(/-/g, '_').includes(input.toLowerCase()) ||
      item.aliases?.some((a) => a.toLowerCase().includes(normalized))
  );
  if (catalogItem) {
    return { yaml: catalogItem.rawYaml, id: catalogItem.id };
  }

  throw new Error(
    `Unknown scene: "${input}". Provide a valid file path or bundled ID (${INITIAL_CATALOG_ITEMS.map((i) => i.id).join(', ')}).`
  );
}

function parseArgs(args: string[]): CliOptions {
  let sceneInput = 'blueprint_01_two_shot_arc';
  let cameraMode: CameraViewMode = 'scripted';
  let presetName: string | undefined;
  let labels: LabelDisplayMode = 'all';
  let guides = false;
  let hud = false;
  let dofBlur: boolean | undefined = undefined;
  let theme: AppThemeCategory | undefined = undefined;
  let fps = 60;
  let resPreset: ResolutionPresetKey = '1080p';
  let customWidth: number | undefined;
  let customHeight: number | undefined;
  let shotId: string | undefined;
  let startSec: number | undefined;
  let endSec: number | undefined;
  let audioPath: string | undefined;
  let format: 'mp4' | 'webm' | 'gif' | 'sequence' = 'mp4';
  let outputPath: string | undefined;
  let preview = false;
  let port = 5173;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--camera' && args[i + 1]) {
      cameraMode = args[++i] as CameraViewMode;
    } else if (arg === '--blur' || arg === '--dof-blur') {
      dofBlur = true;
    } else if (arg === '--no-blur' || arg === '--no-dof-blur') {
      dofBlur = false;
    } else if (arg === '--theme' && args[i + 1]) {
      theme = args[++i] as AppThemeCategory;
    } else if (arg === '--labels' && args[i + 1]) {
      labels = args[++i] as LabelDisplayMode;
    } else if (arg === '--guides') {
      guides = true;
    } else if (arg === '--hud') {
      hud = true;
    } else if (arg === '--preset' && args[i + 1]) {
      presetName = args[++i];
    } else if (arg === '--shot' && args[i + 1]) {
      shotId = args[++i];
    } else if (arg === '--start' && args[i + 1]) {
      startSec = parseFloat(args[++i]);
    } else if (arg === '--end' && args[i + 1]) {
      endSec = parseFloat(args[++i]);
    } else if (arg === '--fps' && args[i + 1]) {
      fps = parseInt(args[++i], 10);
    } else if (arg === '--res' && args[i + 1]) {
      resPreset = args[++i] as ResolutionPresetKey;
    } else if (arg === '--width' && args[i + 1]) {
      customWidth = parseInt(args[++i], 10);
    } else if (arg === '--height' && args[i + 1]) {
      customHeight = parseInt(args[++i], 10);
    } else if (arg === '--format' && args[i + 1]) {
      format = args[++i] as 'mp4' | 'webm' | 'gif' | 'sequence';
    } else if (arg === '--audio' && args[i + 1]) {
      audioPath = args[++i];
    } else if ((arg === '-o' || arg === '--output') && args[i + 1]) {
      outputPath = args[++i];
    } else if (arg === '--preview') {
      preview = true;
    } else if (arg === '--port' && args[i + 1]) {
      port = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      sceneInput = arg;
    }
    i++;
  }

  const dimensions = RESOLUTION_PRESETS[resPreset] ?? RESOLUTION_PRESETS['1080p'];
  const width = customWidth ?? dimensions.width;
  const height = customHeight ?? dimensions.height;

  if (!outputPath) {
    const ext = format === 'sequence' ? '' : `.${format}`;
    outputPath = path.join('recordings', `${sceneInput}_${cameraMode}${ext}`);
  }

  if (audioPath) {
    const resolvedAudio = path.resolve(audioPath);
    if (!fs.existsSync(resolvedAudio)) {
      throw new Error(`Audio file not found: "${audioPath}"`);
    }
    audioPath = resolvedAudio;
  }

  const customPose = presetName && CAMERA_PRESETS[presetName]
    ? CAMERA_PRESETS[presetName]
    : undefined;

  return {
    sceneInput,
    cameraMode,
    preset: presetName as CliOptions['preset'],
    customPose,
    labels,
    guides,
    hud,
    dofBlur,
    theme,
    fps,
    width,
    height,
    startSec,
    endSec,
    shotId,
    audioPath,
    format,
    outputPath,
    preview,
    port,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { yaml, id: sceneId } = resolveScoreYaml(options.sceneInput);

  // If a specific shot was requested, extract shot timestamps
  if (options.shotId) {
    const parsed = parseStageScore(yaml);
    const targetShot = parsed.score?.shots.find(
      (s) => s.id.toLowerCase() === options.shotId!.toLowerCase()
    );
    if (!targetShot) {
      throw new Error(
        `Shot "${options.shotId}" not found in scene "${sceneId}". Available shots: ${parsed.score?.shots.map((s) => s.id).join(', ')}`
      );
    }
    options.startSec = targetShot.startSec;
    options.endSec = targetShot.endSec;
  }

  const server = await ensureViteServer(options.port);

  try {
    await runRecordSession(options, yaml, server.url);
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Recording failed:', err.message);
  process.exit(1);
});
