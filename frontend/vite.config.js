import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Only these paths get walked and turned into real static HTML at build
// time. Everything else (dashboards, payment/wallet callbacks) is behind
// auth, has no SEO value, and would just render a "Loading session…" or
// redirect state anyway since there's no logged-in user during the build.
//
// Note: vite-react-ssg reports child route paths WITHOUT a leading slash
// (e.g. 'about', not '/about') — only the root path is '/'. This list
// matches that exact format.
const PRERENDER_PATHS = [
  '/',
  'about',
  'contact',
  'track',
  'signup',
  'signup/customer',
  'signup/agent',
  'login',
  'privacy',
  'terms',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  ssgOptions: {
    includedRoutes(paths) {
      return paths.filter((p) => PRERENDER_PATHS.includes(p))
    },
  },
})
