import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every asset path relative, so the app works on GitHub Pages
// under any repository name (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
});
