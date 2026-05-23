import { describe, it, expect } from 'vitest';
import { THEMES, THEME_LABELS } from '../src/lib/themes';

describe('themes', () => {
	it('exports four themes', () => {
		expect(THEMES).toHaveLength(4);
	});

	it('every theme has a label', () => {
		for (const theme of THEMES) {
			expect(THEME_LABELS[theme]).toBeTruthy();
		}
	});
});
