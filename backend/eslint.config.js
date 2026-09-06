import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Los `.mjs` de la raíz son utilidades de línea de comandos para la
    // persona que instala, no parte de la aplicación: corren en Node a secas,
    // sin el `tsconfig` ni los globales que la configuración de abajo asume.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'check-env.mjs',
      'configurar-uniplanner.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Express error middlewares declare four parameters and ignore `next`;
      // an underscore prefix is the project's opt-out marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Route handlers are typed by Express, not by explicit return annotations.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Augmenting Express's Request type requires `declare global { namespace Express }`.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      // A quality signal on untyped Mongoose lean() results, not a defect: it
      // must stay visible without blocking the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // Seed and smoke scripts log progress to stdout on purpose.
    files: ['src/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  }
);
