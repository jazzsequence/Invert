import typescriptEslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default typescriptEslint.config(
  ...typescriptEslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  {
    // as any is acceptable in test mocks where vi.mocked return types don't
    // match the real signatures (e.g. readdir returns Dirent[] but we mock
    // with string[]) — tightening this adds noise with no safety benefit.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['dist/', '.astro/', 'node_modules/', 'cloudflare/', '.claude/'],
  }
);
