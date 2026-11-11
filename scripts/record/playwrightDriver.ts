/**
 * Playwright Chromium driver orchestrating deterministic frame-stepping and capture.
 */

import { chromium } from 'playwright';
import type { CliOptions } from './recorderTypes';
import { createFfmpegPipeline } from './ffmpegPipeline';
import type { RecorderConfig } from '../../src/recorder/recorderTypes';

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${String(mins).padStart(2, '0')}:${secs.padStart(5, '0')}`;
}

function renderProgressBar(
  current: number,
  total: number,
  shotId: string | null,
  timestampSec: number,
  fpsRate: number
): void {
  const percent = Math.min(100, Math.round((current / total) * 100));
  const barWidth = 24;
  const filled = Math.round((current / total) * barWidth);
  const bar = '■'.repeat(filled) + '░'.repeat(Math.max(0, barWidth - filled));
  const timeStr = formatTimestamp(timestampSec);
  const shotStr = shotId ? `[${shotId}]` : '';

  process.stdout.write(
    `\r  [${bar}] ${percent}% | Frame ${current}/${total} (${timeStr}) ${shotStr} | ${fpsRate.toFixed(1)} fps `
  );
}

export async function runRecordSession(
  options: CliOptions,
  scoreYaml: string,
  serverUrl: string
): Promise<void> {
  const browser = await chromium.launch({
    headless: !options.preview,
    args: [
      '--enable-webgl',
      '--use-gl=angle',
      '--enable-gpu-rasterization',
      '--no-sandbox',
    ],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });

    page.on('pageerror', (err) => {
      console.error('\n⚠️ Browser Page Error:', err.message);
    });
    page.on('crash', () => {
      console.error('\n❌ Browser Page Crashed!');
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        console.warn('\n⚠️ Main frame navigated to:', frame.url());
      }
    });
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[vite]') || msg.type() === 'error') {
        console.log(`[Browser ${msg.type()}]:`, text);
      }
    });

    const targetUrl = `${serverUrl}/?mode=headless-render`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Wait until recorder bridge is mounted and ready
    await page.waitForFunction(
      () => Boolean(window.__STAGEFLOW_RECORDER__?.ready),
      { timeout: 15000 }
    );

    const recorderConfig: RecorderConfig = {
      scoreYaml,
      cameraMode: options.cameraMode,
      labelMode: options.labels,
      showGuides: options.guides,
      showHud: options.hud,
      dofBlur: options.dofBlur,
      theme: options.theme,
      fps: options.fps,
      width: options.width,
      height: options.height,
      startSec: options.startSec ?? 0,
      endSec: options.endSec ?? 0,
      customPose: options.customPose,
    };

    const sessionInfo = await page.evaluate(
      (cfg) => window.__STAGEFLOW_RECORDER__!.init(cfg),
      recorderConfig
    );

    const totalFrames = sessionInfo.totalFrames;
    const pipeline = createFfmpegPipeline({
      outputPath: options.outputPath,
      fps: options.fps,
      width: options.width,
      height: options.height,
      format: options.format,
      audioPath: options.audioPath,
      startSec: options.startSec ?? 0,
      durationSec: sessionInfo.durationSec,
    });

    const blurDisplay =
      options.dofBlur !== undefined
        ? options.dofBlur
          ? 'ON (forced)'
          : 'OFF (forced)'
        : 'AUTO (from score)';
    const themeDisplay = (options.theme ?? 'dark').toUpperCase();

    console.log('\n🎬 StageFlow Deterministic Viewport Recorder');
    console.log('━'.repeat(52));
    console.log(`  Camera Mode:   ${options.cameraMode.toUpperCase()}`);
    console.log(
      `  Labels:        ${options.labels.toUpperCase()} | HUD: ${options.hud ? 'ON' : 'OFF'} | Guides: ${options.guides ? 'ON' : 'OFF'}`
    );
    console.log(`  Optics Blur:   ${blurDisplay} | Theme: ${themeDisplay}`);
    console.log(
      `  Audio Track:   ${options.audioPath ? options.audioPath : 'NONE (silent)'}`
    );
    console.log(`  Framerate:     ${options.fps} fps (locked)`);
    console.log(`  Resolution:    ${options.width}x${options.height}`);
    console.log(`  Total Frames:  ${totalFrames} (${sessionInfo.durationSec.toFixed(2)}s)`);
    console.log(`  Output Path:   ${options.outputPath}`);
    console.log('━'.repeat(52));

    const renderStartTime = Date.now();
    let lastReportTime = Date.now();
    let lastReportFrame = 0;
    let currentFpsRate = 0;

    for (let i = 0; i < totalFrames; i++) {
      let frameResult: RecorderFrameResult | undefined;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          frameResult = await page.evaluate(
            (frameIdx) => {
              const rec = window.__STAGEFLOW_RECORDER__;
              if (!rec?.stepFrame) {
                throw new Error('__STAGEFLOW_RECORDER__.stepFrame is not ready');
              }
              return rec.stepFrame(frameIdx);
            },
            i
          );
          break;
        } catch (err) {
          if (attempt === 9) throw err;
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      if (!frameResult) {
        throw new Error(`Failed to evaluate frame ${i}`);
      }

      const buffer = await page.screenshot({
        type: 'png',
        omitBackground: false,
      });

      await pipeline.writeFrame(buffer);

      const now = Date.now();
      if (now - lastReportTime >= 250 || i === totalFrames - 1) {
        const framesDelta = i - lastReportFrame;
        const timeDeltaSec = (now - lastReportTime) / 1000;
        if (timeDeltaSec > 0) {
          currentFpsRate = framesDelta / timeDeltaSec;
        }
        renderProgressBar(
          i + 1,
          totalFrames,
          frameResult.shotId,
          frameResult.timestampSec,
          currentFpsRate
        );
        lastReportTime = now;
        lastReportFrame = i;
      }
    }

    await pipeline.close();
    const elapsedSec = ((Date.now() - renderStartTime) / 1000).toFixed(1);

    console.log(`\n\n✨ Recording completed successfully in ${elapsedSec}s!`);
    console.log(`📁 File saved to: ${options.outputPath}\n`);
  } finally {
    await browser.close();
  }
}
