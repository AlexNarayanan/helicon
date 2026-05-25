import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm dev',
		url: 'http://localhost:7000/helicon',
		reuseExistingServer: !process.env.CI
	},
	testDir: 'tests/e2e',
	testMatch: '**/*.spec.ts',
	timeout: 30_000,
	use: {
		baseURL: 'http://localhost:7000/helicon'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'visual',
			testDir: 'tests/visual',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	reporter: process.env.CI ? 'github' : 'list'
});
