module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true
  },
  extends: ['../.eslintrc.cjs'],
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  }
};
