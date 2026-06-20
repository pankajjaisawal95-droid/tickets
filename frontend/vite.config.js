// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Absolute base so hashed assets resolve from the site root on deep links
  // (e.g. /event/15). A relative './' base breaks nested routes because the
  // browser resolves asset URLs against the current path, not the root.
  base: '/',
  plugins: [react()],
  // Uploaded images are stored as relative paths ("/assets/images/..."). In
  // production the site and the assets share a domain so they resolve directly;
  // in local dev the backend serves them on :5320, so proxy /assets there.
  server: {
    proxy: {
      '/assets': 'http://localhost:5320',
    },
  },
})