import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
	{
		extends: './vite.config.ts',
		test: {
			name: 'unit',
			include: ['tests/**/*.{test,spec}.{js,ts}'],
			exclude: ['tests/e2e/**', 'tests/visual/**', 'tests/slice1/**'],
			globals: true,
			environment: 'node'
		}
	},
	{
		test: {
			name: 'db',
			include: ['tests/slice1/**/*.{test,spec}.{js,ts}'],
			exclude: ['tests/e2e/**', 'tests/visual/**'],
			globals: true,
			environment: 'node',
			testTimeout: 120_000
		}
	}
]);
