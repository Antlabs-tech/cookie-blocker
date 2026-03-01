import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import manifest from './manifest.js'

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'build',
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
      },
    },
  },
  plugins: [
    tailwindcss(),
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        { src: 'src/img/*', dest: 'img' },
        { src: 'src/assets/*', dest: 'assets' },
        { src: 'src/data/js/*', dest: 'data/js' },
        { src: 'src/data/css/*', dest: 'data/css' },
        { src: 'src/_locales/*', dest: '_locales' },
      ],
    }),
  ],
})
