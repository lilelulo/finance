// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Application 100 % côté navigateur : les données vivent dans le localStorage,
  // et (optionnellement) sont synchronisées chiffrées via sync-server/.
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  // `npm run dev` accessible depuis les autres appareils du réseau.
  // Pour la synchronisation, le navigateur exige HTTPS hors localhost : `npm run dev -- --https`.
  devServer: { host: '0.0.0.0', port: 3000 },
  vite: {
    server: {
      allowedHosts: ['finance.tipeee.fr'],
      hmr: { protocol: 'wss', host: 'finance.tipeee.fr', clientPort: 443 },
    },
  },
  runtimeConfig: {
    public: {
      // Adresse du serveur de synchronisation. Vide = même origine que l'application
      // (cas normal : sync-server sert aussi l'application). Ex. NUXT_PUBLIC_SYNC_URL=https://sync.exemple.fr
      syncUrl: '',
    },
  },

  // En développement, /api est redirigé vers le serveur de synchronisation (npm run server).
  nitro: {
    devProxy: {
      '/api': { target: 'http://127.0.0.1:3001/api', changeOrigin: true },
    },
  },

  app: {
    head: {
      title: 'Mon Budget',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0E5A4C' },
        { name: 'referrer', content: 'no-referrer' },
        { name: 'description', content: 'Comptes bancaires, budget prévisionnel mensuel, opérations récurrentes et synthèse prévu / réel.' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap' },
      ],
    },
  },
  typescript: { strict: true },
})
