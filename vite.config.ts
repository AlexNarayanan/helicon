import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const allowedHosts = env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [];

	return {
		plugins: [sveltekit()],
		server: {
			port: 7000,
			allowedHosts
		},
		test: {
			include: ['tests/**/*.{test,spec}.{js,ts}'],
			exclude: ['tests/e2e/**', 'tests/visual/**', 'tests/slice1/**', 'tests/slice2/**', 'tests/slice3/**'],
			globals: true,
			environment: 'node'
		}
	};
});
