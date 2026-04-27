/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      blur: {
        '32': '32px',
        '40': '40px',
        '60': '60px',
        '80': '80px',
      },
    },
  },
  plugins: [],
}

