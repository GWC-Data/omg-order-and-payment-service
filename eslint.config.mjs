import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { files: ['.src/', '**/*.{js,mjs,cjs,ts}'] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  { ignores: ['**/*.test.ts', '**/*.d.ts', 'dist/**'] },
  ...tseslint.configs.recommended
];
