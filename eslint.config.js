import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    // XHR/fetch monkey-patching legitimately captures `this` and forwards `arguments`;
    // there is no rest-params equivalent when patching prototype methods in place.
    files: ['src/lib/collectors/network.ts'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
      'prefer-rest-params': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
