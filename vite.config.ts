/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
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
  // « standalone » : démo à ouvrir par double-clic ; « artifact » : version hébergée sur claude.ai
  const standalone = mode === 'standalone' || mode === 'artifact'

  // Garde-fou production : un build « supabase » sans URL ni clé échoue au lieu
  // de livrer silencieusement la démonstration.
  const vars = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  if (vars.VITE_DATA_MODE?.trim() === 'supabase') {
    const url = vars.VITE_SUPABASE_URL?.trim() ?? ''
    const key = vars.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
    if (!url.startsWith('https://') || url.includes('votre-projet') || key.length < 20 || key.includes('votre-cle')) {
      throw new Error('VITE_DATA_MODE=supabase mais VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY est absente ou invalide. Renseignez-les dans les variables d’environnement de l’hébergeur puis relancez le déploiement.')
    }
  }

  return {
    plugins: [react(), tailwindcss(), ...(standalone ? [viteSingleFile(), inlineFavicon()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: standalone
      ? { outDir: mode === 'artifact' ? 'dist-artifact' : 'dist-standalone', assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 10_000, copyPublicDir: false }
      : { chunkSizeWarningLimit: 1600 },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
