export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
  ],

  runtimeConfig: {
    databaseUrl: '',
    public: {
      apiBase: '/api',
    },
  },

  typescript: {
    strict: true,
  },

  compatibilityDate: '2024-01-15',
});
