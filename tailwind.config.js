/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A1628",
        electric: "#2D7EF8",
        critical: "#FF4757",
        warning: "#FFA502",
        safe: "#2ED573"
      },
      fontFamily: {
        display: ["SF Pro Display", "Google Sans", "System"]
      }
    }
  },
  plugins: []
};
