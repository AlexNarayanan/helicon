import { defineWorkspace } from 'vitest/config';
import { existsSync } from 'fs';

function containerEnv(): Record<string, string> {
	if (process.env.DOCKER_HOST) return { TESTCONTAINERS_RYUK_DISABLED: 'true' };
	const uid = process.getuid?.() ?? 1000;
	const xdgRuntime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`;
	const podmanSock = `${xdgRuntime}/podman/podman.sock`;
	return {
		TESTCONTAINERS_RYUK_DISABLED: 'true',
		...(existsSync(podmanSock) ? { DOCKER_HOST: `unix://${podmanSock}` } : {})
	};
}

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
			testTimeout: 120_000,
			env: containerEnv()
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
			testTimeout: 120_000,
			env: containerEnv()
		}
	}
]);
