// frontend/postcss.config.mjs
const config = {
  plugins: {
    "@tailwindcss/postcss": {
      base: process.cwd(), // explicitly pin to frontend/
    },
  },
};
export default config;