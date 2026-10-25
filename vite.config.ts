import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' – deluje na GitHub Pages pod katerimkoli imenom repozitorija
export default defineConfig({
  base: './',
  plugins: [react()],
})
