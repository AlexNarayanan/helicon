<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { applyTheme, loadTheme, saveTheme, THEMES, THEME_LABELS, THEME_COLORS, type Theme } from '$lib/themes';
	import HeliconIcon from '$lib/components/HeliconIcon.svelte';

	let { children } = $props();

	let currentTheme: Theme = $state('mythos');
	let headerEl: HTMLElement | undefined = $state(undefined);
	let headerH = $state(0);

	onMount(() => {
		currentTheme = loadTheme();
		applyTheme(currentTheme);
		vh = window.innerHeight;
		const ro = new ResizeObserver(() => { headerH = headerEl?.offsetHeight ?? 0; });
		if (headerEl) { headerH = headerEl.offsetHeight; ro.observe(headerEl); }
		return () => ro.disconnect();
	});

	function setTheme(theme: Theme) {
		currentTheme = theme;
		applyTheme(theme);
		saveTheme(theme);
	}

	// ── Background waveform ──────────────────────────────────
	const TILE_W    = 1200;
	const NUM_TILES = 4;
	const WAVE_START = 540;
	const WAVE_END   = 640;

	const DESIGNS: [number, number][][] = [
		// 0: symmetric burst
		[
			[0.00,  0.00],
			[0.07,  0.55], [0.11,  0.00], [0.15, -0.72], [0.19,  0.00],
			[0.23,  0.50], [0.27,  0.00], [0.31,  0.00],
			[0.36, -0.82], [0.40,  0.00], [0.44,  0.95], [0.48,  0.00],
			[0.50, -1.00],
			[0.52,  0.00], [0.56,  0.95], [0.60,  0.00], [0.64, -0.82], [0.68,  0.00],
			[0.72,  0.00],
			[0.77,  0.50], [0.81,  0.00], [0.85, -0.72], [0.89,  0.00],
			[0.93,  0.55], [1.00,  0.00],
		],
		// 1: build-spike-decay
		[
			[0.00,  0.00],
			[0.05,  0.40], [0.09,  0.00], [0.13, -0.52], [0.17,  0.00],
			[0.21,  0.35], [0.25,  0.00],
			[0.30,  0.90], [0.34,  0.00],
			[0.40, -1.00], [0.44,  0.00],
			[0.50,  0.78], [0.54,  0.00],
			[0.60,  0.00],
			[0.65, -0.62], [0.69,  0.00], [0.73,  0.44], [0.77,  0.00],
			[0.81, -0.32], [0.85,  0.00],
			[0.90,  0.22], [0.95,  0.00],
			[1.00,  0.00],
		],
		// 2: W-shape — twin peaks flanking a deep trough
		[
			[0.00,  0.00],
			[0.04,  0.42], [0.08,  0.00], [0.12, -0.58], [0.16,  0.00],
			[0.22,  0.72], [0.26,  0.00], [0.30,  0.88], [0.34,  0.00],
			[0.38, -0.52], [0.42,  0.00],
			[0.50, -1.00],
			[0.58,  0.00], [0.62, -0.52], [0.66,  0.00],
			[0.70,  0.88], [0.74,  0.00], [0.78,  0.72], [0.82,  0.00],
			[0.86, -0.58], [0.90,  0.00], [0.94,  0.42], [0.98,  0.00],
			[1.00,  0.00],
		],
		// 3: rapid stutter
		[
			[0.00,  0.00],
			[0.04,  0.50], [0.08,  0.00], [0.12,  0.68], [0.16,  0.00],
			[0.20, -0.74], [0.24,  0.00], [0.28, -0.55], [0.32,  0.00],
			[0.36,  0.85], [0.40,  0.00],
			[0.44, -0.95], [0.48,  0.00],
			[0.52,  0.88], [0.56,  0.00],
			[0.60, -0.78], [0.64,  0.00], [0.68, -0.62], [0.72,  0.00],
			[0.76,  0.58], [0.80,  0.00], [0.84,  0.44], [0.88,  0.00],
			[0.93, -0.38], [1.00,  0.00],
		],
	];

	const LINES: { y: number; shift: number; design: number }[] = [
		{ y: 0.09,  shift: 0,    design: 0 },
		{ y: 0.33,  shift: 680,  design: 1 },
		{ y: 0.61,  shift: 290,  design: 2 },
		{ y: 0.87,  shift: 1130, design: 3 },
	];

	let vh = $state(900);
	const maxAmp = $derived(vh * 0.06);

	function ampAt(frac: number, design: [number, number][]): number {
		for (let i = 1; i < design.length; i++) {
			const [f0, a0] = design[i - 1];
			const [f1, a1] = design[i];
			if (frac <= f1) return a0 + ((frac - f0) / (f1 - f0)) * (a1 - a0);
		}
		return 0;
	}

	function makePath(cy: number, xShift: number, design: [number, number][], amp: number): string {
		const pts: string[] = [];
		for (let x = 0; x <= TILE_W * NUM_TILES; x += 3) {
			const xInTile = (x + xShift) % TILE_W;
			let y = cy;
			if (xInTile >= WAVE_START && xInTile <= WAVE_END) {
				const frac = (xInTile - WAVE_START) / (WAVE_END - WAVE_START);
				y = cy - ampAt(frac, design) * amp;
			}
			pts.push(`${pts.length === 0 ? 'M' : 'L'}${x},${y.toFixed(1)}`);
		}
		return pts.join(' ');
	}

	const paths = $derived(LINES.map(l => makePath(l.y * vh, l.shift, DESIGNS[l.design], maxAmp)));
