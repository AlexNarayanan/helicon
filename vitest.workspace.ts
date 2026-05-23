import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
	{
		extends: './vite.config.ts',
		test: {
			name: 'unit',
			include: ['tests/**/*.{test,spec}.{js,ts}'],
			exclude: ['tests/e2e/**', 'tests/visual/**', 'tests/slice1/**', 'tests/slice2/**', 'tests/slice3/**'],
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
	},
	{
		test: {
			name: 'api',
			include: [
				'tests/slice2/**/*.{test,spec}.{js,ts}',
				'tests/slice3/**/*.{test,spec}.{js,ts}'
			],
			globals: true,
			environment: 'node',
			testTimeout: 120_000
		}
	}
]);
