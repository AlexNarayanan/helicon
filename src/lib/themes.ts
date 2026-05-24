export const THEMES = ['mythos', 'vinyl', 'neon', 'paper'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
	mythos: 'Mythos',
	vinyl: 'Vinyl',
	neon: 'Neon',
	paper: 'Paper'
};

export const THEME_COLORS: Record<Theme, string> = {
	mythos: '#7c5cbf',
	vinyl: '#e63946',
	neon: '#00f5d4',
	paper: '#2b4162'
};

const STORAGE_KEY = 'helicon-theme';
const DEFAULT_THEME: Theme = 'mythos';

export function loadTheme(): Theme {
	if (typeof localStorage === 'undefined') return DEFAULT_THEME;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && THEMES.includes(stored as Theme)) return stored as Theme;
	return DEFAULT_THEME;
}

export function saveTheme(theme: Theme): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, theme);
	}
}

export function applyTheme(theme: Theme): void {
	document.documentElement.setAttribute('data-theme', theme);
}