</script>

<style>
	.wave-scroll {
		animation: wave-scroll 45s linear infinite;
		will-change: transform;
	}
	@keyframes wave-scroll {
		from { transform: translateX(0px); }
		to   { transform: translateX(-1200px); }
	}
</style>

<div class="min-h-screen" style="background-color: var(--color-surface);">
	<div style="position: fixed; top: {headerH}px; right: 0; bottom: 0; left: 0; overflow: hidden; pointer-events: none; z-index: 0;">
		<div class="wave-scroll">
			<svg width={TILE_W * NUM_TILES} height={vh} xmlns="http://www.w3.org/2000/svg">
				{#each paths as d}
					<path {d} fill="none" stroke="var(--color-primary)"
						stroke-width="1.2" opacity="0.10" stroke-linejoin="miter" stroke-linecap="square" />
				{/each}
			</svg>
		</div>
	</div>

	<header
		bind:this={headerEl}
		class="flex items-center justify-between border-b px-6 py-3"
		style="position: relative; z-index: 1; border-color: var(--color-border);"
	>
		<a href="{base}/" class="flex items-center gap-3 no-underline">
			<HeliconIcon size={36} />
			<span class="text-xl font-bold tracking-tight" style="color: var(--color-text);">
				Helicon
			</span>
		</a>

		<nav class="flex items-center gap-6">
			<a
				href="{base}/attendances"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Shows
			</a>
			<a
				href="{base}/insights"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Insights
			</a>
			<a
				href="{base}/viz/map"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Map
			</a>
			<a
				href="{base}/reports"
				class="text-sm font-medium transition-colors"
				style="color: var(--color-text-muted);"
			>
				Reports
			</a>

			<div class="ml-4 flex items-center gap-1">
				{#each THEMES as theme}
					<button
						onclick={() => setTheme(theme)}
						title={THEME_LABELS[theme]}
						class="h-5 w-5 rounded-full border-2 transition-all"
						style="background-color: {THEME_COLORS[theme]}; border-color: {currentTheme === theme
							? 'var(--color-text)'
							: 'transparent'};"
						data-theme-swatch={theme}
					></button>
				{/each}
			</div>
		</nav>
	</header>

	<main class="px-6 py-8" style="position: relative; z-index: 1;">
		{@render children()}
	</main>
</div>
