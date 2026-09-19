/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      colors: {
        command: {
          canvas: '#070b12',
          bg: '#0b0f19',
          surface: '#101726',
          panel: '#151d30',
          card: '#1a243b',
          elevated: '#1f2b45',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-strong': '#28354f',
          accent: '#2563eb',
          'accent-hover': '#1d4ed8',
          'accent-light': '#3b82f6',
          telemetry: '#38bdf8',
          success: '#10b981',
          'success-bg': 'rgba(16, 185, 129, 0.1)',
          warning: '#f59e0b',
          'warning-bg': 'rgba(245, 158, 11, 0.1)',
          danger: '#f43f5e',
          'danger-bg': 'rgba(244, 63, 94, 0.1)',
          muted: '#64748b',
          'muted-light': '#94a3b8',
        },
      },
      boxShadow: {
        'glow-sm': '0 0 15px -3px rgba(37, 99, 235, 0.15)',
        'glow-md': '0 0 25px -5px rgba(37, 99, 235, 0.25)',
        'glow-emerald': '0 0 15px -3px rgba(16, 185, 129, 0.2)',
        'glow-amber': '0 0 15px -3px rgba(245, 158, 11, 0.2)',
        'glow-rose': '0 0 15px -3px rgba(244, 63, 94, 0.2)',
      },
      keyframes: {
        radar: {
          '0%': { transform: 'scale(0.95)', opacity: '0.8' },
          '50%': { transform: 'scale(1.4)', opacity: '0' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
      },
      animation: {
        radar: 'radar 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
