import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1a1614', soft: '#3d3733', mute: '#6b625c' },
        rice: { DEFAULT: '#f7f3ec', deep: '#efe8dc', line: '#ddd2c0' },
        cinnabar: { DEFAULT: '#a8352a', soft: '#c4544a' },
        jade: '#2f6b52',
        gold: '#b08b3f',
        risk: {
          safe: '#2E7D32',
          watch: '#9E9D24',
          warn: '#EF6C00',
          high: '#D84315',
          crit: '#B71C1C',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        serif: ['"Songti SC"', '"SimSun"', '"Noto Serif SC"', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
