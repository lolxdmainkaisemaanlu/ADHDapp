import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/**/*.{ts,tsx}'],
  theme: {
    extend: {}
  },
  plugins: []
};

export default config;
