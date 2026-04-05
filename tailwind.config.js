/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#04060c',
        panel: 'rgba(11, 16, 32, 0.62)',
        edge: 'rgba(255, 255, 255, 0.12)',
        cyan: '#60a5fa',
        violet: '#9f7aea',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Orbitron', 'Space Grotesk', 'Manrope', 'system-ui', 'sans-serif'],
        tech: ['Space Grotesk', 'Manrope', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 24px 80px rgba(37, 99, 235, 0.18)',
        panel:
          '0 20px 80px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      },
      backgroundImage: {
        nebula:
          'radial-gradient(circle at 20% 20%, rgba(96, 165, 250, 0.2), transparent 30%), radial-gradient(circle at 80% 20%, rgba(159, 122, 234, 0.16), transparent 28%), radial-gradient(circle at 50% 80%, rgba(37, 99, 235, 0.14), transparent 34%)',
      },
      animation: {
        float: 'float 8s ease-in-out infinite',
        pulseSoft: 'pulseSoft 2.6s ease-in-out infinite',
        drift: 'drift 16s linear infinite',
        sweep: 'sweep 4.6s ease-in-out infinite',
        flicker: 'flicker 2.8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' },
        },
        drift: {
          from: { transform: 'translate3d(-6%, -4%, 0)' },
          to: { transform: 'translate3d(6%, 4%, 0)' },
        },
        sweep: {
          '0%, 100%': { transform: 'translateX(-12%)', opacity: '0' },
          '42%': { opacity: '0.18' },
          '50%': { transform: 'translateX(12%)', opacity: '0.32' },
          '58%': { opacity: '0.12' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '48%': { opacity: '0.92' },
          '50%': { opacity: '0.8' },
          '54%': { opacity: '0.96' },
        },
      },
    },
  },
  plugins: [],
}
