/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Démo autonome : intègre aussi l'icône d'onglet dans le fichier HTML. */
function inlineFavicon(): Plugin {
  return {
    name: 'novia-inline-favicon',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
      const icon = Object.values(bundle).find((f) => f.type === 'asset' && /favicon.*\.png$/.test(f.fileName))
      if (!html || !icon || html.type !== 'asset' || icon.type !== 'asset') return
      const data = `data:image/png;base64,${Buffer.from(icon.source as Uint8Array).toString('base64')}`
      html.source = String(html.source).replace(new RegExp(`(\\./)?${icon.fileName.replace('.', '\\.')}`), data)
      delete bundle[icon.fileName]
    },
  }
}

// Deux modes de build :
//  - `vite build`                     → application déployable (Vercel, Netlify, serveur statique)
//  - `vite build --mode standalone`   → démo autonome en un seul fichier HTML (ouvrable par double-clic)
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone'

  return {
    plugins: [react(), tailwindcss(), ...(standalone ? [viteSingleFile(), inlineFavicon()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: standalone
      ? { outDir: 'dist-standalone', assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 10_000, copyPublicDir: false }
      : { chunkSizeWarningLimit: 1600 },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
