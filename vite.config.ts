import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: [
        '**/.agents/**',
        '**/recordings/**',
        '**\\recordings\\**',
        /[/\\]recordings[/\\]/,
        '**/_examples/**',
      ],
    },
  },
  optimizeDeps: {
    include: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/lang-yaml',
      'lucide-react',
    ],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-katex': [
            'katex',
            'rehype-katex',
            'remark-math',
            'react-markdown',
            'remark-gfm',
          ],
          'vendor-codemirror': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/lang-yaml',
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
