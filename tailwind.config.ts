import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { accent: '#FAC51C', green: '#46C26A', blue: '#4FB6E8', red: '#E5484D', orange: '#FF7F24' },
    fontFamily: { sans: ['Outfit', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
  } },
  plugins: [],
}
export default config
