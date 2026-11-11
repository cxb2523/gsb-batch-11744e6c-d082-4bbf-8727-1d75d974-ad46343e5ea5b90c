/**
 * Batch Recorder CLI for StageFlow Blueprints (BP01–BP07).
 * Renders both Stage Camera POV and Observer Camera viewports at 30fps 720p.
 * Run via `npx vite-node scripts/record/batchRecord.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { findCatalogItem } from '../../src/core/scoreCatalog';
import { runRecordSession } from './playwrightDriver';
import type { CliOptions } from './recorderTypes';
import { RESOLUTION_PRESETS } from './recorderTypes';
import { ensureViteServer } from './serverManager';

interface BlueprintTarget {
  id: string;
  prefix: string;
  name: string;
}

const BLUEPRINT_TARGETS: BlueprintTarget[] = [
  { id: 'demo', prefix: 'BP01', name: 'Two_Shot_Arc_Blocking' },
  { id: 'blueprint-02', prefix: 'BP02', name: 'Cinematic_Dialogue_Flow' },
  { id: 'blueprint-03', prefix: 'BP03', name: 'The_Long_Distance_Pass' },
  { id: 'blueprint-04', prefix: 'BP04', name: 'Cinematography_and_Framing' },
  { id: 'blueprint-05', prefix: 'BP05', name: 'Two_Rooms_Threshold_Crossing' },
  { id: 'blueprint-06', prefix: 'BP06', name: 'Optics_Rack_Focus_DoF' },
  { id: 'blueprint-07', prefix: 'BP07', name: 'Camera_Rigs_and_Dolly_Tracks' },
];

const MODES: Array<{ mode: 'stage-pov' | 'scripted'; label: 'STAGE' | 'OBSERVER' }> = [
  { mode: 'stage-pov', label: 'STAGE' },
  { mode: 'scripted', label: 'OBSERVER' },
];

async function runBatch(): Promise<void> {
  const recordingsDir = path.resolve('recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  const res = RESOLUTION_PRESETS['720p'];
  const fps = 30;
  const server = await ensureViteServer(5173);

  console.log(`\n======================================================`);
  console.log(`🎬 StageFlow Batch Recorder: 7 Blueprints x 2 Viewports`);
  console.log(`Resolution: 720p (1280x720) | Framerate: 30 fps`);
  console.log(`Output Directory: ${recordingsDir}`);
  console.log(`======================================================\n`);

  const results: Array<{ file: string; size: string; status: string }> = [];

  try {
    for (const bp of BLUEPRINT_TARGETS) {
      const catalogItem = findCatalogItem(bp.id);
      if (!catalogItem) {
        console.error(`❌ Catalog item "${bp.id}" not found. Skipping.`);
        continue;
      }

      for (const { mode, label } of MODES) {
        const fileName = `${bp.prefix}_${label}_${bp.name}.mp4`;
        const outputPath = path.join(recordingsDir, fileName);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100_000) {
          const stats = fs.statSync(outputPath);
          const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`\n⏩ [${bp.prefix}] ${bp.name} (${label} Viewport) already rendered (${sizeMb} MB). Skipping.`);
          results.push({ file: fileName, size: `${sizeMb} MB`, status: 'EXISTS' });
          continue;
        }

        console.log(`\n▶️ Rendering [${bp.prefix}] ${bp.name} (${label} Viewport)...`);
        console.log(`   Destination: recordings/${fileName}`);

        const options: CliOptions = {
          sceneInput: bp.id,
          cameraMode: mode,
          labels: 'all',
          guides: false,
          hud: false,
          fps,
          width: res.width,
          height: res.height,
          format: 'mp4',
          outputPath,
          preview: false,
          port: 5173,
        };

        const startTime = Date.now();
        await runRecordSession(options, catalogItem.rawYaml, server.url);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`   ✅ Completed in ${elapsedSec}s (${sizeMb} MB)`);
          results.push({ file: fileName, size: `${sizeMb} MB`, status: 'OK' });
        } else {
          console.error(`   ❌ Output file missing: ${fileName}`);
          results.push({ file: fileName, size: '0 MB', status: 'FAILED' });
        }
      }
    }
  } finally {
    await server.close();
  }

  console.log(`\n======================================================`);
  console.log(`🎉 Batch Recording Complete! Summary:`);
  console.table(results);
  console.log(`======================================================\n`);
}

runBatch().catch((err) => {
  console.error('\n❌ Batch recording failed:', err);
  process.exit(1);
});

