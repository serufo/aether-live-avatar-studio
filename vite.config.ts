import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Gera dist/pacific-r/index.html (ajustando caminhos relativos ./ -> ../)
 * e dist/404.html para que o acesso direto em GitHub Pages
 * (https://serufo.github.io/aether-live-avatar-studio/pacific-r)
 * responda com HTTP 200 e carregue todos os assets corretamente.
 */
function pacificRStaticRoutesPlugin(): Plugin {
  return {
    name: 'pacific-r-static-routes',
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist');
      const rootIndex = path.join(distDir, 'index.html');
      if (!fs.existsSync(rootIndex)) return;

      const html = fs.readFileSync(rootIndex, 'utf-8');

      // Subpasta /pacific-r/index.html: ajusta ./assets/ -> ../assets/ e ./favicon -> ../favicon
      const subDirHtml = html.replace(/(href|src)="\.\//g, '$1="../');
      const pacificDir = path.join(distDir, 'pacific-r');
      fs.mkdirSync(pacificDir, { recursive: true });
      fs.writeFileSync(path.join(pacificDir, 'index.html'), subDirHtml, 'utf-8');

      // Fallback SPA 404.html na raiz do dist
      fs.writeFileSync(path.join(distDir, '404.html'), html, 'utf-8');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pacificRStaticRoutesPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    cors: true,
  },
});
