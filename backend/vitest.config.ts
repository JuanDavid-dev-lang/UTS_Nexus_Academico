import { defineConfig } from 'vitest/config';

/**
 * Configuración de pruebas del backend.
 *
 * El proyecto es ESM con `moduleResolution: NodeNext`, así que el código fuente
 * importa con extensión `.js` aunque el archivo en disco sea `.ts`. Vite no
 * traduce ese sufijo por su cuenta, de modo que sin esta regla un módulo del
 * dominio que importa a otro —risk importa a grading— no resuelve y la suite
 * falla al cargar, no al comprobar.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1.ts' }],
  },
});
