import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				primary: 'var(--color-primary)',
				secondary: 'var(--color-secondary)',
				accent: 'var(--color-accent)',
				surface: 'var(--color-surface)',
				'surface-alt': 'var(--color-surface-alt)',
				text: 'var(--color-text)',
				'text-muted': 'var(--color-text-muted)',
				border: 'var(--color-border)'
			},
			fontFamily: {
				sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
				mono: ['var(--font-mono)', 'monospace']
			}
		}
	},
	plugins: []
} satisfies Config;
