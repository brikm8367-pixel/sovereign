/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        panel: '#0f172a',
        accent: '#7c3aed'
      }
    }
  },
  plugins: []
};
