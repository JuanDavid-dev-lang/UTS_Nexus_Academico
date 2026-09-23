// `vitest/config` re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

/**
 * Sello de versión de la web.
 *
 * `version.json` se sirve junto a la aplicación y dice qué versión está
 * publicada. Existe por dos razones: la publicación (`release.yml`) comprueba
 * con él que Vercel ya desplegó la etiqueta antes de dar la versión por
 * publicada —sin eso, «publicado» solo describiría a los instaladores—, y
 * desde fuera es la única forma de saber qué hay servido, porque una SPA no
 * lleva su versión en ningún sitio observable.
 */
function selloDeVersion(): PluginOption {
  return {
    name: 'uts-sello-de-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, compilado: new Date().toISOString() }, null, 2),
      });
    },
  };
}

/**
 * La web como aplicación instalada.
 *
 * En un iPhone no hay forma gratuita de instalar la app nativa desde una
 * página: Apple solo deja instalar lo que pasa por su tienda o por TestFlight,
 * y las dos exigen la cuenta de pago. Lo que sí deja es «Añadir a pantalla de
 * inicio» una web, que queda con su icono, a pantalla completa y sin la barra
 * de Safari. Para eso hacen falta el manifiesto, un icono opaco de 180 px
 * (`apple-touch-icon`: Safari no lee los iconos del manifiesto) y las
 * etiquetas `apple-mobile-web-app-*`; sin ellas el icono es una captura de la
 * página y se abre dentro de Safari. Android y Chrome usan el mismo manifiesto.
 *
 * Solo en el modo `web`: el `index.html` es el mismo que empaqueta Tauri, y a
 * la aplicación de escritorio nada de esto le sirve.
 */
const MANIFIESTO = {
  name: 'UTS Nexus Académico',
  short_name: 'UTS Nexus',
  description: 'Materias, estudiantes, notas, asistencia y riesgo académico.',
  lang: 'es',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  // Los valores de `--primary` y `--bg` de `tokens.css`. Van escritos porque el
  // manifiesto se lee antes de cargar ninguna hoja de estilos.
  theme_color: '#0b5d3b',
  background_color: '#f4f6f8',
  icons: [
    { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const ICONOS_WEB = ['apple-touch-icon.png', 'icono-192.png', 'icono-512.png', 'icono-maskable-512.png'];

function appInstalable(): PluginOption {
  return {
    name: 'uts-app-instalable',
    apply: 'build',
    transformIndexHtml() {
      const meta = (name: string, content: string) => ({
        tag: 'meta',
        attrs: { name, content },
        injectTo: 'head' as const,
      });
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, injectTo: 'head' },
        meta('theme-color', MANIFIESTO.theme_color),
        meta('apple-mobile-web-app-capable', 'yes'),
        meta('mobile-web-app-capable', 'yes'),
        meta('apple-mobile-web-app-title', MANIFIESTO.short_name),
        // `default` y no `black-translucent`: con el translúcido la página se
        // dibuja debajo de la barra de estado y la cabecera queda tapada por
        // la hora y la batería.
        meta('apple-mobile-web-app-status-bar-style', 'default'),
      ];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(MANIFIESTO, null, 2),
      });
      for (const icono of ICONOS_WEB) {
        this.emitFile({
          type: 'asset',
          fileName: icono,
          source: readFileSync(path.resolve(__dirname, 'pwa', icono)),
        });
      }
    },
  };
}

/**
 * Vite configuration.
 *
 * Tauri runs the dev server on a fixed port and needs a strict port so the
 * native shell can attach to it reliably.
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'web' ? [selloDeVersion(), appInstalable()] : []),
  ],
  /*
   * La versión que la aplicación enseña sale de `package.json`, que es el
   * archivo que sube `subir-version.mjs`. Antes no la ponía nadie y el valor
   * por defecto de `env.ts` —un `2.0.0` escrito hace tiempo— era lo que veía
   * quien abría la web. En el escritorio no se notaba porque el actualizador
   * pregunta a Tauri, que lee la suya del binario.
   */
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  /*
   * La versión web (`npm run build:web`, modo `web`) se publica en Vercel bajo
   * su propio dominio, así que va en la raíz igual que la de escritorio. Lo
   * único que cambia es la carpeta de salida, para no pisar la que empaqueta
   * Tauri.
   */
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    watch: {
      // The Rust side is rebuilt by cargo, not by Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: mode === 'web' ? 'dist-web' : 'dist',
    // Tauri targets modern WebViews only, so we can ship smaller output. La
    // web se abre en navegadores de escritorio actuales: el mismo destino vale.
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing libraries so the app shell stays small
        // and a dependency bump does not invalidate the whole cache.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['echarts'],
          query: ['@tanstack/react-query', '@tanstack/react-virtual'],
          motion: ['framer-motion'],
          realtime: ['socket.io-client'],
          validation: ['zod'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
}));
