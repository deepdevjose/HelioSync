/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        dark: {
          900: '#0B0D14',
          800: '#131620',
          700: '#1A1E2C',
        },
        helium: {
          500: '#38BDF8', // Cyan base for "Apple AI" feel
          400: '#7DD3FC',
        }
      },
      backgroundImage: {
        'mesh-gradient': 'radial-gradient(at 0% 0%, hsla(243,100%,76%,1) 0px, transparent 50%), radial-gradient(at 50% 0%, hsla(225,100%,56%,1) 0px, transparent 50%), radial-gradient(at 100% 0%, hsla(339,100%,55%,1) 0px, transparent 50%)',
        'subtle-grid': 'linear-gradient(to right, #ffffff05 1px, transparent 1px), linear-gradient(to bottom, #ffffff05 1px, transparent 1px)'
      }
    },
  },
  plugins: [],
}