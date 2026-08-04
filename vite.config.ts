import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: caminho no GitHub Pages (https://<user>.github.io/DigitalGears/).
// Trocar para '/' se for hospedar na raiz de um domínio.
const BASE = '/DigitalGears/'

export default defineConfig({
  base: BASE,

  // Por padrão o Vite escuta só em `localhost`, o que no Windows vira apenas
  // `::1` (loopback IPv6) — nenhum outro aparelho da rede alcança. `host: true`
  // abre em todas as interfaces, IPv4 inclusive, para abrir no tablet pelo wi-fi.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },

  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'DigitalGears — Oficina de Engrenagens',
        short_name: 'DigitalGears',
        description: 'Monte máquinas de engrenagens em 3D e veja elas funcionarem.',
        lang: 'pt-BR',
        theme_color: '#7fc8f5',
        background_color: '#eaf4fb',
        display: 'standalone',
        orientation: 'landscape',
        scope: BASE,
        start_url: BASE,
        // Só SVG por enquanto: é o que existe de verdade em public/.
        // Antes de publicar numa loja, gerar também PNG 192 e 512 (maskable),
        // que algumas plataformas exigem.
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
