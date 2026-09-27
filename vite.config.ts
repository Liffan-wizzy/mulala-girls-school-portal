import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/school-crest.svg'],
            manifest: {
                name: 'Mulala Girls High School Portal',
                short_name: 'Mulala Girls',
                description: 'School portal for admissions, academic reports and fee balances.',
                start_url: '/',
                scope: '/',
                display_override: ['fullscreen', 'standalone'],
                display: 'standalone',
                background_color: '#f6f8f6',
                theme_color: '#163c35',
                categories: ['education', 'productivity'],
                icons: [
                    { src: '/icons/school-crest.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
                    { src: '/icons/school-crest.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,woff2}'],
                navigateFallback: '/index.html',
                runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }],
            },
        }),
    ],
    server: { host: '0.0.0.0' },
});
