/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/exercises\/.+\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 1000 },
            },
          },
          {
            urlPattern: /\/illustrations\/.+\.svg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-illustrations',
              expiration: { maxEntries: 1000 },
            },
          },
        ],
      },
      manifest: {
        name: '명품보쌈',
        short_name: '명품보쌈',
        description: '점진적 과부하를 위한 운동 기록',
        lang: 'ko',
        theme_color: '#0E1013',
        background_color: '#0E1013',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // .tmp-workout-guide는 운동 일러스트 파이프라인용 임시 클론(커밋 안 됨) — 그 안의 테스트를 주워가지 않도록 제외
    exclude: [...configDefaults.exclude, '.tmp-workout-guide/**'],
  },
});
