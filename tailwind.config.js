/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Executive Green Palette
        executive: {
          dark: '#164B3A',      // Vert profond
          emerald: '#27815E',   // Vert émeraude (actions/actifs)
          soft: '#B5C9B8',      // Vert doux (accents)
          light: '#F3F7F4',     // Gris très clair (fond)
          surface: '#FFFFFF',   // Blanc (panneaux/cartes)
          // Mode sombre
          darkBg: '#0E1A15',    // Fond graphite sombre
          darkSurface: '#14261F', // Surface sombre
          darkBorder: '#22382E',  // Bordure sombre
          darkText: '#EAF2EC',    // Texte principal sombre
          darkMuted: '#9BB4A6',   // Texte estompé sombre
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
