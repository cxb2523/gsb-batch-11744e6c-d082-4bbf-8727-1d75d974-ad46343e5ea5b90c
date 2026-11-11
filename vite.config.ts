import { defineConfig } from 'vite';

// Ship the bundled dependencies' licenses (three.js, three-mesh-bvh) next to the game as /licenses.md.
export default defineConfig({ build: { license: { fileName: 'licenses.md' } } });
