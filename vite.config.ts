import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_DEMO=1 pokreće probnu verziju sa podacima u memoriji (samo za razvoj).
const demo = process.env.VITE_DEMO === '1'

export default defineConfig({
  define: { __DEMO__: JSON.stringify(demo) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Troškovi vozila',
        short_name: 'Vozila',
        description: 'Praćenje stvarnog troška vozila: gorivo, putarine, servis i ostalo.',
        lang: 'sr-Latn',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#efefea',
        theme_color: '#efefea',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Kešira se samo sama aplikacija (da se brzo otvori). Podaci iz baze se NIKAD ne keširaju.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
})
