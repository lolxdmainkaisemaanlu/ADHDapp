module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: ['dist', 'build', 'node_modules'],
  overrides: [
    {
      files: ['client/**/*.{ts,tsx}'],
      env: {
        browser: true,
        node: false
      }
    }
  ]
};
