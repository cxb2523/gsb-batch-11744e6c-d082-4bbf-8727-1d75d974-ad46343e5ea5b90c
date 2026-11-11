/**
 * Vite Dev Server lifecycle manager for headless Playwright testing and recording.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

export interface ServerInstance {
  url: string;
  close: () => Promise<void>;
}

function checkServerAvailable(url: string, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function ensureViteServer(port = 5173): Promise<ServerInstance> {
  const url = `http://localhost:${port}`;
  const isRunning = await checkServerAvailable(url);

  if (isRunning) {
    return {
      url,
      close: async () => {},
    };
  }

  // Spawn ephemeral background Vite dev server directly via node
  const viteBin = 'node_modules/vite/bin/vite.js';
  const child: ChildProcess = spawn(
    process.execPath,
    [viteBin, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  child.stdout?.on('data', (d) => {
    const str = d.toString();
    if (str.includes('page reload') || str.includes('hmr') || str.includes('error')) {
      console.log('[Vite Server]:', str.trim());
    }
  });
  child.stderr?.on('data', (d) => {
    console.error('[Vite Error]:', d.toString().trim());
  });

  // Poll server readiness for up to 15 seconds
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    await new Promise((r) => setTimeout(r, 400));
    if (await checkServerAvailable(url)) {
      return {
        url,
        close: async () => {
          child.kill();
        },
      };
    }
  }

  child.kill();
  throw new Error(`Timed out waiting for Vite server to start on ${url}`);
}
