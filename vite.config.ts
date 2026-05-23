import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 7000
	},
	test: {
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		exclude: ['tests/e2e/**', 'tests/visual/**'],
		globals: true,
		environment: 'node'
	}
});
